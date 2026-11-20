import { normalizeSupplierName, normalizeTaxId } from "./supplier-identity.ts";
import type { RecipientMasterRecord } from "./recipient-identity.ts";
import type { ExtractedInvoice, ExtractionConfidence, FieldAuditEntry, FieldSources, InvoiceField, InvoiceValidationConfig } from "./types.ts";

const HEADER_LINES = 15;
// Invoice headers can place document, delivery and supplier labels between the
// billed recipient and its NIF; the master name and full NIF remain mandatory.
const NIF_NAME_WINDOW = 20;
const MAX_EVIDENCE_CHARS = 160;
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const LONG_DATE = "(\\d{1,2})\\s+de\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\s+de\\s+(\\d{4})";
const NUMERIC_DATE = "(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{4})";
const EXACT_LONG = new RegExp(`^${LONG_DATE}\\.?$`, "i");
const EXACT_NUMERIC = new RegExp(`^${NUMERIC_DATE}\\.?$`);
const LABELLED = /\bfecha\s+(?:de\s+)?(?:factura|emisi[oó]n|expedici[oó]n)\s*[:\-]?\s*(.+)$/i;
const PLACE_DATE = new RegExp(`^(\\p{L}[\\p{L}' .\\-]{1,40}?),\\s*(?:a\\s+)?(${LONG_DATE})\\.?$`, "iu");
const NOT_A_PLACE = /vencim|vence|pago|cobro|domicili|factura|fecha/i;
const PAYMENT_CONTEXT = /vencim|vence\b|pago|cobro|domicili/i;

type Evidence = FieldAuditEntry["evidence"];
export type DateCorroboration = { value: string; rule: "invoice_date_labelled_v1" | "invoice_date_place_date_v1"; evidence: Evidence };
export type RecipientCorroboration = { recipient: RecipientMasterRecord; evidence: Evidence };
export type CorroborationResult = { invoice: ExtractedInvoice; fieldSources: FieldSources; audit: FieldAuditEntry[] };

function iso(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined;
}
function parseExactDate(value: string): string | undefined {
  const long = EXACT_LONG.exec(value.trim());
  if (long) return iso(Number(long[3]), MONTHS[long[2].toLowerCase()] ?? 0, Number(long[1]));
  const numeric = EXACT_NUMERIC.exec(value.trim());
  return numeric ? iso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1])) : undefined;
}
function evidenceLine(line: number, text: string): Evidence[number] { return { line, text: text.slice(0, MAX_EVIDENCE_CHARS) }; }

/** Requires an explicit invoice label or a place-date header within the first fifteen non-empty lines. */
export function corroborateInvoiceDate(text: string): DateCorroboration | undefined {
  const candidates: DateCorroboration[] = [];
  let nonEmpty = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    nonEmpty += 1;
    if (PAYMENT_CONTEXT.test(line)) continue;
    const labelled = LABELLED.exec(line);
    if (labelled) {
      const value = parseExactDate(labelled[1]);
      if (value) candidates.push({ value, rule: "invoice_date_labelled_v1", evidence: [evidenceLine(index + 1, line)] });
      continue;
    }
    if (nonEmpty > HEADER_LINES) continue;
    const placeDate = PLACE_DATE.exec(line);
    if (placeDate && !NOT_A_PLACE.test(placeDate[1])) {
      const value = parseExactDate(placeDate[2]);
      if (value) candidates.push({ value, rule: "invoice_date_place_date_v1", evidence: [evidenceLine(index + 1, line)] });
    }
  }
  return new Set(candidates.map(({ value }) => value)).size === 1 ? candidates[0] : undefined;
}

function nifPattern(taxId: string): RegExp {
  const chars = normalizeTaxId(taxId).split("");
  return new RegExp(`(?<![A-Za-z0-9])(?:ES[ .\\-]?)?${chars.join("[ .\\-]?")}(?![A-Za-z0-9])`, "i");
}

/** Requires exactly one active master whose complete NIF token and name are near each other. */
export function corroborateRecipient(text: string, recipients: RecipientMasterRecord[], supplierTaxId?: string): RecipientCorroboration | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const normalizedLines = lines.map((line) => ` ${normalizeSupplierName(line)} `);
  const supplier = supplierTaxId ? normalizeTaxId(supplierTaxId) : undefined;
  const matches: RecipientCorroboration[] = [];
  for (const recipient of recipients.filter(({ active }) => active)) {
    if (!recipient.taxId || normalizeTaxId(recipient.taxId) === supplier) continue;
    const nifLines = lines.flatMap((line, index) => nifPattern(recipient.taxId!).test(line) ? [index] : []);
    const names = [recipient.legalName, ...(recipient.aliases ?? [])].map(normalizeSupplierName).filter(Boolean);
    const nameLines = normalizedLines.flatMap((line, index) => names.some((name) => line.includes(` ${name} `)) ? [index] : []);
    const pair = nifLines.flatMap((n) => nameLines.map((m) => [n, m] as const)).find(([n, m]) => Math.abs(n - m) <= NIF_NAME_WINDOW);
    if (pair) matches.push({ recipient, evidence: [...new Set(pair)].sort((a, b) => a - b).map((line) => evidenceLine(line + 1, lines[line])) });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export function applyTextCorroboration(input: {
  invoice: ExtractedInvoice; confidence: ExtractionConfidence; text?: string;
  recipients: RecipientMasterRecord[]; config: InvoiceValidationConfig;
}): CorroborationResult {
  const { invoice, confidence, text, recipients, config } = input;
  const result: CorroborationResult = { invoice: { ...invoice }, fieldSources: {}, audit: [] };
  if (!text) return result;
  const threshold = (field: InvoiceField) => config.minimumConfidenceByField?.[field] ?? config.minimumConfidence;
  const deficient = (field: "recipientName" | "recipientTaxId" | "invoiceDate") => !invoice[field]?.trim() || !((confidence[field] ?? -Infinity) >= threshold(field));
  const record = (field: FieldAuditEntry["field"], value: string, rule: FieldAuditEntry["rule"], evidence: Evidence) => {
    const previous = { ...(invoice[field] ? { value: invoice[field] } : {}), ...(confidence[field] !== undefined ? { confidence: confidence[field] } : {}) };
    result.invoice[field] = value;
    result.fieldSources[field] = "text_fallback";
    result.audit.push({ field, fieldSource: "text_fallback", rule, evidence, ...(Object.keys(previous).length ? { previous } : {}) });
  };
  if (deficient("invoiceDate")) {
    const date = corroborateInvoiceDate(text);
    if (date && (!invoice.invoiceDate?.trim() || invoice.invoiceDate === date.value)) record("invoiceDate", date.value, date.rule, date.evidence);
  }
  const found = corroborateRecipient(text, recipients, invoice.supplierTaxId);
  if (!found) return result;
  const recipient = found.recipient;
  const names = [recipient.legalName, ...(recipient.aliases ?? [])].map(normalizeSupplierName);
  const exactRecipientTaxId = Boolean(invoice.recipientTaxId && recipient.taxId && normalizeTaxId(invoice.recipientTaxId) === normalizeTaxId(recipient.taxId));
  const taxConflict = !deficient("recipientTaxId") && !exactRecipientTaxId;
  const nameConflict = !deficient("recipientName") && !names.includes(normalizeSupplierName(invoice.recipientName ?? ""));
  const canCorrectConflictingName = nameConflict && exactRecipientTaxId;
  if (taxConflict || (nameConflict && !canCorrectConflictingName)) return result;
  if (deficient("recipientTaxId") && recipient.taxId) record("recipientTaxId", recipient.taxId, "recipient_nif_name_proximity_v1", found.evidence);
  if (deficient("recipientName") || canCorrectConflictingName) record("recipientName", recipient.legalName, "recipient_nif_name_proximity_v1", found.evidence);
  return result;
}
