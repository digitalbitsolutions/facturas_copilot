import type { GraphClient } from "./graph-client.ts";

type Item = { id: string; fields?: Record<string, unknown> };
type Lists = { value: Array<{ id: string; displayName: string }> };
type Items = { value: Item[] };
type PaymentState = "Pendiente" | "Programado" | "Parcial" | "Pagada" | "EnRevision" | "Cancelada";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const flag = (value: unknown) => value === true || text(value).toLowerCase() === "true" || text(value).toLowerCase() === "si" || text(value).toLowerCase() === "sí";
const key = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const path = (value: string) => encodeURIComponent(value);
const sitePath = (value: string) => value.split(",").map(path).join(",");

export type PaymentQueryProjectorConfig = {
  siteId: string; invoicesList: string; forecastsList: string; reconciliationsList: string; movementsList: string; queryList: string;
};

/** Builds one SharePoint row per payable invoice/forecast for operational and Copilot queries. */
export class SharePointPaymentQueryProjector {
  private readonly ids = new Map<string, string>();
  private readonly graph: GraphClient;
  private readonly config: PaymentQueryProjectorConfig;
  constructor(graph: GraphClient, config: PaymentQueryProjectorConfig) { this.graph = graph; this.config = config; }

  private async listId(name: string): Promise<string> {
    const cached = this.ids.get(name); if (cached) return cached;
    const lists = await this.graph.request<Lists>(`/sites/${sitePath(this.config.siteId)}/lists?$select=id,displayName`);
    const found = lists.value.find((list) => list.displayName === name);
    if (!found) throw new Error(`SharePoint list '${name}' was not found`);
    this.ids.set(name, found.id); return found.id;
  }
  private async all(name: string): Promise<Item[]> {
    return (await this.graph.request<Items>(`/sites/${sitePath(this.config.siteId)}/lists/${path(await this.listId(name))}/items?%24expand=fields`, { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } })).value;
  }
  private async save(item: Item | undefined, fields: Record<string, unknown>): Promise<void> {
    const id = await this.listId(this.config.queryList);
    const sanitized = { ...fields };
    for (const dateField of ["FechaFactura", "FechaVencimiento", "FechaPagoPrevista", "FechaUltimoPago"]) if (!sanitized[dateField]) delete sanitized[dateField];
    if (item) await this.graph.request(`/sites/${sitePath(this.config.siteId)}/lists/${path(id)}/items/${path(item.id)}/fields`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(sanitized) });
    else await this.graph.request(`/sites/${sitePath(this.config.siteId)}/lists/${path(id)}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: sanitized }) });
  }
  private async remove(item: Item): Promise<void> {
    const id = await this.listId(this.config.queryList);
    await this.graph.request(`/sites/${sitePath(this.config.siteId)}/lists/${path(id)}/items/${path(item.id)}`, { method: "DELETE" });
  }

  async run(): Promise<{ projected: number }> {
    const [invoices, forecasts, reconciliations, movements, existing] = await Promise.all([
      this.all(this.config.invoicesList), this.all(this.config.forecastsList), this.all(this.config.reconciliationsList), this.all(this.config.movementsList), this.all(this.config.queryList),
    ]);
    const movementById = new Map(movements.map((item) => [text(item.fields?.MovimientoId), item]));
    const existingByKey = new Map(existing.map((item) => [text(item.fields?.ConsultaId), item]));
    const projected = new Set<string>();
    const invoiceKeys = new Set<string>();
    for (const invoice of invoices) {
      const f = invoice.fields ?? {}; const processId = text(f.ProcessId); if (!processId) continue;
      if (flag(f.ExcluirDePagos)) continue;
      const supplier = text(f.Proveedor); const invoiceNumber = text(f.NumeroFactura); const matchKey = `${key(supplier)}|${key(invoiceNumber)}`; invoiceKeys.add(matchKey);
      const forecast = forecasts.find((candidate) => `${key(text(candidate.fields?.Proveedor))}|${key(text(candidate.fields?.NumeroFactura))}` === matchKey);
      const confirmed = reconciliations.filter((record) => text(record.fields?.FacturaIdPropuesta) === processId && text(record.fields?.Estado) === "Conciliada");
      const pendingReview = reconciliations.some((record) => text(record.fields?.FacturaIdPropuesta) === processId && text(record.fields?.Estado) === "PendienteRevision");
      const paid = confirmed.reduce((sum, record) => sum + Math.abs(number(movementById.get(text(record.fields?.MovimientoId))?.fields?.ImporteMenor)), 0);
      const total = Math.round(number(f.Total) * 100); const forecastFields = forecast?.fields ?? {};
      const forecastStatus = text(forecastFields.Estado); const state: PaymentState = paid >= total && total > 0 ? "Pagada" : paid > 0 ? "Parcial" : pendingReview ? "EnRevision" : forecastStatus === "Cancelado" ? "Cancelada" : forecastStatus === "Programado" || text(forecastFields.FechaPagoPrevista) ? "Programado" : "Pendiente";
      const consultaId = `invoice:${processId}`; projected.add(consultaId);
      await this.save(existingByKey.get(consultaId), { Title: `${supplier} ${invoiceNumber}`.trim(), ConsultaId: consultaId, ProcessId: processId, PrevisionId: text(forecastFields.PrevisionId), Proveedor: supplier, NumeroFactura: invoiceNumber, FechaFactura: text(f.FechaFactura), FechaVencimiento: text(f.FechaVencimiento), ImporteFacturaMenor: total, FechaPagoPrevista: text(forecastFields.FechaPagoPrevista), ImportePagoPrevistoMenor: number(forecastFields.ImportePagoPrevistoMenor), ImportePagadoMenor: paid, ImportePendienteMenor: Math.max(0, total - paid), Moneda: text(f.Moneda) || text(forecastFields.Moneda), EstadoPago: state, FechaUltimoPago: confirmed.map((record) => text(record.fields?.FechaDecision)).sort().at(-1) ?? "", ReferenciasBancarias: confirmed.map((record) => text(movementById.get(text(record.fields?.MovimientoId))?.fields?.Referencia)).filter(Boolean).join(", "), FacturaUrl: text(f.DocumentoUrl), Conciliaciones: confirmed.map((record) => record.id).join(","), ActualizadoEn: new Date().toISOString() });
    }
    for (const forecast of forecasts) {
      const f = forecast.fields ?? {}; const matchKey = `${key(text(f.Proveedor))}|${key(text(f.NumeroFactura))}`; if (invoiceKeys.has(matchKey)) continue;
      const consultaId = `forecast:${text(f.PrevisionId)}`; if (!text(f.PrevisionId)) continue; projected.add(consultaId);
      await this.save(existingByKey.get(consultaId), { Title: `${text(f.Proveedor)} ${text(f.NumeroFactura)}`.trim(), ConsultaId: consultaId, PrevisionId: text(f.PrevisionId), Proveedor: text(f.Proveedor), NumeroFactura: text(f.NumeroFactura), FechaFactura: text(f.FechaFactura), FechaVencimiento: text(f.FechaVencimiento), ImporteFacturaMenor: number(f.ImporteFacturaMenor), FechaPagoPrevista: text(f.FechaPagoPrevista), ImportePagoPrevistoMenor: number(f.ImportePagoPrevistoMenor), ImportePagadoMenor: 0, ImportePendienteMenor: number(f.ImportePagoPrevistoMenor), Moneda: text(f.Moneda), EstadoPago: text(f.Estado) === "Cancelado" ? "Cancelada" : text(f.Estado) === "Parcial" ? "Parcial" : "Programado", ActualizadoEn: new Date().toISOString() });
    }
    for (const item of existing) if (text(item.fields?.ConsultaId) && !projected.has(text(item.fields?.ConsultaId))) await this.remove(item);
    return { projected: projected.size };
  }
}
