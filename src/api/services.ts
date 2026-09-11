import { validateInvoice } from "../invoices/index.ts";
import type { ExtractedInvoice, ExtractionConfidence, InvoiceValidationConfig } from "../invoices/types.ts";
import { importBankRows, reconcileBatch } from "../reconciliation/index.ts";
import type { BankImportConfig, BankMovement, ReconciliationConfig, ReconciliationInvoice } from "../reconciliation/types.ts";
import { validateResolution } from "../processing/exception-resolution.ts";

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

export function validateInvoiceRequest(body: unknown) {
  object(body, "request body");
  object(body.invoice, "invoice");
  return validateInvoice(body.invoice as ExtractedInvoice, body.confidence as ExtractionConfidence | undefined, body.config as InvoiceValidationConfig | undefined);
}

export function importBankRequest(body: unknown) {
  object(body, "request body");
  if (typeof body.sourceFilename !== "string" || !body.sourceFilename.trim()) throw new TypeError("sourceFilename is required");
  if (typeof body.sourceHash !== "string" || !body.sourceHash.trim()) throw new TypeError("sourceHash is required");
  if (!Array.isArray(body.rows)) throw new TypeError("rows must be an array");
  object(body.config, "config");
  return importBankRows({
    sourceFilename: body.sourceFilename,
    sourceHash: body.sourceHash,
    rows: body.rows as Array<Record<string, unknown>>,
    config: body.config as BankImportConfig,
    knownFingerprints: Array.isArray(body.knownFingerprints) ? new Set(body.knownFingerprints as string[]) : undefined,
  });
}

export function reconcileBankRequest(body: unknown) {
  object(body, "request body");
  if (!Array.isArray(body.movements)) throw new TypeError("movements must be an array");
  if (!Array.isArray(body.invoices)) throw new TypeError("invoices must be an array");
  return reconcileBatch(body.movements as BankMovement[], body.invoices as ReconciliationInvoice[], body.config as Partial<ReconciliationConfig> | undefined);
}

export function assignExceptionRequest(body: unknown) {
  object(body, "request body");
  if (typeof body.exceptionId !== "string" || !body.exceptionId.trim()) throw new TypeError("exceptionId is required");
  if (typeof body.responsible !== "string" || !body.responsible.trim()) throw new TypeError("responsible is required");
  return { exceptionId: body.exceptionId.trim(), responsible: body.responsible.trim() };
}

export function resolveExceptionRequest(body: unknown) {
  object(body, "request body");
  if (typeof body.exceptionId !== "string" || !body.exceptionId.trim()) throw new TypeError("exceptionId is required");
  if (typeof body.responsible !== "string" || !body.responsible.trim()) throw new TypeError("responsible is required");
  if (typeof body.action !== "string" || !body.action.trim()) throw new TypeError("action is required");
  if (typeof body.result !== "string" || !body.result.trim()) throw new TypeError("result is required");
  if (typeof body.code !== "string" || !body.code.trim()) throw new TypeError("code is required");
  validateResolution(body.code, body.action, body.responsible, body.result);
  return { exceptionId: body.exceptionId.trim(), responsible: body.responsible.trim(), action: body.action.trim(), result: body.result.trim() };
}
