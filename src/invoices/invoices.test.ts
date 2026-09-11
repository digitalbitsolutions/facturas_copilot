import assert from "node:assert/strict";
import test from "node:test";
import { buildDuplicateKey, buildInvoiceFilename, defaultValidationConfig, sanitizeFilenamePart, validateInvoice } from "./index.ts";

const validInvoice = {
  supplierName: "Proveedor Norte, S.L.", invoiceNumber: "F/2026:0042", invoiceDate: "2026-09-07",
  dueDate: "2026-10-07", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00", currency: "EUR",
};

test("accepts a complete coherent invoice", () => {
  const result = validateInvoice(validInvoice, { totalAmount: 0.95 });
  assert.equal(result.valid, true);
});

test("reports missing, invalid and incoherent fields together", () => {
  const result = validateInvoice({ invoiceDate: "2026-02-30", taxableBase: "100", vatAmount: "21", totalAmount: "130", currency: "euro" });
  assert.equal(result.valid, false);
  if (!result.valid) assert.deepEqual(new Set(result.issues.map((issue) => issue.code)), new Set(["required", "invalid_date", "invalid_currency", "amount_mismatch"]));
});

test("rejects low-confidence extraction", () => {
  const result = validateInvoice(validInvoice, { supplierName: 0.74 });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.issues.at(-1)?.code, "low_confidence");
    assert.match(result.issues.at(-1)?.message ?? "", /0\.75/);
  }
});

test("accepts the field-calibrated confidence profile when amounts are coherent", () => {
  const result = validateInvoice(validInvoice, {
    supplierName: 0.76,
    invoiceNumber: 0.71,
    invoiceDate: 0.95,
    dueDate: 0.654,
    taxableBase: 0.438,
    vatAmount: 0.936,
    totalAmount: 0.938,
    currency: 0.938,
  });
  assert.equal(result.valid, true);
});

test("uses the global confidence threshold for fields without an override", () => {
  const result = validateInvoice(validInvoice, { supplierName: 0.79 }, {
    ...defaultValidationConfig,
    minimumConfidenceByField: {},
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.issues.at(-1)?.message ?? "", /0\.8/);
});

test("creates a safe bounded PDF filename", () => {
  const result = validateInvoice(validInvoice);
  assert.equal(result.valid, true);
  if (result.valid) {
    const filename = buildInvoiceFilename(result.invoice, 80);
    assert.equal(filename, "2026-09-07_Proveedor Norte, S.L_F-2026-0042_121.00_EUR.pdf");
    assert.ok(filename.length <= 80);
  }
  assert.equal(sanitizeFilenamePart("CON"), "_CON");
});

test("builds a stable duplicate key from normalized values", () => {
  const first = validateInvoice(validInvoice);
  const second = validateInvoice({ ...validInvoice, supplierName: "  proveedor norte, s.l. " });
  assert.equal(first.valid, true); assert.equal(second.valid, true);
  if (first.valid && second.valid) assert.equal(buildDuplicateKey(first.invoice), buildDuplicateKey(second.invoice));
});
