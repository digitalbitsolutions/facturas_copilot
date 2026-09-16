export const PAYMENT_FORECAST_COLUMNS = [
  "PrevisionId", "NumeroFactura", "Proveedor", "NIFProveedor", "FechaFactura", "FechaVencimiento",
  "ImporteFactura", "Moneda", "FechaPagoPrevista", "ImportePagoPrevisto", "EstadoPrevision",
  "ReferenciaPago", "MetodoPago", "Observaciones", "FuenteDocumento", "ConfianzaExtraccion", "RequiereRevision",
] as const;

export type PaymentForecastColumn = typeof PAYMENT_FORECAST_COLUMNS[number];
export type PaymentForecastRow = Record<PaymentForecastColumn, unknown>;
export type PaymentForecastStatus = "Pendiente" | "Programado" | "Parcial" | "Cancelado";
export type ForecastConfidence = "Alta" | "Media" | "Baja";

export type PaymentForecast = {
  forecastId: string;
  forecastKey: string;
  batchId: string;
  sourceRow: number;
  previsionId: string;
  invoiceNumber: string;
  supplierName: string;
  supplierTaxId?: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceAmountMinor: number;
  currency: string;
  plannedPaymentDate?: string;
  plannedPaymentAmountMinor: number;
  status: PaymentForecastStatus;
  paymentReference?: string;
  paymentMethod?: string;
  notes?: string;
  sourceDocument?: string;
  extractionConfidence?: ForecastConfidence;
  requiresReview: boolean;
};

export type PaymentForecastImportIssue = {
  code: "missing_column" | "missing_value" | "invalid_date" | "invalid_amount" | "invalid_currency" | "invalid_status" | "paid_status_forbidden" | "invalid_review_flag" | "duplicate_forecast";
  row?: number;
  column?: PaymentForecastColumn;
  message: string;
};

export type PaymentForecastImportBatch = {
  batchId: string;
  sourceFilename: string;
  sourceHash: string;
  schemaVersion: "payment-forecast-v1";
  importedAt: string;
  rowCount: number;
  forecasts: PaymentForecast[];
};

export type PaymentForecastImportResult =
  | { accepted: true; batch: PaymentForecastImportBatch; issues: PaymentForecastImportIssue[] }
  | { accepted: false; batchId: string; issues: PaymentForecastImportIssue[] };
