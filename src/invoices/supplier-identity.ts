import type { ExtractedInvoice, ValidationIssue } from "./types.ts";

export type SupplierMasterRecord = {
  supplierId: string;
  legalName: string;
  taxId?: string;
  aliases?: string[];
  active: boolean;
};

export type SupplierIdentityResult =
  | { status: "matched"; supplier: SupplierMasterRecord; matchedBy: "tax_id" | "legal_name" | "alias" }
  | { status: "not_found"; issue: ValidationIssue }
  | { status: "ambiguous"; candidateIds: string[]; issue: ValidationIssue };

export interface SupplierDirectory {
  listActive(): Promise<SupplierMasterRecord[]>;
}

export function normalizeSupplierName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/\./g, "").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeTaxId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveSupplierIdentity(invoice: ExtractedInvoice, suppliers: SupplierMasterRecord[]): SupplierIdentityResult {
  const active = suppliers.filter((supplier) => supplier.active);
  const taxId = invoice.supplierTaxId && normalizeTaxId(invoice.supplierTaxId);
  if (taxId) {
    const matches = active.filter((supplier) => supplier.taxId && normalizeTaxId(supplier.taxId) === taxId);
    if (matches.length === 1) return { status: "matched", supplier: matches[0], matchedBy: "tax_id" };
    if (matches.length > 1) return ambiguous(matches, "supplierTaxId", "Supplier tax ID matches multiple active master records");
    return notFound("supplierTaxId", "Supplier tax ID does not match an active master record");
  }

  const name = invoice.supplierName && normalizeSupplierName(invoice.supplierName);
  if (!name) return notFound("supplierName", "Supplier name is unavailable for master validation");
  const matches: Array<{ supplier: SupplierMasterRecord; matchedBy: "legal_name" | "alias" }> = [];
  for (const supplier of active) {
    if (normalizeSupplierName(supplier.legalName) === name) matches.push({ supplier, matchedBy: "legal_name" });
    else if (supplier.aliases?.some((alias) => normalizeSupplierName(alias) === name)) matches.push({ supplier, matchedBy: "alias" });
  }
  if (matches.length === 1) return { status: "matched", ...matches[0] };
  if (matches.length > 1) return ambiguous(matches.map(({ supplier }) => supplier), "supplierName", "Supplier name matches multiple active master records");
  return notFound("supplierName", "Supplier name does not match an active master record");
}

function notFound(field: "supplierName" | "supplierTaxId", message: string): SupplierIdentityResult {
  return { status: "not_found", issue: { code: "supplier_not_found", field, message } };
}

function ambiguous(suppliers: SupplierMasterRecord[], field: "supplierName" | "supplierTaxId", message: string): SupplierIdentityResult {
  return { status: "ambiguous", candidateIds: suppliers.map(({ supplierId }) => supplierId), issue: { code: "supplier_ambiguous", field, message } };
}
