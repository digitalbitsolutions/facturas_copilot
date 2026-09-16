import { importPaymentForecastRows, parsePaymentForecastFile, paymentForecastSourceHash, type PaymentForecast } from "../payment-forecasts/index.ts";
import type { GraphClient } from "./graph-client.ts";

type DriveItem = { id: string; name: string; file?: { mimeType?: string } };
type ListLookup = { value: Array<{ id: string; displayName: string }> };
type ListItems = { value: Array<{ id: string; fields?: Record<string, unknown> }> };

export type PaymentForecastPollingConfig = {
  siteId: string; driveId: string; incomingFolder: string; processedFolder: string; errorFolder: string;
  importsList: string; forecastsList: string; exceptionsList: string;
};

function path(value: string): string { return encodeURIComponent(value); }
function folder(value: string): string { return value.split("/").filter(Boolean).map(path).join("/"); }

/** Persists validated forecast batches. It is deliberately not a payment-confirmation workflow. */
export class SharePointPaymentForecastPoller {
  private readonly listIds = new Map<string, string>();
  private readonly graph: GraphClient;
  private readonly config: PaymentForecastPollingConfig;
  constructor(graph: GraphClient, config: PaymentForecastPollingConfig) { this.graph = graph; this.config = config; }

  private async listId(name: string): Promise<string> {
    const cached = this.listIds.get(name); if (cached) return cached;
    const lists = await this.graph.request<ListLookup>(`/sites/${path(this.config.siteId)}/lists?$select=id,displayName`);
    const found = lists.value.find((list) => list.displayName === name);
    if (!found) throw new Error(`SharePoint list '${name}' was not found`);
    this.listIds.set(name, found.id); return found.id;
  }
  private async items(list: string, field: string, value: string): Promise<ListItems["value"]> {
    const id = await this.listId(list);
    const filter = encodeURIComponent(`fields/${field} eq '${value.replace(/'/g, "''")}'`);
    return (await this.graph.request<ListItems>(`/sites/${path(this.config.siteId)}/lists/${path(id)}/items?$expand=fields($select=${field})&$filter=${filter}`)).value;
  }
  private async add(list: string, fields: Record<string, unknown>): Promise<void> {
    const id = await this.listId(list);
    await this.graph.request(`/sites/${path(this.config.siteId)}/lists/${path(id)}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }) });
  }
  private async move(item: DriveItem, target: string): Promise<void> {
    await this.graph.request(`/drives/${path(this.config.driveId)}/items/${path(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentReference: { path: `/drives/${this.config.driveId}/root:/${folder(target)}` } }) });
  }
  private async save(forecast: PaymentForecast, filename: string): Promise<void> {
    await this.add(this.config.forecastsList, { Title: forecast.previsionId, PrevisionId: forecast.previsionId, ClavePrevision: forecast.forecastKey, LoteId: forecast.batchId, ArchivoOrigen: filename, NumeroFactura: forecast.invoiceNumber, Proveedor: forecast.supplierName, NIFProveedor: forecast.supplierTaxId ?? "", FechaFactura: forecast.invoiceDate, FechaVencimiento: forecast.dueDate ?? "", ImporteFacturaMenor: forecast.invoiceAmountMinor, Moneda: forecast.currency, FechaPagoPrevista: forecast.plannedPaymentDate ?? "", ImportePagoPrevistoMenor: forecast.plannedPaymentAmountMinor, Estado: forecast.status, RequiereRevision: forecast.requiresReview, ReferenciaPago: forecast.paymentReference ?? "", MetodoPago: forecast.paymentMethod ?? "", Observaciones: forecast.notes ?? "", FuenteDocumento: forecast.sourceDocument ?? "", ConfianzaExtraccion: forecast.extractionConfidence ?? "" });
  }
  private async process(item: DriveItem): Promise<"processed" | "error"> {
    try {
      const response = await this.graph.requestResponse(`/drives/${path(this.config.driveId)}/items/${path(item.id)}/content`);
      const bytes = await response.arrayBuffer();
      const rows = await parsePaymentForecastFile(item.name, bytes); const hash = paymentForecastSourceHash(rows);
      if ((await this.items(this.config.importsList, "HashOrigen", hash)).length) { await this.move(item, this.config.processedFolder); return "processed"; }
      const knownKeys = new Set<string>(); const knownIds = new Set<string>();
      for (const row of rows) { const existing = await this.items(this.config.forecastsList, "PrevisionId", String(row.PrevisionId)); for (const record of existing) { knownIds.add(String(row.PrevisionId)); const key = record.fields?.ClavePrevision; if (typeof key === "string") knownKeys.add(key); } }
      const result = importPaymentForecastRows({ sourceFilename: item.name, sourceHash: hash, rows, knownForecastKeys: knownKeys, knownPrevisionIds: knownIds });
      if (!result.accepted) throw new Error(result.issues.map((issue) => issue.message).join("; "));
      // A SharePoint/Office rewrite can alter an XLSX package while every business row
      // remains known. Do not create a second audit batch for that no-op replay.
      if (result.batch.forecasts.length === 0) { await this.move(item, this.config.processedFolder); return "processed"; }
      await this.add(this.config.importsList, { Title: result.batch.batchId, LoteId: result.batch.batchId, ArchivoOrigen: item.name, HashOrigen: hash, Estado: "Importado", FilasLeidas: result.batch.rowCount, PrevisionesImportadas: result.batch.forecasts.length, FechaImportacion: result.batch.importedAt });
      for (const forecast of result.batch.forecasts) await this.save(forecast, item.name);
      await this.move(item, this.config.processedFolder); return "processed";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown payment forecast import error";
      await this.add(this.config.exceptionsList, { Title: `PAYMENT_FORECAST_IMPORT_${item.id}`, Codigo: "PAYMENT_FORECAST_IMPORT_FAILED", EntidadTipo: "Lote", EntidadId: item.id, Estado: "Abierta", Motivo: `${item.name}: ${message}`.slice(0, 63_000), Reintentable: false, CorrelationId: item.id, FechaDeteccion: new Date().toISOString() });
      await this.move(item, this.config.errorFolder); return "error";
    }
  }
  async run(): Promise<{ found: number; processed: number; errors: number }> {
    const response = await this.graph.request<{ value: DriveItem[] }>(`/drives/${path(this.config.driveId)}/root:/${folder(this.config.incomingFolder)}:/children?$select=id,name,file`);
    const files = response.value.filter((item) => item.file && /\.xlsx$/i.test(item.name)); let processed = 0; let errors = 0;
    for (const item of files) { if (await this.process(item) === "processed") processed += 1; else errors += 1; }
    return { found: files.length, processed, errors };
  }
}
