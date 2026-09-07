import type { DocumentRepository } from "../processing/types.ts";
import type { GraphClient } from "./graph-client.ts";

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

  async putOnce(input: { processId: string; filename: string; contentType: string; content: Uint8Array }): Promise<{ url: string }> {
    const filename = `${input.processId}_${input.filename}`;
    const path = encodePath(`${this.folder}/${filename}`);
    const item = await this.graph.request<{ webUrl: string }>(
      `/drives/${encodeURIComponent(this.driveId)}/root:/${path}:/content`,
      { method: "PUT", headers: { "content-type": input.contentType }, body: input.content as unknown as BodyInit },
    );
    if (!item.webUrl) throw new Error("Microsoft Graph upload response did not include webUrl");
    return { url: item.webUrl };
  }
}
