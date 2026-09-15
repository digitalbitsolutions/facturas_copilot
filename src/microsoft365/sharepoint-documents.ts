import type { DocumentRepository } from "../processing/types.ts";
import { GraphError, type GraphClient } from "./graph-client.ts";

function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function withCollisionSuffix(path: string, processId: string): string {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash + 1) : "";
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const extension = filename.lastIndexOf(".");
  const base = extension > 0 ? filename.slice(0, extension) : filename;
  const suffix = extension > 0 ? filename.slice(extension) : "";
  return `${folder}${base}_${processId.slice(0, 10)}${suffix}`;
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

  private async ensureFolders(relativePath: string): Promise<void> {
    const folders = relativePath.split("/").filter(Boolean);
    let currentPath = this.folder;
    for (const folder of folders) {
      const parentPath = encodePath(currentPath);
      const candidatePath = encodePath(`${currentPath}/${folder}`);
      try {
        await this.graph.request(`/drives/${encodeURIComponent(this.driveId)}/root:/${candidatePath}`);
      } catch (error) {
        if (!(error instanceof GraphError) || error.status !== 404) throw error;
        try {
          await this.graph.request(
            `/drives/${encodeURIComponent(this.driveId)}/root:/${parentPath}:/children`,
            {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: folder, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
            },
          );
        } catch (createError) {
          if (!(createError instanceof GraphError) || createError.status !== 409) throw createError;
        }
      }
      currentPath = `${currentPath}/${folder}`;
    }
  }

  async putOnce(input: { processId: string; filename: string; contentType: string; content: Uint8Array }): Promise<{ url: string; created: boolean; filename: string }> {
    const relativePath = input.filename.split("/").filter(Boolean).join("/");
    if (!relativePath) throw new Error("SharePoint document filename is required");
    const parts = relativePath.split("/");
    await this.ensureFolders(parts.slice(0, -1).join("/"));
    let finalPath = relativePath;
    let path = encodePath(`${this.folder}/${finalPath}`);
    let itemPath = `/drives/${encodeURIComponent(this.driveId)}/root:/${path}`;
    try {
      const existing = await this.graph.request<{ webUrl: string }>(itemPath);
      if (!existing.webUrl) throw new Error("Existing SharePoint document did not include webUrl");
      finalPath = withCollisionSuffix(relativePath, input.processId);
      path = encodePath(`${this.folder}/${finalPath}`);
      itemPath = `/drives/${encodeURIComponent(this.driveId)}/root:/${path}`;
      try {
        const collision = await this.graph.request<{ webUrl: string }>(itemPath);
        if (!collision.webUrl) throw new Error("Existing SharePoint collision document did not include webUrl");
        return { url: collision.webUrl, created: false, filename: finalPath };
      } catch (collisionError) {
        if (!(collisionError instanceof GraphError) || collisionError.status !== 404) throw collisionError;
      }
    } catch (error) {
      if (!(error instanceof GraphError) || error.status !== 404) throw error;
    }
    const item = await this.graph.request<{ webUrl: string }>(
      `${itemPath}:/content`,
      { method: "PUT", headers: { "content-type": input.contentType }, body: input.content as unknown as BodyInit },
    );
    if (!item.webUrl) throw new Error("Microsoft Graph upload response did not include webUrl");
    return { url: item.webUrl, created: true, filename: finalPath };
  }
}
