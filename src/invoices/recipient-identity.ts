import type { ExtractedInvoice, ValidationIssue } from "./types.ts";
import { normalizeSupplierName, normalizeTaxId } from "./supplier-identity.ts";

export type RecipientMasterRecord = { recipientId: string; legalName: string; taxId?: string; aliases?: string[]; active: boolean };
export type RecipientIdentityResult =
  | { status: "matched"; recipient: RecipientMasterRecord; matchedBy: "tax_id" | "legal_name" | "alias" }
  | { status: "not_found"; issue: ValidationIssue }
  | { status: "ambiguous"; candidateIds: string[]; issue: ValidationIssue };

export interface RecipientDirectory { listActive(): Promise<RecipientMasterRecord[]>; }

/** Matches the recipient against tenant-authorised legal entities. */
export function resolveRecipientIdentity(invoice: ExtractedInvoice, recipients: RecipientMasterRecord[]): RecipientIdentityResult {
  const active = recipients.filter((recipient) => recipient.active);
  const taxId = invoice.recipientTaxId && normalizeTaxId(invoice.recipientTaxId);
  if (taxId) {
    const matches = active.filter((recipient) => recipient.taxId && normalizeTaxId(recipient.taxId) === taxId);
    if (matches.length === 1) return { status: "matched", recipient: matches[0], matchedBy: "tax_id" };
    if (matches.length > 1) return ambiguous(matches, "recipientTaxId", "Recipient tax ID matches multiple active master records");
    return notFound("recipientTaxId", "Recipient tax ID does not match an active master record");
  }
  const name = invoice.recipientName && normalizeSupplierName(invoice.recipientName);
  if (!name) return notFound("recipientName", "Recipient name is unavailable for master validation");
  const matches: Array<{ recipient: RecipientMasterRecord; matchedBy: "legal_name" | "alias" }> = [];
  for (const recipient of active) {
    if (normalizeSupplierName(recipient.legalName) === name) matches.push({ recipient, matchedBy: "legal_name" });
    else if (recipient.aliases?.some((alias) => normalizeSupplierName(alias) === name)) matches.push({ recipient, matchedBy: "alias" });
  }
  if (matches.length === 1) return { status: "matched", ...matches[0] };
  if (matches.length > 1) return ambiguous(matches.map(({ recipient }) => recipient), "recipientName", "Recipient name matches multiple active master records");
  return notFound("recipientName", "Recipient name does not match an active master record");
}

function notFound(field: "recipientName" | "recipientTaxId", message: string): RecipientIdentityResult { return { status: "not_found", issue: { code: "recipient_not_found", field, message } }; }
function ambiguous(recipients: RecipientMasterRecord[], field: "recipientName" | "recipientTaxId", message: string): RecipientIdentityResult { return { status: "ambiguous", candidateIds: recipients.map(({ recipientId }) => recipientId), issue: { code: "recipient_ambiguous", field, message } }; }
