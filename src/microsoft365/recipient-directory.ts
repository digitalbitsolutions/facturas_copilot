import type { RecipientDirectory, RecipientMasterRecord } from "../invoices/index.ts";
import type { GraphClient } from "./graph-client.ts";

type ListItem = { id: string; fields?: Record<string, unknown> };
const path = (value: string) => encodeURIComponent(value);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const active = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

/** Reads authorised invoice recipients; only used when recipient routing is enabled. */
export class SharePointRecipientDirectory implements RecipientDirectory {
  private readonly graph: GraphClient;
  private readonly siteId: string;
  private readonly listId: string;
  constructor(graph: GraphClient, siteId: string, listId = "MaestroReceptores") { this.graph = graph; this.siteId = siteId; this.listId = listId; }

  async listActive(): Promise<RecipientMasterRecord[]> {
    const response = await this.graph.request<{ value: ListItem[] }>(`/sites/${path(this.siteId)}/lists/${path(this.listId)}/items?expand=fields&$top=999`);
    return response.value.flatMap((item) => {
      const fields = item.fields ?? {}; const legalName = text(fields.RazonSocial);
      if (!legalName || !active(fields.Activo)) return [];
      const aliases = text(fields.Aliases)?.split(/[;\r\n]+/).map((alias) => alias.trim()).filter(Boolean);
      return [{ recipientId: text(fields.CodigoReceptor) ?? item.id, legalName, ...(text(fields.NIF) ? { taxId: text(fields.NIF) } : {}), ...(aliases?.length ? { aliases } : {}), active: true }];
    });
  }
}
