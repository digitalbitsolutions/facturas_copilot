import type { DocumentClassification } from "../processing/types.ts";

type Indicator = { pattern: RegExp; weight: number; reason: string };

const BANK_INDICATORS: Indicator[] = [
  { pattern: /\bliquidacion de recibos\b/, weight: 6, reason: "Contains bank receipt-settlement heading" },
  { pattern: /\btotal nominal abonado\b/, weight: 3, reason: "Contains credited nominal total" },
  { pattern: /\bcomisiones?\b/, weight: 1, reason: "Contains commissions" },
  { pattern: /\bintereses?\b/, weight: 1, reason: "Contains interest" },
  { pattern: /\bgastos? (?:de )?correo\b/, weight: 1, reason: "Contains bank postage expenses" },
  { pattern: /\bfecha valor\b/, weight: 1, reason: "Contains bank value date" },
];

const INVOICE_INDICATORS: Indicator[] = [
  { pattern: /\bfactura\b/, weight: 4, reason: "Contains invoice heading" },
  { pattern: /\binvoice\b/, weight: 4, reason: "Contains invoice heading in English" },
  { pattern: /\bbase imponible\b/, weight: 2, reason: "Contains taxable base" },
  { pattern: /\btotal (?:factura|fra)\b/, weight: 2, reason: "Contains invoice total" },
  { pattern: /\b(?:iva|vat)\b/, weight: 1, reason: "Contains VAT terminology" },
  { pattern: /\bfecha (?:de )?factura\b/, weight: 1, reason: "Contains invoice date" },
  { pattern: /\bnumero (?:de )?factura\b/, weight: 1, reason: "Contains invoice number" },
];

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function evidence(text: string, indicators: Indicator[]): { score: number; reasons: string[] } {
  const matched = indicators.filter(({ pattern }) => pattern.test(text));
  return { score: matched.reduce((total, { weight }) => total + weight, 0), reasons: matched.map(({ reason }) => reason) };
}

export function classifyDocumentText(content: string): DocumentClassification {
  const text = normalized(content);
  const bank = evidence(text, BANK_INDICATORS);
  const invoice = evidence(text, INVOICE_INDICATORS);
  if (bank.score >= 6 && bank.score > invoice.score) {
    return { kind: "bank_settlement", confidence: Math.min(0.99, 0.75 + bank.score * 0.02), reasons: bank.reasons };
  }
  if (invoice.score >= 5 && invoice.score > bank.score) {
    return { kind: "invoice", confidence: Math.min(0.99, 0.75 + invoice.score * 0.02), reasons: invoice.reasons };
  }
  return {
    kind: "other",
    confidence: 0.5,
    reasons: [...bank.reasons, ...invoice.reasons, "Insufficient or conflicting evidence for automatic classification"],
  };
}
