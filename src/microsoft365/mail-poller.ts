import type { AttachmentProcessor } from "../processing/index.ts";
import type { AttachmentInput, ProcessResult } from "../processing/types.ts";
import type { GraphClient } from "./graph-client.ts";

type Message = { id: string; receivedDateTime?: string; hasAttachments?: boolean; from?: { emailAddress?: { address?: string } } };
type FileAttachment = { id: string; name?: string; contentType?: string; contentBytes?: string; isInline?: boolean };

export type MailboxPollingResult = {
  messages: number; pdfAttachments: number; completed: number; diverted: number;
  reviewRequired: number; failed: number; idempotentReplays: number;
};

/** Processes PDF attachments from the configured shared mailbox. Mail remains read-only. */
export class SharePointInvoiceMailboxPoller {
  private readonly graph: GraphClient;
  private readonly mailbox: string;
  private readonly processor: Pick<AttachmentProcessor, "process">;

  constructor(graph: GraphClient, mailbox: string, processor: Pick<AttachmentProcessor, "process">) {
    this.graph = graph; this.mailbox = mailbox; this.processor = processor;
  }

  async run(): Promise<MailboxPollingResult> {
    const response = await this.graph.request<{ value: Message[] }>(
      `/users/${encodeURIComponent(this.mailbox)}/mailFolders/inbox/messages?$select=id,receivedDateTime,hasAttachments,from&$top=25`,
    );
    const results: ProcessResult[] = [];
    let pdfAttachments = 0;
    for (const message of response.value.filter((candidate) => candidate.hasAttachments)) {
      const attachments = await this.graph.request<{ value: FileAttachment[] }>(
        `/users/${encodeURIComponent(this.mailbox)}/messages/${encodeURIComponent(message.id)}/attachments`,
      );
      for (const attachment of attachments.value) {
        const isPdf = attachment.contentType === "application/pdf" || /\.pdf$/i.test(attachment.name ?? "");
        if (!isPdf || attachment.isInline || !attachment.contentBytes || !attachment.name) continue;
        pdfAttachments += 1;
        const input: AttachmentInput = {
          messageId: message.id, attachmentId: attachment.id,
          sender: message.from?.emailAddress?.address ?? "unknown",
          receivedAt: message.receivedDateTime ?? new Date(0).toISOString(), originalFilename: attachment.name,
          contentType: "application/pdf", content: Buffer.from(attachment.contentBytes, "base64"),
        };
        results.push(await this.processor.process(input));
      }
    }
    return {
      messages: response.value.length, pdfAttachments,
      completed: results.filter(({ state }) => state === "completed").length,
      diverted: results.filter(({ state }) => state === "diverted").length,
      reviewRequired: results.filter(({ state }) => state === "review_required").length,
      failed: results.filter(({ state }) => state === "failed").length,
      idempotentReplays: results.filter(({ idempotentReplay }) => idempotentReplay).length,
    };
  }
}
