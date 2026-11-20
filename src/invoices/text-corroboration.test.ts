import assert from "node:assert/strict";
import test from "node:test";
import { applyTextCorroboration, corroborateInvoiceDate, corroborateRecipient } from "./text-corroboration.ts";
import { defaultValidationConfig, validateInvoice } from "./validation.ts";
import { normalizeTaxId } from "./supplier-identity.ts";

const ALFA = { recipientId: "ALFA", legalName: "Alfa Dental Norte, S.L.", taxId: "B00000001", aliases: ["Alfa Norte"], active: true };
const BETA = { recipientId: "BETA", legalName: "Beta Clinica Sur, S.L.", taxId: "B00000002", aliases: [], active: true };
const recipients = [ALFA, BETA];
const serviceText = [
  "Gestoria Modelo Ejemplo, S.L. C.I.F. B00000009", "", "ALFA DENTAL NORTE, S.L.", "Calle Inventada, 1", "Poligono", "08000 Ciudad", "C.I.F. B00000001", "",
  "Villa Ejemplo, 01 de noviembre de 2026", "FACTURA NUM 1/AAA/26", "Servicio de noviembre de 2026", "Fecha Vencimiento: 06 de noviembre de 2026",
].join("\n");

test("corroborates only an explicit invoice date or a place-date header", () => {
  assert.equal(corroborateInvoiceDate(serviceText)?.value, "2026-11-01");
  assert.equal(corroborateInvoiceDate("Resumen\n12 de marzo de 2026\nTotal"), undefined);
  assert.equal(corroborateInvoiceDate("Fecha: 03/02/2026"), undefined);
  assert.equal(corroborateInvoiceDate("Fecha factura: 03/02/2026")?.value, "2026-02-03");
  assert.equal(corroborateInvoiceDate("Fecha factura: 31/02/2026"), undefined);
});

test("corroborates a single recipient only with its complete NIF and nearby name", () => {
  assert.equal(corroborateRecipient(serviceText, recipients, "B00000009")?.recipient.recipientId, "ALFA");
  assert.equal(corroborateRecipient("Alfa Norte\nSin NIF", recipients), undefined);
  assert.equal(corroborateRecipient("Alfa Norte\nCIF ESB00000001", recipients)?.recipient.recipientId, "ALFA");
  assert.equal(corroborateRecipient("ALFA DENTAL NORTE B00000001\nBETA CLINICA SUR B00000002", recipients), undefined);
  assert.equal(normalizeTaxId("ESB00000001"), "B00000001");
});

test("completes deficient values with audited text provenance and does not invent confidence", () => {
  const confidence = { recipientName: 0.4, recipientTaxId: 0.5, invoiceDate: 0.6, totalAmount: 0.99 };
  const result = applyTextCorroboration({
    invoice: { supplierTaxId: "B00000009", recipientName: "ALFA mal leido", invoiceDate: "2026-11-01" }, confidence, text: serviceText, recipients, config: defaultValidationConfig,
  });
  assert.deepEqual(result.fieldSources, { invoiceDate: "text_fallback", recipientTaxId: "text_fallback", recipientName: "text_fallback" });
  assert.equal(result.invoice.recipientTaxId, "B00000001");
  assert.ok(result.audit.every((entry) => entry.fieldSource === "text_fallback" && entry.evidence.every(({ text }) => text.length <= 160)));
  assert.deepEqual(confidence, { recipientName: 0.4, recipientTaxId: 0.5, invoiceDate: 0.6, totalAmount: 0.99 });
});

test("corrects a conflicting recipient name only after exact NIF and nearby master-name corroboration", () => {
  const text = ["ALFA DENTAL NORTE, S.L.", "Calle", "Ciudad", "Factura", "Numero", "Fecha", "Vencimiento", "Pedido", "Envio", "Referencia", "Datos", "Cliente", "CIF ESB00000001"].join("\n");
  const confidence = { recipientName: 0.99, recipientTaxId: 0.99 };
  const corrected = applyTextCorroboration({
    invoice: { recipientName: "Laboratorio Miranda", recipientTaxId: "ESB00000001" }, confidence, text, recipients, config: defaultValidationConfig,
  });
  assert.equal(corrected.invoice.recipientName, "Alfa Dental Norte, S.L.");
  assert.equal(corrected.fieldSources.recipientName, "text_fallback");
  assert.deepEqual(corrected.audit[0]?.previous, { value: "Laboratorio Miranda", confidence: 0.99 });

  const uncorroborated = applyTextCorroboration({
    invoice: { recipientName: "Laboratorio Miranda", recipientTaxId: "ESB00000001" }, confidence, text: "CIF ESB00000001", recipients, config: defaultValidationConfig,
  });
  assert.equal(uncorroborated.invoice.recipientName, "Laboratorio Miranda");
  assert.equal(uncorroborated.audit.length, 0);
});

test("skips low confidence only for an audited text fallback field", () => {
  const invoice = { supplierName: "S", invoiceNumber: "1", invoiceDate: "2026-11-01", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00" };
  assert.equal(validateInvoice(invoice, { invoiceDate: 0.5, totalAmount: 0.5 }).valid, false);
  const result = validateInvoice(invoice, { invoiceDate: 0.5, totalAmount: 0.5 }, defaultValidationConfig, { invoiceDate: "text_fallback" });
  assert.deepEqual(result.issues.map(({ field }) => field), ["totalAmount"]);
});
