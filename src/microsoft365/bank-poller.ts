import { createHash } from "node:crypto";
import XlsxPopulate from "xlsx-populate";
import { importBankRows, type BankImportConfig, type BankMovement } from "../reconciliation/index.ts";
import type { GraphClient } from "./graph-client.ts";

type DriveItem = { id: string; name: string; file?: { mimeType?: string } };
type ListLookup = { value: Array<{ id: string; displayName: string }> };

export type BankPollingConfig = {
  siteId: string; driveId: string; incomingFolder: string; processedFolder: string; errorFolder: string;
  importsList: string; movementsList: string; exceptionsList: string; importConfig: BankImportConfig;
};

export const DEFAULT_BANK_IMPORT_CONFIG: BankImportConfig = {
  schemaVersion: "1.0", debitSign: "negative", defaultCurrency: "EUR",
  columns: { id: "IdMovimiento", bookingDate: "FechaMovimiento", valueDate: "FechaValor", description: "Concepto", amount: "Importe", currency: "Moneda", reference: "Referencia", counterparty: "Contraparte" },
};

function graphPath(value: string): string { return encodeURIComponent(value); }
function folderPath(value: string): string { return value.split("/").filter(Boolean).map(graphPath).join("/"); }

function parseCsv(content: ArrayBuffer): Record<string, unknown>[] {
  const [headerLine, ...lines] = Buffer.from(content).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(delimiter).map((heading) => heading.trim());
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(delimiter)[index]?.trim() ?? ""])));
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
      const result = importBankRows({ sourceFilename: item.name, sourceHash, rows: await parseBankFile(item.name, bytes), config: this.config.importConfig });
      if (!result.accepted) throw new Error(result.issues.map((issue) => issue.message).join("; "));
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
