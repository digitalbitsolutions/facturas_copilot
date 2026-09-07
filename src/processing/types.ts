import type { ExtractedInvoice, ExtractionConfidence, ValidatedInvoice, ValidationIssue } from "../invoices/types.ts";

export type DocumentKind = "invoice" | "quote" | "other";
export type ProcessState =
  | "received" | "classified" | "extracted" | "validated" | "archived"
  | "completed" | "diverted" | "review_required" | "failed";
export type ExceptionCode = "EX-02" | "EX-03" | "EX-04" | "EX-05" | "EX-06" | "EX-07" | "EX-08" | "EX-09";

export type AttachmentInput = {
  messageId: string;
  attachmentId: string;
  sender: string;
  receivedAt: string;
  originalFilename: string;
  contentType: string;
  content: Uint8Array;
  flowRunId?: string;
};

export type ProcessException = { code: ExceptionCode; reason: string; retryable: boolean; issues?: ValidationIssue[] };
export type ProcessRecord = {
  processId: string;
  state: ProcessState;
  input: Omit<AttachmentInput, "content">;
  documentKind?: DocumentKind;
  duplicateKey?: string;
  finalFilename?: string;
  documentUrl?: string;
  exception?: ProcessException;
  updatedAt: string;
};

export type ProcessResult = ProcessRecord & { idempotentReplay: boolean };

export interface DocumentClassifier {
  classify(input: AttachmentInput): Promise<DocumentKind>;
}
export interface InvoiceExtractor {
  extract(input: AttachmentInput): Promise<{ invoice: ExtractedInvoice; confidence?: ExtractionConfidence }>;
}
export interface ProcessStore {
  get(processId: string): Promise<ProcessRecord | undefined>;
  save(record: ProcessRecord): Promise<void>;
}
export interface DocumentRepository {
  putOnce(input: { processId: string; filename: string; contentType: string; content: Uint8Array }): Promise<{ url: string }>;
}
export interface InvoiceRegistry {
  findByDuplicateKey(key: string): Promise<{ processId: string } | undefined>;
  putOnce(input: { processId: string; invoice: ValidatedInvoice; duplicateKey: string; documentUrl: string; metadata: ProcessRecord["input"] }): Promise<void>;
}
