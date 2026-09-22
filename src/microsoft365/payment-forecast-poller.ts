import { importPaymentForecastRows, parsePaymentForecastFile, paymentForecastSourceHash, type PaymentForecast } from "../payment-forecasts/index.ts";
import { normalizeDate } from "../reconciliation/normalization.ts";
import { GraphError, type GraphClient } from "./graph-client.ts";

type DriveItem = { id: string; name: string; file?: { mimeType?: string } };
type ListLookup = { value: Array<{ id: string; displayName: string }> };
type ListItems = { value: Array<{ id: string; fields?: Record<string, unknown> }> };

export type PaymentForecastPollingConfig = {
  siteId: string; driveId: string; incomingFolder: string; processedFolder: string; errorFolder: string;
  importsList: string; forecastsList: string; historyList: string; exceptionsList: string;
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
  private async items(list: string, field?: string, value?: string): Promise<ListItems["value"]> {
    const id = await this.listId(list);
    // SharePoint rejects some OData filters on custom list columns with HTTP 400,
    // even when the column is indexed. Read the small operational lists and compare
    // locally, as we do for bank-import idempotency checks.
    const response = await this.graph.request<ListItems>(
      `/sites/${path(this.config.siteId)}/lists/${path(id)}/items?%24expand=fields`,
      { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } },
    );
    return field === undefined ? response.value : response.value.filter((item) => String(item.fields?.[field] ?? "") === value);
  }
  private async add(list: string, fields: Record<string, unknown>): Promise<void> {
    const id = await this.listId(list);
    await this.graph.request(`/sites/${path(this.config.siteId)}/lists/${path(id)}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }) });
  }
  private async update(list: string, itemId: string, fields: Record<string, unknown>): Promise<void> {
    const id = await this.listId(list);
    await this.graph.request(`/sites/${path(this.config.siteId)}/lists/${path(id)}/items/${path(itemId)}/fields`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
  }
  private async move(item: DriveItem, target: string): Promise<void> {
    const targetPath = `/drives/${this.config.driveId}/root:/${folder(target)}`;
    const request = (name?: string) => this.graph.request(`/drives/${path(this.config.driveId)}/items/${path(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentReference: { path: targetPath }, ...(name ? { name } : {}) }) });
    try { await request(); }
    catch (error) {
      if (!(error instanceof GraphError) || error.status !== 409) throw error;
      const extension = item.name.match(/(\.[^.]+)$/)?.[1] ?? "";
      const base = extension ? item.name.slice(0, -extension.length) : item.name;
      await request(`${base}--${item.id.slice(-8)}${extension}`);
    }
  }
  private fields(forecast: PaymentForecast, filename: string): Record<string, unknown> {
    const fields: Record<string, unknown> = { Title: forecast.previsionId, PrevisionId: forecast.previsionId, ClavePrevision: forecast.forecastKey, LoteId: forecast.batchId, ArchivoOrigen: filename, NumeroFactura: forecast.invoiceNumber, Proveedor: forecast.supplierName, NIFProveedor: forecast.supplierTaxId ?? "", FechaFactura: forecast.invoiceDate, ImporteFacturaMenor: forecast.invoiceAmountMinor, Moneda: forecast.currency, ImportePagoPrevistoMenor: forecast.plannedPaymentAmountMinor, Estado: forecast.status, RequiereRevision: forecast.requiresReview, ReferenciaPago: forecast.paymentReference ?? "", MetodoPago: forecast.paymentMethod ?? "", Observaciones: forecast.notes ?? "", FuenteDocumento: forecast.sourceDocument ?? "", ConfianzaExtraccion: forecast.extractionConfidence ?? "" };
    if (forecast.dueDate) fields.FechaVencimiento = forecast.dueDate;
    if (forecast.plannedPaymentDate) fields.FechaPagoPrevista = forecast.plannedPaymentDate;
    return fields;
  }
  private equal(existing: Record<string, unknown>, fields: Record<string, unknown>): boolean {
    // The import batch and source filename change for every upload; they are audit
    // metadata, not a business change to the forecast itself.
    const dateFields = new Set(["FechaFactura", "FechaVencimiento", "FechaPagoPrevista"]);
    const date = (value: unknown) => normalizeDate(value) ?? (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : undefined);
    return Object.entries(fields).filter(([key]) => key !== "LoteId" && key !== "ArchivoOrigen").every(([key, value]) => dateFields.has(key) ? date(existing[key]) === date(value) : String(existing[key] ?? "") === String(value ?? ""));
  }
  private async audit(forecast: PaymentForecast, action: "Creada" | "Actualizada", filename: string, previous?: Record<string, unknown>): Promise<void> {
    await this.add(this.config.historyList, { Title: `${action} ${forecast.previsionId}`, PrevisionId: forecast.previsionId, LoteId: forecast.batchId, ArchivoOrigen: filename, Accion: action, Antes: previous ? JSON.stringify(previous) : "", Despues: JSON.stringify(this.fields(forecast, filename)), Fecha: new Date().toISOString() });
  }
  private async process(item: DriveItem): Promise<"processed" | "error"> {
    try {
      const response = await this.graph.requestResponse(`/drives/${path(this.config.driveId)}/items/${path(item.id)}/content`);
      const bytes = await response.arrayBuffer();
      const rows = await parsePaymentForecastFile(item.name, bytes); const hash = paymentForecastSourceHash(rows);
      if ((await this.items(this.config.importsList, "HashOrigen", hash)).length) { await this.move(item, this.config.processedFolder); return "processed"; }
      const result = importPaymentForecastRows({ sourceFilename: item.name, sourceHash: hash, rows });
      if (!result.accepted) throw new Error(result.issues.map((issue) => issue.message).join("; "));
      const existing = await this.items(this.config.forecastsList);
      const byId = new Map(existing.map((record) => [String(record.fields?.PrevisionId ?? ""), record]));
      let changed = 0;
      for (const forecast of result.batch.forecasts) {
        const fields = this.fields(forecast, item.name); const prior = byId.get(forecast.previsionId);
        if (!prior) { await this.add(this.config.forecastsList, fields); await this.audit(forecast, "Creada", item.name); changed += 1; continue; }
        if (this.equal(prior.fields ?? {}, fields)) continue;
        const updateFields = { ...fields };
        if (!forecast.dueDate) updateFields.FechaVencimiento = null;
        if (!forecast.plannedPaymentDate) updateFields.FechaPagoPrevista = null;
        await this.update(this.config.forecastsList, prior.id, updateFields); await this.audit(forecast, "Actualizada", item.name, prior.fields); changed += 1;
      }
      await this.add(this.config.importsList, { Title: result.batch.batchId, LoteId: result.batch.batchId, ArchivoOrigen: item.name, HashOrigen: hash, Estado: "Importado", FilasLeidas: result.batch.rowCount, PrevisionesImportadas: changed, FechaImportacion: result.batch.importedAt });
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
