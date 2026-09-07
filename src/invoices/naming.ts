import { createHash } from "node:crypto";
import type { ValidatedInvoice } from "./types.ts";

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeFilenamePart(value: string): string {
  const clean = value.normalize("NFKC").replace(INVALID_FILENAME, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim();
  if (!clean) return "sin-dato";
  return RESERVED_WINDOWS.test(clean) ? `_${clean}` : clean;
}

export function buildInvoiceFilename(invoice: ValidatedInvoice, maxLength = 180): string {
  const parts = [invoice.invoiceDate, invoice.supplierName, invoice.invoiceNumber, invoice.totalAmount, invoice.currency ?? "XXX"]
    .map(sanitizeFilenamePart);
  const filename = `${parts.join("_")}.pdf`;
  if (filename.length <= maxLength) return filename;
  const suffix = `_${createHash("sha256").update(filename).digest("hex").slice(0, 10)}.pdf`;
  return `${filename.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
}

export function buildDuplicateKey(invoice: ValidatedInvoice): string {
  const canonical = [invoice.supplierName, invoice.invoiceNumber, invoice.invoiceDate, invoice.totalAmount, invoice.currency ?? ""]
    .map((value) => value.normalize("NFKC").trim().toLocaleUpperCase("es-ES"))
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
