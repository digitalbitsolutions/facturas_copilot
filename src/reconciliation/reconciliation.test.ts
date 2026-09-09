import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importBankRows, reconcileMovement, type BankImportConfig, type ReconciliationInvoice } from "./index.ts";

const config: BankImportConfig = {
  schemaVersion: "1.0",
  debitSign: "negative",
  defaultCurrency: "EUR",
  columns: { id: "Id", bookingDate: "Fecha", description: "Concepto", amount: "Importe", reference: "Referencia", counterparty: "Contraparte" },
};

function validImport() {
  return importBankRows({
    sourceFilename: "extracto.xlsx", sourceHash: "abc123", config, importedAt: "2026-09-08T10:00:00.000Z",
    rows: [{ Id: "MOV-1", Fecha: "08/09/2026", Concepto: "Pago ACME factura F-2026-15", Importe: "1.210,00", Referencia: "F-2026-15", Contraparte: "ACME SL" }],
  });
}

describe("bank import", () => {
  it("normalizes a valid bank row into an idempotent batch", () => {
    const first = validImport();
    const second = validImport();
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    if (!first.accepted || !second.accepted) return;
    assert.equal(first.batch.batchId, second.batch.batchId);
    assert.equal(first.batch.movements[0].amountMinor, -121000);
    assert.equal(first.batch.movements[0].bookingDate, "2026-09-08");
    assert.equal(first.batch.movements[0].fingerprint, second.batch.movements[0].fingerprint);
  });

  it("rejects invalid headers and malformed values with actionable issues", () => {
    const missing = importBankRows({ sourceFilename: "bad.xlsx", sourceHash: "bad", config, rows: [{ Fecha: "31/02/2026" }] });
    assert.equal(missing.accepted, false);
    assert.ok(missing.issues.some((issue) => issue.code === "missing_column" && issue.column === "Concepto"));
    assert.ok(missing.issues.some((issue) => issue.code === "missing_column" && issue.column === "Importe"));
  });

  it("skips movements already imported and reports them", () => {
    const first = validImport();
    assert.equal(first.accepted, true);
    if (!first.accepted) return;
    const duplicate = importBankRows({
      sourceFilename: "again.xlsx", sourceHash: "different", config,
      knownFingerprints: new Set([first.batch.movements[0].fingerprint]),
      rows: [{ Id: "MOV-1", Fecha: "08/09/2026", Concepto: "Pago ACME factura F-2026-15", Importe: "1.210,00", Referencia: "F-2026-15", Contraparte: "ACME SL" }],
    });
    assert.equal(duplicate.accepted, true);
    if (!duplicate.accepted) return;
    assert.equal(duplicate.batch.movements.length, 0);
    assert.equal(duplicate.issues[0].code, "duplicate_movement");
  });
});

describe("reconciliation scoring", () => {
  const invoices: ReconciliationInvoice[] = [{
    invoiceId: "INV-1", supplierName: "ACME Sociedad Limitada", invoiceNumber: "F-2026-15",
    invoiceDate: "2026-08-20", dueDate: "2026-09-05", totalMinor: 121000, currency: "EUR",
  }];

  it("produces an explainable high-confidence proposal without auto-accepting by default", () => {
    const imported = validImport();
    assert.equal(imported.accepted, true);
    if (!imported.accepted) return;
    const result = reconcileMovement(imported.batch.movements[0], invoices);
    assert.equal(result.classification, "high");
    assert.equal(result.requiresHumanReview, true);
    assert.deepEqual(result.candidates[0].factors.map((factor) => factor.factor), ["amount", "currency", "reference", "counterparty", "date"]);
  });

  it("only releases a high match from review when explicitly enabled", () => {
    const imported = validImport();
    assert.equal(imported.accepted, true);
    if (!imported.accepted) return;
    const result = reconcileMovement(imported.batch.movements[0], invoices, { automaticAcceptanceEnabled: true });
    assert.equal(result.classification, "high");
    assert.equal(result.requiresHumanReview, false);
  });

  it("sends similarly-scored candidates to review", () => {
    const imported = validImport();
    assert.equal(imported.accepted, true);
    if (!imported.accepted) return;
    const result = reconcileMovement(imported.batch.movements[0], [...invoices, { ...invoices[0], invoiceId: "INV-2" }]);
    assert.equal(result.classification, "review");
    assert.equal(result.requiresHumanReview, true);
  });

  it("does not match different currencies or unrelated movements", () => {
    const imported = validImport();
    assert.equal(imported.accepted, true);
    if (!imported.accepted) return;
    const movement = { ...imported.batch.movements[0], currency: "USD", amountMinor: -999 };
    const result = reconcileMovement(movement, invoices);
    assert.equal(result.classification, "no_match");
  });
});
