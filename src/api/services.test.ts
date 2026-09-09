import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importBankRequest, reconcileBankRequest, validateInvoiceRequest } from "./services.ts";

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
});
