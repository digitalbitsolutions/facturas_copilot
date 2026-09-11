import { createHash } from "node:crypto";
import { buildDuplicateKey, buildInvoiceFilename, resolveSupplierIdentity, validateInvoice } from "../invoices/index.ts";
import type { InvoiceValidationConfig } from "../invoices/types.ts";
import type {
  AttachmentInput, DocumentClassifier, DocumentRepository, InvoiceExtractor, InvoiceRegistry,
  ProcessException, ProcessRecord, ProcessResult, ProcessStore,
} from "./types.ts";

export type ProcessorDependencies = {
  classifier: DocumentClassifier;
  extractor: InvoiceExtractor;
  processStore: ProcessStore;
  documents: DocumentRepository;
  registry: InvoiceRegistry;
  supplierDirectory: import("../invoices/index.ts").SupplierDirectory;
  validationConfig?: InvoiceValidationConfig;
  now?: () => Date;
};

export function buildProcessId(messageId: string, attachmentId: string): string {
  return createHash("sha256").update(`${messageId}\0${attachmentId}`).digest("hex");
}

export class AttachmentProcessor {
  private readonly now: () => Date;
  private readonly dependencies: ProcessorDependencies;
  constructor(dependencies: ProcessorDependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? (() => new Date());
  }

  async process(input: AttachmentInput): Promise<ProcessResult> {
    const processId = buildProcessId(input.messageId, input.attachmentId);
    const previous = await this.dependencies.processStore.get(processId);
    if (previous && ["completed", "diverted", "review_required"].includes(previous.state)) {
      return { ...previous, idempotentReplay: true };
    }

    let record = previous ?? this.record(processId, input, "received");
    await this.dependencies.processStore.save(record);
    if (input.content.length === 0 || input.contentType !== "application/pdf") {
      return this.finish(record, "review_required", { code: "EX-02", reason: "Attachment is empty or not a PDF", retryable: false });
    }

    try {
      const classification = await this.dependencies.classifier.classify(input);
      record = await this.transition(record, "classified", {
        documentKind: classification.kind,
        classificationConfidence: classification.confidence,
        classificationReasons: classification.reasons,
      });
      if (classification.kind !== "invoice") {
        return this.finish(record, "diverted", { code: "EX-03", reason: `Document classified as ${classification.kind}`, retryable: false });
      }

      const extraction = await this.dependencies.extractor.extract(input);
      record = await this.transition(record, "extracted");
      let validation = validateInvoice(extraction.invoice, extraction.confidence, this.dependencies.validationConfig);
      if (!validation.valid) {
        const missing = validation.issues.some((issue) => issue.code === "required");
        return this.finish(record, "review_required", {
          code: missing ? "EX-05" : "EX-06", reason: "Invoice extraction requires review", retryable: false, issues: validation.issues,
        });
      }

      const supplierIdentity = resolveSupplierIdentity(validation.invoice, await this.dependencies.supplierDirectory.listActive());
      if (supplierIdentity.status !== "matched") {
        return this.finish(record, "review_required", {
          code: "EX-06", reason: "Supplier identity requires review", retryable: false, issues: [supplierIdentity.issue],
        });
      }
      validation = validateInvoice({
        ...validation.invoice,
        supplierName: supplierIdentity.supplier.legalName,
        supplierTaxId: supplierIdentity.supplier.taxId ?? validation.invoice.supplierTaxId,
      }, extraction.confidence, this.dependencies.validationConfig);
      if (!validation.valid) throw new Error("Canonical supplier data unexpectedly failed invoice validation");

      const duplicateKey = buildDuplicateKey(validation.invoice);
      record = await this.transition(record, "validated", { duplicateKey });
      const duplicate = await this.dependencies.registry.findByDuplicateKey(duplicateKey);
      if (duplicate && duplicate.processId !== processId) {
        return this.finish(record, "review_required", { code: "EX-07", reason: `Possible duplicate of process ${duplicate.processId}`, retryable: false });
      }

      const finalFilename = buildInvoiceFilename(validation.invoice);
      let stored: { url: string };
      try {
        stored = await this.dependencies.documents.putOnce({ processId, filename: finalFilename, contentType: input.contentType, content: input.content });
      } catch (error) {
        return this.finish(record, "failed", this.technicalException("EX-08", error));
      }
      record = await this.transition(record, "archived", { finalFilename, documentUrl: stored.url });

      try {
        await this.dependencies.registry.putOnce({ processId, invoice: validation.invoice, duplicateKey, documentUrl: stored.url, metadata: record.input });
      } catch (error) {
        return this.finish(record, "failed", this.technicalException("EX-09", error));
      }
      return this.finish(record, "completed");
    } catch (error) {
      return this.finish(record, "review_required", { code: "EX-04", reason: error instanceof Error ? error.message : String(error), retryable: true });
    }
  }

  async processAll(inputs: AttachmentInput[]): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    for (const input of inputs) results.push(await this.process(input));
    return results;
  }

  private record(processId: string, input: AttachmentInput, state: ProcessRecord["state"]): ProcessRecord {
    const { content: _content, ...metadata } = input;
    return { processId, state, input: metadata, updatedAt: this.now().toISOString() };
  }

  private async transition(record: ProcessRecord, state: ProcessRecord["state"], patch: Partial<ProcessRecord> = {}): Promise<ProcessRecord> {
    const next = { ...record, ...patch, state, exception: undefined, updatedAt: this.now().toISOString() };
    await this.dependencies.processStore.save(next);
    return next;
  }

  private async finish(record: ProcessRecord, state: ProcessRecord["state"], exception?: ProcessException): Promise<ProcessResult> {
    const next = { ...record, state, exception, updatedAt: this.now().toISOString() };
    await this.dependencies.processStore.save(next);
    return { ...next, idempotentReplay: false };
  }

  private technicalException(code: "EX-08" | "EX-09", error: unknown): ProcessException {
    return { code, reason: error instanceof Error ? error.message : String(error), retryable: true };
  }
}
