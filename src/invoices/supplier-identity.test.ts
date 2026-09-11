import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSupplierName, resolveSupplierIdentity } from "./supplier-identity.ts";

const suppliers = [
  { supplierId: "SUP-001", legalName: "Energía Ejemplo, S.A.U.", taxId: "A-12345678", aliases: ["ENERGIA"], active: true },
  { supplierId: "SUP-002", legalName: "Proveedor Inactivo SL", taxId: "B87654321", active: false },
];

test("normalizes accents, punctuation and spacing in supplier names", () => {
  assert.equal(normalizeSupplierName("  Energía Ejemplo, S.A.U. "), "ENERGIA EJEMPLO SAU");
});

test("matches an active supplier by exact normalized tax ID", () => {
  const result = resolveSupplierIdentity({ supplierName: "wrong name", supplierTaxId: "a 12345678" }, suppliers);
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.matchedBy, "tax_id");
});

test("does not fall back to the name when an extracted tax ID conflicts", () => {
  const result = resolveSupplierIdentity({ supplierName: "Energía Ejemplo, S.A.U.", supplierTaxId: "Z00000000" }, suppliers);
  assert.equal(result.status, "not_found");
  if (result.status === "not_found") assert.equal(result.issue.field, "supplierTaxId");
});

test("matches by normalized legal name or explicit alias when tax ID is absent", () => {
  assert.equal(resolveSupplierIdentity({ supplierName: "energia ejemplo sau" }, suppliers).status, "matched");
  const alias = resolveSupplierIdentity({ supplierName: "energía" }, suppliers);
  assert.equal(alias.status, "matched");
  if (alias.status === "matched") assert.equal(alias.matchedBy, "alias");
});

test("rejects inactive and ambiguous supplier records", () => {
  assert.equal(resolveSupplierIdentity({ supplierTaxId: "B87654321" }, suppliers).status, "not_found");
  const ambiguous = resolveSupplierIdentity({ supplierName: "ENERGIA" }, [...suppliers, {
    supplierId: "SUP-003", legalName: "Otra Empresa SL", aliases: ["energia"], active: true,
  }]);
  assert.equal(ambiguous.status, "ambiguous");
});
