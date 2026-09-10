import type { GraphClient } from "./graph-client.ts";
import { SharePointDocumentRepository } from "./sharepoint-documents.ts";

type Message = { id: string; subject?: string; receivedDateTime?: string; hasAttachments?: boolean };
type FileAttachment = { id: string; name?: string; contentType?: string; contentBytes?: string; isInline?: boolean; "@odata.type"?: string };

function safeFilename(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140); }

/** Archives PDF attachments from the configured shared mailbox. Mail remains read-only. */
export class SharePointInvoiceMailboxPoller {
  private readonly graph: GraphClient;
  private readonly mailbox: string;
  private readonly documents: SharePointDocumentRepository;

  constructor(graph: GraphClient, mailbox: string, documents: SharePointDocumentRepository) {
    this.graph = graph;
    this.mailbox = mailbox;
    this.documents = documents;
  }

  async run(): Promise<{ messages: number; archived: number }> {
    const response = await this.graph.request<{ value: Message[] }>(
      `/users/${encodeURIComponent(this.mailbox)}/mailFolders/inbox/messages?$select=id,subject,receivedDateTime,hasAttachments&$top=25`,
    );
    let archived = 0;
    for (const message of response.value.filter((candidate) => candidate.hasAttachments)) {
      const attachments = await this.graph.request<{ value: FileAttachment[] }>(
        `/users/${encodeURIComponent(this.mailbox)}/messages/${encodeURIComponent(message.id)}/attachments`,
      );
      for (const attachment of attachments.value) {
        const isPdf = attachment.contentType === "application/pdf" || /\.pdf$/i.test(attachment.name ?? "");
        if (!isPdf || attachment.isInline || !attachment.contentBytes || !attachment.name) continue;
        const content = Buffer.from(attachment.contentBytes, "base64");
        await this.documents.putOnce({
          processId: `mail_${safeFilename(message.id)}_${safeFilename(attachment.id)}`,
          filename: safeFilename(attachment.name), contentType: "application/pdf", content,
        });
        archived += 1;
      }
    }
    return { messages: response.value.length, archived };
  }
}
