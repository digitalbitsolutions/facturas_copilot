import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignExceptionRequest, importBankRequest, reconcileBankRequest, resolveExceptionRequest, validateInvoiceRequest } from "./services.ts";

describe("HTTP service contracts", () => {
  it("validates an extracted invoice payload", () => {
    const result = validateInvoiceRequest({ invoice: {
      supplierName: "ACME", invoiceNumber: "F-1", invoiceDate: "2026-09-01",
      taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00", currency: "EUR",
    } });
    assert.equal(result.valid, true);
  });

  it("rejects malformed bank import envelopes", () => {
    assert.throws(() => importBankRequest({ rows: [] }), /sourceFilename/);
  });

  it("accepts an empty reconciliation workload", () => {
    assert.deepEqual(reconcileBankRequest({ movements: [], invoices: [] }), []);
  });

  it("accepts only the approved resolution action for each exception code", () => {
    assert.deepEqual(resolveExceptionRequest({ exceptionId: "7", code: "EX-07", responsible: "reviewer@contoso.com", action: "confirm_duplicate", result: "Confirmed against original invoice" }).action, "confirm_duplicate");
    assert.throws(() => resolveExceptionRequest({ exceptionId: "7", code: "EX-07", responsible: "reviewer@contoso.com", action: "update_supplier_and_resubmit", result: "Invalid" }), /not allowed/);
    assert.deepEqual(assignExceptionRequest({ exceptionId: "7", responsible: "reviewer@contoso.com" }), { exceptionId: "7", responsible: "reviewer@contoso.com" });
  });
});
