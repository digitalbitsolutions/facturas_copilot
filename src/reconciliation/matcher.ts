import type {
  BankMovement, MatchFactor, ReconciliationCandidate, ReconciliationConfig,
  ReconciliationInvoice, ReconciliationProposal,
} from "./types.ts";
import { normalizeText } from "./normalization.ts";

export const defaultReconciliationConfig: ReconciliationConfig = {
  amountToleranceMinor: 1,
  maximumDateDistanceDays: 45,
  highThreshold: 85,
  probableThreshold: 65,
  reviewThreshold: 40,
  ambiguityMargin: 10,
  automaticAcceptanceEnabled: false,
};

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function tokenOverlap(left: string, right: string): boolean {
  const a = new Set(normalizeText(left).split(" ").filter((token) => token.length >= 4));
  return normalizeText(right).split(" ").some((token) => token.length >= 4 && a.has(token));
}

function scoreCandidate(movement: BankMovement, invoice: ReconciliationInvoice, config: ReconciliationConfig): ReconciliationCandidate {
  const factors: MatchFactor[] = [];
  const paidMinor = Math.abs(movement.amountMinor);
  const expectedMinor = invoice.outstandingMinor ?? invoice.totalMinor;
  const difference = Math.abs(paidMinor - expectedMinor);
  if (difference <= config.amountToleranceMinor) factors.push({ factor: "amount", points: 55, explanation: "Amount matches within tolerance" });
  else if (difference <= Math.max(config.amountToleranceMinor, Math.round(expectedMinor * 0.01))) factors.push({ factor: "amount", points: 30, explanation: "Amount differs by no more than 1%" });

  if (movement.currency === invoice.currency) factors.push({ factor: "currency", points: 10, explanation: "Currency matches" });
  const searchableReference = normalizeText(`${movement.reference ?? ""} ${movement.descriptionOriginal}`);
  const invoiceNumber = normalizeText(invoice.invoiceNumber);
  if (invoiceNumber.length >= 3 && searchableReference.includes(invoiceNumber)) {
    factors.push({ factor: "reference", points: 20, explanation: "Bank reference contains the invoice number" });
  }
  if (tokenOverlap(`${movement.counterparty ?? ""} ${movement.descriptionOriginal}`, invoice.supplierName)) {
    factors.push({ factor: "counterparty", points: 10, explanation: "Counterparty resembles supplier" });
  }
  const relevantDate = invoice.dueDate ?? invoice.invoiceDate;
  const distance = daysBetween(movement.bookingDate, relevantDate);
  if (distance <= 7) factors.push({ factor: "date", points: 5, explanation: "Movement is within 7 days of the relevant invoice date" });
  else if (distance <= config.maximumDateDistanceDays) factors.push({ factor: "date", points: 2, explanation: `Movement is within ${config.maximumDateDistanceDays} days` });
  return { invoiceId: invoice.invoiceId, score: factors.reduce((sum, factor) => sum + factor.points, 0), factors };
}

export function reconcileMovement(
  movement: BankMovement,
  invoices: ReconciliationInvoice[],
  overrides: Partial<ReconciliationConfig> = {},
): ReconciliationProposal {
  const config = { ...defaultReconciliationConfig, ...overrides };
  const candidates = invoices
    .filter((invoice) => invoice.currency === movement.currency)
    .map((invoice) => scoreCandidate(movement, invoice, config))
    .filter((candidate) => candidate.score >= config.reviewThreshold)
    .sort((a, b) => b.score - a.score || a.invoiceId.localeCompare(b.invoiceId));
  const top = candidates[0];
  if (!top) return { movementId: movement.movementId, classification: "no_match", candidates: [], requiresHumanReview: true, reason: "No candidate reached the review threshold" };
  const ambiguous = Boolean(candidates[1] && top.score - candidates[1].score <= config.ambiguityMargin);
  if (ambiguous) return { movementId: movement.movementId, classification: "review", candidates, requiresHumanReview: true, reason: "Multiple candidates have similar scores" };
  if (top.score >= config.highThreshold) return {
    movementId: movement.movementId,
    classification: "high",
    candidates,
    requiresHumanReview: !config.automaticAcceptanceEnabled,
    reason: config.automaticAcceptanceEnabled
      ? "Single candidate reached the approved automatic-acceptance threshold"
      : "Single candidate reached high confidence but automatic acceptance is disabled",
  };
  if (top.score >= config.probableThreshold) return { movementId: movement.movementId, classification: "probable", candidates, requiresHumanReview: true, reason: "Candidate requires confirmation" };
  return { movementId: movement.movementId, classification: "review", candidates, requiresHumanReview: true, reason: "Candidate only reached the review threshold" };
}

export function reconcileBatch(movements: BankMovement[], invoices: ReconciliationInvoice[], config: Partial<ReconciliationConfig> = {}): ReconciliationProposal[] {
  return movements.map((movement) => reconcileMovement(movement, invoices, config));
}
