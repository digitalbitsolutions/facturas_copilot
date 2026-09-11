import type { SupplierDirectory, SupplierMasterRecord } from "../invoices/index.ts";
import type { GraphClient } from "./graph-client.ts";

type ListItem = {
  id: string;
  fields?: Record<string, unknown>;
};

function graphPath(value: string): string { return encodeURIComponent(value); }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function active(value: unknown): boolean { return value === true || value === 1 || value === "1" || value === "true"; }

export class SharePointSupplierDirectory implements SupplierDirectory {
  private readonly graph: GraphClient;
  private readonly siteId: string;
  private readonly listId: string;

  constructor(
    graph: GraphClient,
    siteId: string,
    listId: string = "MaestroProveedores",
  ) {
    this.graph = graph;
    this.siteId = siteId;
    this.listId = listId;
  }

  async listActive(): Promise<SupplierMasterRecord[]> {
    const response = await this.graph.request<{ value: ListItem[] }>(
      `/sites/${graphPath(this.siteId)}/lists/${graphPath(this.listId)}/items?expand=fields&$top=999`,
    );
    return response.value.flatMap((item) => {
      const fields = item.fields ?? {};
      const legalName = text(fields.RazonSocial) ?? text(fields.Title);
      if (!legalName || !active(fields.Activo)) return [];
      const aliases = text(fields.Aliases)?.split(/[;\r\n]+/).map((alias) => alias.trim()).filter(Boolean);
      return [{
        supplierId: text(fields.CodigoProveedor) ?? item.id,
        legalName,
        ...(text(fields.NIF) ? { taxId: text(fields.NIF) } : {}),
        ...(aliases?.length ? { aliases } : {}),
        active: true,
      }];
    });
  }
}
