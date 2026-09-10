import type { DocumentRepository } from "../processing/types.ts";
import { GraphError, type GraphClient } from "./graph-client.ts";

function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export class SharePointDocumentRepository implements DocumentRepository {
  private readonly graph: GraphClient;
  private readonly driveId: string;
  private readonly folder: string;

  constructor(graph: GraphClient, driveId: string, folder: string) {
    this.graph = graph;
    this.driveId = driveId;
    this.folder = folder;
  }

  async putOnce(input: { processId: string; filename: string; contentType: string; content: Uint8Array }): Promise<{ url: string; created: boolean }> {
    const filename = `${input.processId}_${input.filename}`;
    const path = encodePath(`${this.folder}/${filename}`);
    const itemPath = `/drives/${encodeURIComponent(this.driveId)}/root:/${path}`;
    try {
      const existing = await this.graph.request<{ webUrl: string }>(itemPath);
      if (!existing.webUrl) throw new Error("Existing SharePoint document did not include webUrl");
      return { url: existing.webUrl, created: false };
    } catch (error) {
      if (!(error instanceof GraphError) || error.status !== 404) throw error;
    }
    const item = await this.graph.request<{ webUrl: string }>(
      `${itemPath}:/content`,
      { method: "PUT", headers: { "content-type": input.contentType }, body: input.content as unknown as BodyInit },
    );
    if (!item.webUrl) throw new Error("Microsoft Graph upload response did not include webUrl");
    return { url: item.webUrl, created: true };
  }
}
