import { GraphError, type GraphClient } from "./graph-client.ts";
import { validateResolution, type ResolutionAction } from "../processing/exception-resolution.ts";

type Item = { id: string; fields?: Record<string, unknown> };
const text = (value: unknown) => typeof value === "string" ? value : "";
type ExceptionState = "Resuelta" | "Descartada";
type ProcessTerminalState = "resolved" | "discarded";

export class SharePointExceptionResolutionStore {
  private readonly graph: GraphClient;
  private readonly siteId: string;
  private readonly listName: string;
  private readonly processesList: string;
  private readonly now: () => Date;
  private readonly listIds = new Map<string, string>();

  constructor(graph: GraphClient, siteId: string, listName = "Excepciones", processesList = "ProcesosFacturas", now: () => Date = () => new Date()) {
    this.graph = graph; this.siteId = siteId; this.listName = listName; this.processesList = processesList; this.now = now;
  }

  async assign(exceptionId: string, responsible: string): Promise<void> {
    if (!responsible.trim()) throw new TypeError("responsible is required");
    const item = await this.item(exceptionId);
    this.assertOpen(item);
    await this.patch(exceptionId, { Responsable: responsible.trim(), Estado: "EnRevision" });
  }

  async resolve(input: { exceptionId: string; responsible: string; action: string; result: string }): Promise<{ state: ExceptionState; action: ResolutionAction }> {
    const item = await this.item(input.exceptionId);
    const currentState = text(item.fields?.Estado);
    const existingAction = text(item.fields?.AccionResolucion);
    if (["Resuelta", "Descartada"].includes(currentState)) {
      if (existingAction !== input.action) throw new TypeError("Exception is already closed");
      const resolution = validateResolution(text(item.fields?.Codigo), existingAction, text(item.fields?.Responsable), text(item.fields?.ResultadoResolucion));
      await this.syncProcess(item, resolution.finalState, text(item.fields?.FechaResolucion) || this.now().toISOString());
      return { state: resolution.finalState, action: resolution.action };
    }
    this.assertOpen(item);
    const resolution = validateResolution(text(item.fields?.Codigo), input.action, input.responsible, input.result);
    const resolvedAt = this.now().toISOString();
    await this.syncProcess(item, resolution.finalState, resolvedAt);
    await this.patch(input.exceptionId, {
      Responsable: input.responsible.trim(), Estado: resolution.finalState, AccionResolucion: resolution.action,
      ResultadoResolucion: input.result.trim(), FechaResolucion: resolvedAt,
    });
    return { state: resolution.finalState, action: resolution.action };
  }

  private async item(id: string): Promise<Item> {
    try { return await this.graph.request<Item>(`/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(this.listName)}/items/${encodeURIComponent(id)}?$expand=fields`); }
    catch (error) { if (error instanceof GraphError && error.status === 404) throw new TypeError("exceptionId was not found"); throw error; }
  }
  private async listId(name: string): Promise<string> {
    const cached = this.listIds.get(name);
    if (cached) return cached;
    const lists = await this.graph.request<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${encodeURIComponent(this.siteId)}/lists?$select=id,displayName`);
    const list = lists.value.find(({ displayName }) => displayName === name);
    if (!list) throw new Error(`SharePoint list '${name}' was not found`);
    this.listIds.set(name, list.id);
    return list.id;
  }
  private async syncProcess(exception: Item, exceptionState: ExceptionState, resolvedAt: string): Promise<void> {
    const processId = text(exception.fields?.CorrelationId);
    if (!processId) throw new TypeError("Exception does not reference a process");
    const listId = await this.listId(this.processesList);
    const escaped = processId.replace(/'/g, "''");
    const response = await this.graph.request<{ value: Item[] }>(`/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$filter=fields/ProcessId eq '${escaped}'&$top=2`, { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } });
    if (response.value.length !== 1) throw new TypeError("Exception process was not found uniquely");
    const targetState: ProcessTerminalState = exceptionState === "Descartada" ? "discarded" : "resolved";
    if (text(response.value[0].fields?.Estado) === targetState) return;
    await this.graph.request(`/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(response.value[0].id)}/fields`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ Estado: targetState, UpdatedAt: resolvedAt }),
    });
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
