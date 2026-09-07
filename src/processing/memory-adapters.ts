import type { DocumentRepository, InvoiceRegistry, ProcessRecord, ProcessStore } from "./types.ts";

export class MemoryProcessStore implements ProcessStore {
  readonly records = new Map<string, ProcessRecord>();
  async get(processId: string): Promise<ProcessRecord | undefined> { return this.records.get(processId); }
  async save(record: ProcessRecord): Promise<void> { this.records.set(record.processId, structuredClone(record)); }
}

export class MemoryDocumentRepository implements DocumentRepository {
  readonly documents = new Map<string, { filename: string; contentType: string; content: Uint8Array; url: string }>();
  async putOnce(input: { processId: string; filename: string; contentType: string; content: Uint8Array }): Promise<{ url: string }> {
    const existing = this.documents.get(input.processId);
    if (existing) return { url: existing.url };
    const stored = { ...input, content: input.content.slice(), url: `memory://documents/${input.processId}/${encodeURIComponent(input.filename)}` };
    this.documents.set(input.processId, stored);
    return { url: stored.url };
  }
}

export class MemoryInvoiceRegistry implements InvoiceRegistry {
  readonly entries = new Map<string, Parameters<InvoiceRegistry["putOnce"]>[0]>();
  async findByDuplicateKey(key: string): Promise<{ processId: string } | undefined> {
    const match = [...this.entries.values()].find((entry) => entry.duplicateKey === key);
    return match && { processId: match.processId };
  }
  async putOnce(input: Parameters<InvoiceRegistry["putOnce"]>[0]): Promise<void> {
    if (!this.entries.has(input.processId)) this.entries.set(input.processId, structuredClone(input));
  }
}
