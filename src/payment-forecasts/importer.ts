import { normalizeCurrency, normalizeDate, normalizeText, parseMoneyMinor, stableHash } from "../reconciliation/normalization.ts";
import { PAYMENT_FORECAST_COLUMNS, type ForecastConfidence, type PaymentForecast, type PaymentForecastImportIssue, type PaymentForecastImportResult, type PaymentForecastRow, type PaymentForecastStatus } from "./types.ts";

const STATUSES = new Set<PaymentForecastStatus>(["Pendiente", "Programado", "Parcial", "Cancelado"]);
const CONFIDENCES = new Set<ForecastConfidence>(["Alta", "Media", "Baja"]);

/** Stable logical source identity. SharePoint/Office may reserialize an XLSX without changing its rows. */
export function paymentForecastSourceHash(rows: PaymentForecastRow[]): string {
  const dates = new Set(["FechaFactura", "FechaVencimiento", "FechaPagoPrevista"]);
  const amounts = new Set(["ImporteFactura", "ImportePagoPrevisto"]);
  return stableHash(JSON.stringify(rows.map((row) => Object.fromEntries(PAYMENT_FORECAST_COLUMNS.map((column) => {
    const value = row[column];
    if (dates.has(column)) return [column, normalizeDate(value) ?? String(value ?? "").trim()];
    if (amounts.has(column)) return [column, parseMoneyMinor(value) ?? String(value ?? "").trim()];
    return [column, String(value ?? "").trim()];
  })))));
}

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

/**
 * Imports planned supplier payments only. A paid state is deliberately rejected:
 * bank reconciliation and an explicit human decision are the sole payment evidence.
 */
export function importPaymentForecastRows(input: {
  sourceFilename: string;
  sourceHash: string;
  rows: PaymentForecastRow[];
  knownForecastKeys?: ReadonlySet<string>;
  knownPrevisionIds?: ReadonlySet<string>;
  importedAt?: string;
}): PaymentForecastImportResult {
  const batchId = stableHash(input.sourceHash, "payment-forecast-v1");
  const issues: PaymentForecastImportIssue[] = [];
  const headers = new Set(input.rows.flatMap((row) => Object.keys(row)));
  for (const column of PAYMENT_FORECAST_COLUMNS) {
    if (!headers.has(column)) issues.push({ code: "missing_column", column, message: `Required column '${column}' is missing` });
  }
  if (issues.length) return { accepted: false, batchId, issues };

  const forecasts: PaymentForecast[] = [];
  const seen = new Set<string>();
  const seenPrevisionIds = new Set<string>();
  input.rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const previsionId = text(row.PrevisionId);
    const invoiceNumber = text(row.NumeroFactura);
    const supplierName = text(row.Proveedor);
    const invoiceDate = normalizeDate(row.FechaFactura);
    const invoiceAmountMinor = parseMoneyMinor(row.ImporteFactura);
    const currency = normalizeCurrency(row.Moneda);
    const plannedPaymentAmountMinor = parseMoneyMinor(row.ImportePagoPrevisto);
    const statusText = text(row.EstadoPrevision);
    const reviewText = text(row.RequiereRevision);

    for (const [column, value] of [["PrevisionId", previsionId], ["NumeroFactura", invoiceNumber], ["Proveedor", supplierName]] as const) {
      if (!value) issues.push({ code: "missing_value", row: sourceRow, column, message: `${column} is required` });
    }
    if (!invoiceDate) issues.push({ code: "invalid_date", row: sourceRow, column: "FechaFactura", message: "FechaFactura must be a valid date" });
    if (text(row.FechaVencimiento) && !normalizeDate(row.FechaVencimiento)) issues.push({ code: "invalid_date", row: sourceRow, column: "FechaVencimiento", message: "FechaVencimiento must be a valid date when supplied" });
    if (text(row.FechaPagoPrevista) && !normalizeDate(row.FechaPagoPrevista)) issues.push({ code: "invalid_date", row: sourceRow, column: "FechaPagoPrevista", message: "FechaPagoPrevista must be a valid date when supplied" });
    if (invoiceAmountMinor === undefined || invoiceAmountMinor <= 0) issues.push({ code: "invalid_amount", row: sourceRow, column: "ImporteFactura", message: "ImporteFactura must be greater than zero" });
    if (plannedPaymentAmountMinor === undefined || plannedPaymentAmountMinor <= 0) issues.push({ code: "invalid_amount", row: sourceRow, column: "ImportePagoPrevisto", message: "ImportePagoPrevisto must be greater than zero" });
    if (!currency) issues.push({ code: "invalid_currency", row: sourceRow, column: "Moneda", message: "Moneda must be an ISO currency" });
    if (statusText === "Pagado" || statusText === "Pagada") issues.push({ code: "paid_status_forbidden", row: sourceRow, column: "EstadoPrevision", message: "A forecast cannot be imported as paid; payment requires bank reconciliation and human confirmation" });
    else if (!statusText || !STATUSES.has(statusText as PaymentForecastStatus)) issues.push({ code: "invalid_status", row: sourceRow, column: "EstadoPrevision", message: "EstadoPrevision must be Pendiente, Programado, Parcial, or Cancelado" });
    if (statusText === "Programado" && !normalizeDate(row.FechaPagoPrevista)) issues.push({ code: "missing_value", row: sourceRow, column: "FechaPagoPrevista", message: "FechaPagoPrevista is required when EstadoPrevision is Programado" });
    if (reviewText !== "Sí" && reviewText !== "No") issues.push({ code: "invalid_review_flag", row: sourceRow, column: "RequiereRevision", message: "RequiereRevision must be Sí or No" });
    const confidence = text(row.ConfianzaExtraccion);
    if (confidence && !CONFIDENCES.has(confidence as ForecastConfidence)) issues.push({ code: "missing_value", row: sourceRow, column: "ConfianzaExtraccion", message: "ConfianzaExtraccion must be Alta, Media, or Baja when supplied" });
    if (!previsionId || !invoiceNumber || !supplierName || !invoiceDate || invoiceAmountMinor === undefined || invoiceAmountMinor <= 0 || !currency || plannedPaymentAmountMinor === undefined || plannedPaymentAmountMinor <= 0 || !statusText || !STATUSES.has(statusText as PaymentForecastStatus) || (reviewText !== "Sí" && reviewText !== "No")) return;

    const forecastKey = stableHash(previsionId, normalizeText(invoiceNumber), normalizeText(supplierName), normalizeText(text(row.NIFProveedor) ?? ""), invoiceDate, String(plannedPaymentAmountMinor), currency);
    if (seen.has(forecastKey) || seenPrevisionIds.has(previsionId) || input.knownForecastKeys?.has(forecastKey) || input.knownPrevisionIds?.has(previsionId)) {
      issues.push({ code: "duplicate_forecast", row: sourceRow, message: "Forecast identity was already present in this or a previous import" });
      return;
    }
    seen.add(forecastKey);
    seenPrevisionIds.add(previsionId);
    forecasts.push({
      forecastId: stableHash(batchId, forecastKey), forecastKey, batchId, sourceRow, previsionId, invoiceNumber, supplierName,
      supplierTaxId: text(row.NIFProveedor), invoiceDate, dueDate: normalizeDate(row.FechaVencimiento), invoiceAmountMinor, currency,
      plannedPaymentDate: normalizeDate(row.FechaPagoPrevista), plannedPaymentAmountMinor, status: statusText as PaymentForecastStatus,
      paymentReference: text(row.ReferenciaPago), paymentMethod: text(row.MetodoPago), notes: text(row.Observaciones),
      sourceDocument: text(row.FuenteDocumento), extractionConfidence: confidence as ForecastConfidence | undefined, requiresReview: reviewText === "Sí",
    });
  });

  const blocking = issues.some((issue) => issue.code !== "duplicate_forecast");
  if (blocking) return { accepted: false, batchId, issues };
  return { accepted: true, batch: { batchId, sourceFilename: input.sourceFilename, sourceHash: input.sourceHash, schemaVersion: "payment-forecast-v1", importedAt: input.importedAt ?? new Date().toISOString(), rowCount: input.rows.length, forecasts }, issues };
}
