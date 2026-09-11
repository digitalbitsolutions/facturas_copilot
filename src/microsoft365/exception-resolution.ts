import { GraphError, type GraphClient } from "./graph-client.ts";
import { validateResolution, type ResolutionAction } from "../processing/exception-resolution.ts";

type Item = { id: string; fields?: Record<string, unknown> };
const text = (value: unknown) => typeof value === "string" ? value : "";

export class SharePointExceptionResolutionStore {
  private readonly graph: GraphClient;
  private readonly siteId: string;
  private readonly listName: string;
  private readonly now: () => Date;

  constructor(graph: GraphClient, siteId: string, listName = "Excepciones", now: () => Date = () => new Date()) {
    this.graph = graph;
    this.siteId = siteId;
    this.listName = listName;
    this.now = now;
  }

  async assign(exceptionId: string, responsible: string): Promise<void> {
    if (!responsible.trim()) throw new TypeError("responsible is required");
    const item = await this.item(exceptionId);
    this.assertOpen(item);
    await this.patch(exceptionId, { Responsable: responsible.trim(), Estado: "EnRevision" });
  }

  async resolve(input: { exceptionId: string; responsible: string; action: string; result: string }): Promise<{ state: "Resuelta" | "Descartada"; action: ResolutionAction }> {
    const item = await this.item(input.exceptionId);
    this.assertOpen(item);
    const resolution = validateResolution(text(item.fields?.Codigo), input.action, input.responsible, input.result);
    await this.patch(input.exceptionId, {
      Responsable: input.responsible.trim(), Estado: resolution.finalState, AccionResolucion: resolution.action,
      ResultadoResolucion: input.result.trim(), FechaResolucion: this.now().toISOString(),
    });
    return { state: resolution.finalState, action: resolution.action };
  }

  private async item(id: string): Promise<Item> {
    try { return await this.graph.request<Item>(`/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(this.listName)}/items/${encodeURIComponent(id)}?$expand=fields`); }
    catch (error) { if (error instanceof GraphError && error.status === 404) throw new TypeError("exceptionId was not found"); throw error; }
  }
  private assertOpen(item: Item): void {
    if (!item.fields) throw new TypeError("exception fields are unavailable");
    if (!["Abierta", "EnRevision"].includes(text(item.fields.Estado))) throw new TypeError("Exception is already closed");
  }
  private async patch(id: string, fields: Record<string, unknown>): Promise<void> {
    await this.graph.request(`/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(this.listName)}/items/${encodeURIComponent(id)}/fields`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
  }
}
