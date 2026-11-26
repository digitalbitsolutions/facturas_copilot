/**
 * Política de fecha de vencimiento.
 *
 * NO modifica el umbral de confianza (0,65) ni acepta fechas inciertas:
 *  - Campo con confianza >= 0,65  -> "ok" (comportamiento actual).
 *  - Confianza baja o campo ausente, y el documento NO declara vencimiento ni condiciones de pago
 *    -> "not_stated": se descarta el valor dudoso y dueDate queda en null (no es una fecha incierta, es ausencia).
 *  - Confianza baja o campo ausente, pero el documento SÍ muestra indicios de vencimiento
 *    -> "review": se mantiene la revisión (EX-06), como hasta ahora.
 */
export const DUE_DATE_MIN_CONFIDENCE = 0.65;

export interface DueDateField {
  value?: string | null;
  content?: string | null;
  confidence?: number | null;
}

export type DueDateDecision =
  | { status: "ok"; dueDate: string; confidence: number }
  | { status: "not_stated" }
  | { status: "review"; reason: "due_date_indicators_present_but_unverified" };

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

// Indicios de que el documento declara un vencimiento o condiciones de pago a plazo (es / ca / en).
// Ante la duda se prefiere "review": un falso indicio solo mantiene la revisión manual.
const INDICATORS: RegExp[] = [
  /\bvencim/,                       // vencimiento(s), vencimient...; venciment (ca)
  /\bvencid/,                       // vencida, vencido
  /\bvto\b/,
  /\bdue date\b/, /\bpayment (due|terms)\b/,
  /\bfecha (limite )?de pago\b/, /\bdata (limit de )?pagament\b/,
  /\bforma de pago\b/, /\bforma de pagament\b/,
  /\bcondiciones de pago\b/, /\bcondicions de pagament\b/,
  /\bplazo de pago\b/, /\bpagadero\b/,
  /\b\d+ dias( fecha| f\/f)?\b/, /\b(?:a\s+)?\d+\s+dies\s+data\b/,
  /\bgiro\b/, /\bdomiciliad/, /\brecibo\b/,
];

// A bank-details footer is not a payment term or a due date. OCR sometimes
// normalizes the Catalan heading "Dades de pagament" as "Data de pagament".
// OCR and the invoice model can omit the connecting "de" or add intervening
// labels. Any bank-details heading still requires both concepts, while an
// actual due-date term is evaluated independently below.
const BANK_DETAILS = /\b(?:dades?|data|datos)\b[^\r\n]{0,80}\b(?:pagament|pago)\b/i;
const PAYMENT_DETAILS_HEADING = /\b(?:forma|m[eé]todo) de (?:pagament|pago)\b/i;
// Strip only the immediate payment phrase so explicit terms in the same OCR paragraph remain visible.
const IMMEDIATE_PAYMENT = /\bforma de (?:pago|pagament)\s*:?\s*(?:transf\w*\.?[ _-]*)?(?:al[ _-]+)?contado\b/g;
const IBAN = /\bIBAN\b/i;
const PAYMENT_TERM = /\b(?:vencim|vto\b|plazo|pagadero|giro|domiciliad|condici|\d+\s*d[ií]as?)\b/i;

/**
 * @param field         campo dueDate de prebuilt-invoice (valor ya normalizado + confianza)
 * @param documentText  texto completo de LA factura (no de un PDF con varias facturas)
 */
export function decideDueDate(field: DueDateField | null | undefined, documentText: string): DueDateDecision {
  const value = field?.value ?? null;
  const conf = field?.confidence ?? null;
  if (value && conf !== null && conf >= DUE_DATE_MIN_CONFIDENCE) {
    return { status: "ok", dueDate: value, confidence: conf };
  }
  const lines = documentText.split(/\r?\n/);
  const bankDetailLines = new Set<number>();
  const hasIban = lines.some((line) => IBAN.test(line));
  lines.forEach((line, index) => {
    if (BANK_DETAILS.test(line)) bankDetailLines.add(index);
    // A bare payment-method heading alongside bank account details describes
    // the remittance footer, not a payment term. Keep it if it states an
    // actual deadline, term, giro or domiciliation.
    if (hasIban && PAYMENT_DETAILS_HEADING.test(line) && !PAYMENT_TERM.test(line)) bankDetailLines.add(index);
    if (!IBAN.test(line)) return;
    bankDetailLines.add(index);
    // Invoice models sometimes turn the harmless bank footer into a separate
    // "Forma de pagament" heading immediately before its IBAN. It is not a
    // due-date term unless another explicit term remains in the document.
    for (let previous = index - 1; previous >= Math.max(0, index - 2); previous -= 1) {
      if (BANK_DETAILS.test(lines[previous]) || (PAYMENT_DETAILS_HEADING.test(lines[previous]) && !PAYMENT_TERM.test(lines[previous]))) bankDetailLines.add(previous);
    }
  });
  const t = norm(lines.filter((_line, index) => !bankDetailLines.has(index)).join("\n")).replace(IMMEDIATE_PAYMENT, " ");
  return INDICATORS.some((re) => re.test(t))
    ? { status: "review", reason: "due_date_indicators_present_but_unverified" }
    : { status: "not_stated" };
}
