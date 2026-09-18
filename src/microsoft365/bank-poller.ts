import { createHash } from "node:crypto";
import XlsxPopulate from "xlsx-populate";
import { importBankRows, type BankImportConfig, type BankMovement } from "../reconciliation/index.ts";
import type { GraphClient } from "./graph-client.ts";

type DriveItem = { id: string; name: string; file?: { mimeType?: string } };
type ListLookup = { value: Array<{ id: string; displayName: string }> };
type ListItems = { value: Array<{ id: string; fields?: Record<string, unknown> }> };

export type BankPollingConfig = {
  siteId: string; driveId: string; incomingFolder: string; processedFolder: string; errorFolder: string;
  importsList: string; movementsList: string; exceptionsList: string; importConfig: BankImportConfig;
};

const STANDARD_ES_V1: BankImportConfig = {
  schemaVersion: "standard-es-v1", debitSign: "negative", defaultCurrency: "EUR",
  columns: { id: "IdMovimiento", bookingDate: "FechaMovimiento", valueDate: "FechaValor", description: "Concepto", amount: "Importe", currency: "Moneda", reference: "Referencia", counterparty: "Contraparte" },
};

const BANKINTER_SIMULATED_CSV_V1: BankImportConfig = {
  schemaVersion: "bankinter-simulated-csv-v1", debitSign: "preserve", defaultCurrency: "EUR",
  columns: { bookingDate: "fecha_operacion", valueDate: "fecha_valor", description: "concepto", amount: "importe", currency: "moneda", reference: "referencia_bancaria", counterparty: "contraparte" },
};

const BANK_IMPORT_PROFILES: Record<string, BankImportConfig> = {
  "standard-es-v1": STANDARD_ES_V1,
  "bankinter-simulated-csv-v1": BANKINTER_SIMULATED_CSV_V1,
};

/** Backward-compatible profile used unless an explicit version is configured. */
export const DEFAULT_BANK_IMPORT_CONFIG = STANDARD_ES_V1;

export function bankImportConfigForProfile(profile = "standard-es-v1"): BankImportConfig {
  const config = BANK_IMPORT_PROFILES[profile];
  if (!config) throw new Error(`Unsupported BANK_IMPORT_PROFILE '${profile}'. Supported profiles: ${Object.keys(BANK_IMPORT_PROFILES).join(", ")}`);
  return structuredClone(config);
}

function graphPath(value: string): string { return encodeURIComponent(value); }
function folderPath(value: string): string { return value.split("/").filter(Boolean).map(graphPath).join("/"); }

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(content: ArrayBuffer): Record<string, unknown>[] {
  const [headerLine, ...lines] = Buffer.from(content).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = parseCsvLine(headerLine, delimiter);
  return lines.map((line) => {
    const values = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

/** Reads the first worksheet. The heading row must use the configured column names. */
export async function parseBankFile(name: string, content: ArrayBuffer): Promise<Record<string, unknown>[]> {
  if (!/\.(xlsx|xls|csv)$/i.test(name)) throw new Error("Only .xlsx, .xls, and .csv bank extracts are supported");
  if (/\.csv$/i.test(name)) return parseCsv(content);
  const workbook = await XlsxPopulate.fromDataAsync(Buffer.from(content));
  const sheet = workbook.sheet(0);
  if (!sheet) throw new Error("The bank extract does not contain a worksheet");
  const values = sheet.usedRange().value() as unknown[][];
  const [headings = [], ...rows] = values;
  const headers = headings.map((heading) => String(heading ?? "").trim());
  return rows.filter((row) => row.some((value) => value !== undefined && value !== null && value !== "")).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export class SharePointBankPoller {
  private readonly listIds = new Map<string, string>();
  private readonly graph: GraphClient;
  private readonly config: BankPollingConfig;

  constructor(graph: GraphClient, config: BankPollingConfig) {
    this.graph = graph;
    this.config = config;
  }

  private async listId(name: string): Promise<string> {
    const cached = this.listIds.get(name);
    if (cached) return cached;
    const lists = await this.graph.request<ListLookup>(`/sites/${graphPath(this.config.siteId)}/lists?$select=id,displayName`);
    const list = lists.value.find((candidate) => candidate.displayName === name);
    if (!list) throw new Error(`SharePoint list '${name}' was not found`);
    this.listIds.set(name, list.id);
    return list.id;
  }

  private async addListItem(listName: string, fields: Record<string, unknown>): Promise<void> {
    const listId = await this.listId(listName);
    await this.graph.request(`/sites/${graphPath(this.config.siteId)}/lists/${graphPath(listId)}/items`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }),
    });
  }

  private async items(listName: string, field: string, value: string): Promise<ListItems["value"]> {
    const listId = await this.listId(listName);
    const response = await this.graph.request<ListItems>(
      `/sites/${graphPath(this.config.siteId)}/lists/${graphPath(listId)}/items?%24expand=fields`,
      { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } },
    );
    return response.value.filter((item) => String(item.fields?.[field] ?? "") === value);
  }

  private async move(item: DriveItem, targetFolder: string): Promise<void> {
    await this.graph.request(`/drives/${graphPath(this.config.driveId)}/items/${graphPath(item.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentReference: { path: `/drives/${this.config.driveId}/root:/${folderPath(targetFolder)}` } }),
    });
  }

  private async saveMovement(movement: BankMovement, sourceFilename: string): Promise<void> {
    await this.addListItem(this.config.movementsList, {
      Title: movement.movementId, MovimientoId: movement.movementId, LoteId: movement.batchId, ArchivoOrigen: sourceFilename,
      FechaMovimiento: movement.bookingDate, FechaValor: movement.valueDate ?? "", Concepto: movement.descriptionOriginal,
      ImporteMenor: movement.amountMinor, Moneda: movement.currency, Referencia: movement.reference ?? "",
      Contraparte: movement.counterparty ?? "", Huella: movement.fingerprint, Estado: "Importado",
    });
  }

  private async process(item: DriveItem): Promise<"processed" | "error"> {
    try {
      const content = await this.graph.requestResponse(`/drives/${graphPath(this.config.driveId)}/items/${graphPath(item.id)}/content`);
      const bytes = await content.arrayBuffer();
      const sourceHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
      if ((await this.items(this.config.importsList, "HashOrigen", sourceHash)).length) {
        await this.move(item, this.config.processedFolder);
        return "processed";
      }
      const rows = await parseBankFile(item.name, bytes);
      const initial = importBankRows({ sourceFilename: item.name, sourceHash, rows, config: this.config.importConfig });
      if (!initial.accepted) throw new Error(initial.issues.map((issue) => issue.message).join("; "));
      const knownFingerprints = new Set<string>();
      for (const movement of initial.batch.movements) {
        if ((await this.items(this.config.movementsList, "Huella", movement.fingerprint)).length) knownFingerprints.add(movement.fingerprint);
      }
      const result = importBankRows({ sourceFilename: item.name, sourceHash, rows, config: this.config.importConfig, knownFingerprints });
      if (!result.accepted) throw new Error(result.issues.map((issue) => issue.message).join("; "));
      if (result.batch.movements.length === 0) {
        await this.move(item, this.config.processedFolder);
        return "processed";
      }
      await this.addListItem(this.config.importsList, {
        Title: result.batch.batchId, LoteId: result.batch.batchId, ArchivoOrigen: item.name, HashOrigen: sourceHash,
        Estado: "Importado", FilasLeidas: result.batch.rowCount, MovimientosImportados: result.batch.movements.length,
        FechaImportacion: result.batch.importedAt,
      });
      for (const movement of result.batch.movements) await this.saveMovement(movement, item.name);
      await this.move(item, this.config.processedFolder);
      return "processed";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bank import error";
      await this.addListItem(this.config.exceptionsList, {
        Title: `BANK_IMPORT_${item.id}`, Codigo: "BANK_IMPORT_FAILED", EntidadTipo: "Lote", EntidadId: item.id,
        Estado: "Abierta", Motivo: `${item.name}: ${message}`.slice(0, 63_000), Reintentable: false,
        CorrelationId: item.id, FechaDeteccion: new Date().toISOString(),
      });
      await this.move(item, this.config.errorFolder);
      return "error";
    }
  }

  async run(): Promise<{ found: number; processed: number; errors: number }> {
    const folder = folderPath(this.config.incomingFolder);
    const response = await this.graph.request<{ value: DriveItem[] }>(`/drives/${graphPath(this.config.driveId)}/root:/${folder}:/children?$select=id,name,file`);
    const files = response.value.filter((item) => item.file && /\.(xlsx|xls|csv)$/i.test(item.name));
    let processed = 0; let errors = 0;
    for (const item of files) {
      if (await this.process(item) === "processed") processed += 1; else errors += 1;
    }
    return { found: files.length, processed, errors };
  }
}
