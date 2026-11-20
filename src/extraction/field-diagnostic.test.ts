import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseFields } from "./field-diagnostic.ts";

test("diagnoses only the approved five properties for deficient fields", () => {
  const entries = diagnoseFields({
    CustomerName: { content: "Cliente sintetico", confidence: 0.4, boundingRegions: [{ pageNumber: 1, polygon: [1, 2, 3, 4] }] },
    CustomerTaxId: { content: "B00000001", confidence: 0.95 },
    InvoiceDate: { valueDate: "2026-11-01", confidence: 0.5 },
    VendorName: { content: "never reported", confidence: 0.1 },
  });
  assert.deepEqual(entries.map(({ field }) => field), ["recipientName", "invoiceDate"]);
  for (const entry of entries) assert.deepEqual(Object.keys(entry).sort(), ["confidence", "field", "page", "polygon", "value"]);
  assert.doesNotMatch(JSON.stringify(entries), /never reported/);
});
