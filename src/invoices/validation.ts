import type {
  ExtractedInvoice,
  ExtractionConfidence,
  InvoiceValidationConfig,
  InvoiceValidationResult,
  ValidationIssue,
} from "./types.ts";

export const defaultValidationConfig: InvoiceValidationConfig = {
  dueDateRequired: false,
  currencyRequired: false,
  minimumConfidence: 0.8,
  amountToleranceMinorUnits: 1,
};

const ALWAYS_REQUIRED: Array<keyof ExtractedInvoice> = [
  "supplierName", "invoiceNumber", "invoiceDate", "taxableBase", "vatAmount", "totalAmount",
];
const AMOUNTS: Array<keyof ExtractedInvoice> = ["taxableBase", "vatAmount", "totalAmount"];
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const DECIMAL = /^-?\d+(?:[.,]\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toMinorUnits(value: string): number | undefined {
  if (!DECIMAL.test(value)) return undefined;
  const normalized = value.replace(",", ".");
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0")));
}

export function validateInvoice(
  invoice: ExtractedInvoice,
  confidence: ExtractionConfidence = {},
  config: InvoiceValidationConfig = defaultValidationConfig,
): InvoiceValidationResult {
  const issues: ValidationIssue[] = [];
  const required = [...ALWAYS_REQUIRED];
  if (config.dueDateRequired) required.push("dueDate");
  if (config.currencyRequired) required.push("currency");

  for (const field of required) {
    if (!invoice[field]?.trim()) issues.push({ code: "required", field, message: `${field} is required` });
  }
  for (const field of ["invoiceDate", "dueDate"] as const) {
    const value = invoice[field];
    if (value && !isRealIsoDate(value)) issues.push({ code: "invalid_date", field, message: `${field} must be a real ISO date` });
  }
  for (const field of AMOUNTS) {
    const value = invoice[field];
    if (value && toMinorUnits(value) === undefined) issues.push({ code: "invalid_amount", field, message: `${field} must have at most two decimals` });
  }
  if (invoice.currency && !CURRENCY.test(invoice.currency)) {
    issues.push({ code: "invalid_currency", field: "currency", message: "currency must be an ISO 4217-style code" });
  }
  for (const [field, value] of Object.entries(confidence) as Array<[keyof ExtractedInvoice, number]>) {
    if (!Number.isFinite(value) || value < config.minimumConfidence) {
      issues.push({ code: "low_confidence", field, message: `${field} confidence is below ${config.minimumConfidence}` });
    }
  }

  const base = invoice.taxableBase && toMinorUnits(invoice.taxableBase);
  const vat = invoice.vatAmount && toMinorUnits(invoice.vatAmount);
  const total = invoice.totalAmount && toMinorUnits(invoice.totalAmount);
  if (base !== undefined && vat !== undefined && total !== undefined && Math.abs(base + vat - total) > config.amountToleranceMinorUnits) {
    issues.push({ code: "amount_mismatch", field: "totalAmount", message: "taxableBase plus vatAmount does not match totalAmount" });
  }

  if (issues.length) return { valid: false, issues };
  return { valid: true, invoice: invoice as Required<Pick<ExtractedInvoice, "supplierName" | "invoiceNumber" | "invoiceDate" | "taxableBase" | "vatAmount" | "totalAmount">> & Pick<ExtractedInvoice, "dueDate" | "currency">, issues: [] };
}
