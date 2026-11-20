import { createHash } from "node:crypto";
import { applyTextCorroboration, buildDuplicateKey, buildInvoicePath, defaultValidationConfig, resolveRecipientIdentity, resolveSupplierIdentity, validateInvoice, validationConfigForSupplier } from "../invoices/index.ts";
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
  recipientDirectory?: import("../invoices/index.ts").RecipientDirectory;
  requireRecipientMatch?: boolean;
  validationConfig?: InvoiceValidationConfig;
  fiscalDiagnosticOnly?: boolean;
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
    if (previous && (["completed", "diverted"].includes(previous.state) || (previous.state === "review_required" && !previous.exception?.retryable))) {
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

      // OCR text is transient: it is reused only to corroborate fiscal labels when
      // the invoice model omitted them, and is never persisted in process state.
      const extraction = await this.dependencies.extractor.extract(input, {
        recognizedText: classification.recognizedText,
        ensureSingleInvoiceDocument: true,
      });
      record = await this.transition(record, "extracted");
      if (this.dependencies.fiscalDiagnosticOnly) {
        return this.finish(record, "review_required", { code: "EX-05", reason: "REVISION_FISCAL_DIAGNOSTICO", retryable: false });
      }
      const supplierIdentity = resolveSupplierIdentity(extraction.invoice, await this.dependencies.supplierDirectory.listActive());
      const supplierValidationConfig = validationConfigForSupplier(this.dependencies.validationConfig, supplierIdentity);
      if (this.dependencies.requireRecipientMatch && !this.dependencies.recipientDirectory) throw new Error("Recipient routing is enabled without a recipient directory");
      const recipients = this.dependencies.requireRecipientMatch ? await this.dependencies.recipientDirectory!.listActive() : undefined;
      // This is deliberately scoped to the recipient-routing pilot. The extractor has
      // already rejected PDFs that identify more than one invoice before OCR text is used.
      // A unique exact NIF match to an active supplier is stronger evidence than
      // the model confidence for that identity. It never bypasses fiscal checks.
      const supplierCorroborated = supplierIdentity.status === "matched" && supplierIdentity.matchedBy === "tax_id"
        ? {
          invoice: { ...extraction.invoice, supplierName: supplierIdentity.supplier.legalName, supplierTaxId: supplierIdentity.supplier.taxId ?? extraction.invoice.supplierTaxId },
          fieldSources: { ...extraction.fieldSources, supplierName: "master_match" as const, supplierTaxId: "master_match" as const },
        }
        : { invoice: extraction.invoice, fieldSources: extraction.fieldSources ?? {} };
      const corroborated = recipients ? applyTextCorroboration({
        invoice: supplierCorroborated.invoice, confidence: extraction.confidence ?? {}, text: classification.recognizedText,
        recipients, config: supplierValidationConfig ?? defaultValidationConfig,
      }) : { invoice: supplierCorroborated.invoice, fieldSources: {}, audit: [] };
      if (corroborated.audit.length) record = { ...record, fieldAudit: corroborated.audit };
      const fieldSources = { ...supplierCorroborated.fieldSources, ...corroborated.fieldSources };
      let validation = validateInvoice(corroborated.invoice, extraction.confidence, supplierValidationConfig, fieldSources);
      if (!validation.valid) {
        const missing = validation.issues.some((issue) => issue.code === "required");
        return this.finish(record, "review_required", {
          code: missing ? "EX-05" : "EX-06", reason: "Invoice extraction requires review", retryable: false, issues: validation.issues,
        });
      }

      if (supplierIdentity.status !== "matched") {
        return this.finish(record, "review_required", {
          code: "EX-06", reason: "Supplier identity requires review", retryable: false, issues: [supplierIdentity.issue],
        });
      }
      validation = validateInvoice({
        ...validation.invoice,
        supplierName: supplierIdentity.supplier.legalName,
        supplierTaxId: supplierIdentity.supplier.taxId ?? validation.invoice.supplierTaxId,
      }, extraction.confidence, supplierValidationConfig, fieldSources);
      if (!validation.valid) throw new Error("Canonical supplier data unexpectedly failed invoice validation");

      if (recipients) {
        const recipientIdentity = resolveRecipientIdentity(corroborated.invoice, recipients);
        if (recipientIdentity.status !== "matched") {
          return this.finish(record, "review_required", {
            code: "EX-10", reason: "Recipient identity requires review", retryable: false, issues: [recipientIdentity.issue],
          });
        }
        validation = validateInvoice({
          ...validation.invoice,
          recipientName: recipientIdentity.recipient.legalName,
          recipientTaxId: recipientIdentity.recipient.taxId ?? validation.invoice.recipientTaxId,
        }, extraction.confidence, supplierValidationConfig, fieldSources);
        if (!validation.valid) throw new Error("Canonical recipient data unexpectedly failed invoice validation");
      }

      if (validation.invoice.irpfAmount && Number(validation.invoice.irpfAmount) !== 0 && Number(validation.invoice.vatAmount) === 0) {
        return this.finish(record, "review_required", {
          code: "EX-05", reason: "Invoice with IRPF and no VAT requires review", retryable: false,
        });
      }

      const duplicateKey = buildDuplicateKey(validation.invoice);
      record = await this.transition(record, "validated", { duplicateKey });
      const duplicate = await this.dependencies.registry.findByDuplicateKey(duplicateKey);
      if (duplicate && duplicate.processId !== processId) {
        return this.finish(record, "review_required", { code: "EX-07", reason: `Possible duplicate of process ${duplicate.processId}`, retryable: false });
      }

      const finalFilename = buildInvoicePath(validation.invoice);
      let stored: { url: string; filename: string };
      try {
        stored = await this.dependencies.documents.putOnce({ processId, filename: finalFilename, contentType: input.contentType, content: input.content });
      } catch (error) {
        return this.finish(record, "failed", this.technicalException("EX-08", error));
      }
      record = await this.transition(record, "archived", { finalFilename: stored.filename, documentUrl: stored.url });

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
