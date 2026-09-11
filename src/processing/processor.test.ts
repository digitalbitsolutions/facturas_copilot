import assert from "node:assert/strict";
import test from "node:test";
import { AttachmentProcessor, MemoryDocumentRepository, MemoryInvoiceRegistry, MemoryProcessStore, MemorySupplierDirectory } from "./index.ts";
import type { AttachmentInput, DocumentKind } from "./types.ts";

const input = (attachmentId = "a-1"): AttachmentInput => ({
  messageId: "message-1", attachmentId, sender: "billing@example.test", receivedAt: "2026-09-07T10:00:00Z",
  originalFilename: `${attachmentId}.pdf`, contentType: "application/pdf", content: new Uint8Array([37, 80, 68, 70]),
});
const invoice = { supplierName: "ACME", invoiceNumber: "F-42", invoiceDate: "2026-09-01", dueDate: "2026-10-01", taxableBase: "100", vatAmount: "21", totalAmount: "121", currency: "EUR" };

function setup(options: { kind?: DocumentKind; extracted?: typeof invoice; extractionErrorFor?: string; supplierName?: string } = {}) {
  const processStore = new MemoryProcessStore();
  const documents = new MemoryDocumentRepository();
  const registry = new MemoryInvoiceRegistry();
  const supplierDirectory = new MemorySupplierDirectory(options.supplierName === "missing" ? [] : [{ supplierId: "SUP-1", legalName: options.supplierName ?? "ACME", active: true }]);
  let extractionCalls = 0;
  const processor = new AttachmentProcessor({
    classifier: { classify: async () => ({ kind: options.kind ?? "invoice", confidence: 0.99, reasons: ["test"] }) },
    extractor: { extract: async (attachment) => {
      extractionCalls += 1;
      if (attachment.attachmentId === options.extractionErrorFor) throw new Error("Unreadable PDF");
      return { invoice: options.extracted ?? invoice, confidence: { totalAmount: 0.99 } };
    } },
    processStore, documents, registry, supplierDirectory,
    now: () => new Date("2026-09-07T12:00:00Z"),
  });
  return { processor, processStore, documents, registry, extractionCalls: () => extractionCalls };
}

test("completes and correlates a valid invoice", async () => {
  const context = setup();
  const result = await context.processor.process(input());
  assert.equal(result.state, "completed");
  assert.match(result.documentUrl ?? "", /^memory:\/\/documents\//);
  assert.equal(context.documents.documents.size, 1);
  assert.equal(context.registry.entries.size, 1);
  assert.equal(result.input.messageId, "message-1");
});

test("diverts non-invoices without extraction", async () => {
  const context = setup({ kind: "bank_settlement" });
  const result = await context.processor.process(input());
  assert.equal(result.state, "diverted");
  assert.equal(result.exception?.code, "EX-03");
  assert.equal(result.documentKind, "bank_settlement");
  assert.equal(result.classificationConfidence, 0.99);
  assert.equal(context.extractionCalls(), 0);
});

test("creates a review exception for incomplete extraction", async () => {
  const context = setup({ extracted: { ...invoice, supplierName: undefined } as unknown as typeof invoice });
  const result = await context.processor.process(input());
  assert.equal(result.state, "review_required");
  assert.equal(result.exception?.code, "EX-05");
  assert.equal(context.documents.documents.size, 0);
});

test("requires a unique active supplier master match before archiving", async () => {
  const context = setup({ supplierName: "missing" });
  const result = await context.processor.process(input());
  assert.equal(result.state, "review_required");
  assert.equal(result.exception?.issues?.[0]?.code, "supplier_not_found");
  assert.equal(context.documents.documents.size, 0);
});

test("flags a second invoice with the same business key", async () => {
  const context = setup();
  assert.equal((await context.processor.process(input("first"))).state, "completed");
  const duplicate = await context.processor.process(input("second"));
  assert.equal(duplicate.state, "review_required");
  assert.equal(duplicate.exception?.code, "EX-07");
  assert.equal(context.registry.entries.size, 1);
});

test("replays terminal processes without side effects", async () => {
  const context = setup();
  const first = await context.processor.process(input());
  const replay = await context.processor.process(input());
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(context.extractionCalls(), 1);
  assert.equal(context.registry.entries.size, 1);
});

test("isolates a failed attachment from the remaining message", async () => {
  const context = setup({ extractionErrorFor: "bad" });
  const results = await context.processor.processAll([input("bad"), input("good")]);
  assert.deepEqual(results.map((result) => result.state), ["review_required", "completed"]);
  assert.equal(results[0].exception?.code, "EX-04");
});
