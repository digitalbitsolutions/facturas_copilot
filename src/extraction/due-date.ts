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
  /\b\d+ dias( fecha| f\/f)?\b/, /\b\d+ dies( data)?\b/,
  /\bgiro\b/, /\bdomiciliad/, /\brecibo\b/,
];

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
  const t = norm(documentText);
  return INDICATORS.some((re) => re.test(t))
    ? { status: "review", reason: "due_date_indicators_present_but_unverified" }
    : { status: "not_stated" };
}
