import assert from "node:assert/strict";
import test from "node:test";
import { classifyDocumentText } from "./classifier.ts";

test("classifies a fiscal invoice from independent indicators", () => {
  const result = classifyDocumentText("FACTURA F-42 Fecha de factura Base imponible 100,00 IVA 21,00 Total factura 121,00");
  assert.equal(result.kind, "invoice");
  assert.ok(result.confidence >= 0.85);
});

test("classifies the observed bank receipt settlement before invoice extraction", () => {
  const result = classifyDocumentText("Liquidación de recibos Total nominal abonado Fecha valor Intereses Comisiones Gastos correo IVA");
  assert.equal(result.kind, "bank_settlement");
  assert.ok(result.reasons.some((reason) => /settlement/i.test(reason)));
});

test("routes weak evidence to other and prioritizes a strong settlement heading", () => {
  assert.equal(classifyDocumentText("Documento informativo con fecha e importe").kind, "other");
  assert.equal(classifyDocumentText("Factura Liquidación de recibos").kind, "bank_settlement");
});
