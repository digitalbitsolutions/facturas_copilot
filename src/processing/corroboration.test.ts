import assert from "node:assert/strict";
import test from "node:test";
import { AttachmentProcessor, MemoryDocumentRepository, MemoryInvoiceRegistry, MemoryProcessStore, MemoryRecipientDirectory, MemorySupplierDirectory } from "./index.ts";
import type { AttachmentInput } from "./types.ts";

const recipient = { recipientId: "ALFA", legalName: "Alfa Dental Norte, S.L.", taxId: "B00000001", aliases: ["Alfa Norte"], active: true };
const supplier = { supplierId: "GESTORIA", legalName: "Gestoria Modelo Ejemplo, S.L.", taxId: "B00000009", active: true };
const text = ["Gestoria Modelo Ejemplo, S.L. C.I.F. B00000009", "ALFA DENTAL NORTE, S.L.", "Calle", "C.I.F. B00000001", "Villa Ejemplo, 01 de noviembre de 2026", "Fecha Vencimiento: 06 de noviembre de 2026"].join("\n");
const input: AttachmentInput = { messageId: "m", attachmentId: "a", sender: "x@example.test", receivedAt: "2026-11-19T10:00:00Z", originalFilename: "f.pdf", contentType: "application/pdf", content: new Uint8Array([37, 80, 68, 70]) };

test("completes low-confidence Cygnus-shaped fields from text and preserves their audit", async () => {
  const processStore = new MemoryProcessStore();
  const documents = new MemoryDocumentRepository();
  const registry = new MemoryInvoiceRegistry();
  const processor = new AttachmentProcessor({
    classifier: { classify: async () => ({ kind: "invoice", confidence: 0.99, reasons: ["test"], recognizedText: text }) },
    extractor: { extract: async () => ({ invoice: { supplierName: supplier.legalName, supplierTaxId: supplier.taxId, invoiceNumber: "1", recipientName: "ALFA", recipientTaxId: "B0000000", invoiceDate: "2026-11-01", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00" }, confidence: { supplierName: 0.99, supplierTaxId: 0.99, invoiceNumber: 0.99, recipientName: 0.5, recipientTaxId: 0.5, invoiceDate: 0.6, taxableBase: 0.99, vatAmount: 0.99, totalAmount: 0.99 } }) },
    processStore, documents, registry, supplierDirectory: new MemorySupplierDirectory([supplier]), recipientDirectory: new MemoryRecipientDirectory([recipient]), requireRecipientMatch: true,
  });
  const result = await processor.process(input);
  assert.equal(result.state, "completed");
  assert.deepEqual(result.fieldAudit?.map(({ field }) => field).sort(), ["invoiceDate", "recipientName", "recipientTaxId"]);
  assert.equal(documents.documents.size, 1);
  assert.equal(registry.entries.size, 1);
});

test("does not rescue a country-prefixed NIF paired with another customer", async () => {
  const documents = new MemoryDocumentRepository();
  const registry = new MemoryInvoiceRegistry();
  const processor = new AttachmentProcessor({
    classifier: { classify: async () => ({ kind: "invoice", confidence: 0.99, reasons: ["test"], recognizedText: "GAMMA CARD S.L.\nCIF ESB00000001" }) },
    extractor: { extract: async () => ({ invoice: { supplierName: supplier.legalName, supplierTaxId: supplier.taxId, invoiceNumber: "2", recipientName: "GAMMA CARD S.L.", recipientTaxId: "ESB00000001", invoiceDate: "2026-11-09", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00" }, confidence: { supplierName: 0.99, supplierTaxId: 0.99, invoiceNumber: 0.99, recipientName: 0.99, recipientTaxId: 0.99, invoiceDate: 0.99, taxableBase: 0.99, vatAmount: 0.99, totalAmount: 0.99 } }) },
    processStore: new MemoryProcessStore(), documents, registry, supplierDirectory: new MemorySupplierDirectory([supplier]), recipientDirectory: new MemoryRecipientDirectory([recipient]), requireRecipientMatch: true,
  });
  const result = await processor.process(input);
  assert.equal(result.exception?.code, "EX-10");
  assert.equal(documents.documents.size, 0);
  assert.equal(registry.entries.size, 0);
});

test("keeps low-confidence fields in EX-06 when text provides no evidence", async () => {
  const documents = new MemoryDocumentRepository();
  const registry = new MemoryInvoiceRegistry();
  const processor = new AttachmentProcessor({
    classifier: { classify: async () => ({ kind: "invoice", confidence: 0.99, reasons: ["test"], recognizedText: "texto sin datos" }) },
    extractor: { extract: async () => ({ invoice: { supplierName: supplier.legalName, supplierTaxId: supplier.taxId, invoiceNumber: "3", recipientName: "ALFA", recipientTaxId: "B00000001", invoiceDate: "2026-11-01", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00" }, confidence: { supplierName: 0.99, supplierTaxId: 0.99, invoiceNumber: 0.99, recipientName: 0.5, recipientTaxId: 0.5, invoiceDate: 0.6, taxableBase: 0.99, vatAmount: 0.99, totalAmount: 0.99 } }) },
    processStore: new MemoryProcessStore(), documents, registry, supplierDirectory: new MemorySupplierDirectory([supplier]), recipientDirectory: new MemoryRecipientDirectory([recipient]), requireRecipientMatch: true,
  });
  const result = await processor.process(input);
  assert.equal(result.exception?.code, "EX-06");
  assert.equal(result.fieldAudit, undefined);
  assert.equal(documents.documents.size, 0);
  assert.equal(registry.entries.size, 0);
});
