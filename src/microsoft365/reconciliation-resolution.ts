import type { ReconciliationProposal } from "../reconciliation/types.ts";
import { GraphError, type GraphClient } from "./graph-client.ts";

type Item = { id: string; fields?: Record<string, unknown> };
type ListResponse = { value: Array<{ id: string; displayName: string }> };
type ItemResponse = { value: Item[] };
export type ReconciliationDecision = "confirm_match" | "reject_match";

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function path(value: string): string { return encodeURIComponent(value); }
function quote(value: string): string { return value.replace(/'/g, "''"); }

/**
 * Persists reconciliation proposals and the subsequent human decision in SharePoint Lists.
 * A proposal is deliberately never accepted when it says that human review is unnecessary.
 */
export class SharePointReconciliationStore {
  private readonly listIds = new Map<string, string>();
  private readonly graph: GraphClient;
  private readonly siteId: string;
  private readonly reconciliationsList: string;
  private readonly movementsList: string;
  private readonly now: () => Date;

  constructor(
    graph: GraphClient, siteId: string, reconciliationsList = "Conciliaciones",
    movementsList = "MovimientosBancarios", now: () => Date = () => new Date(),
  ) {
    this.graph = graph;
    this.siteId = siteId;
    this.reconciliationsList = reconciliationsList;
    this.movementsList = movementsList;
    this.now = now;
  }

  async propose(proposal: ReconciliationProposal): Promise<{ reconciliationId: string; state: "PendienteRevision"; created: boolean }> {
    if (!proposal.requiresHumanReview) throw new TypeError("Reconciliation proposals must require human review");
    if (!proposal.movementId.trim()) throw new TypeError("movementId is required");
    const existing = await this.find(this.reconciliationsList, "MovimientoId", proposal.movementId);
    if (existing) {
      if (text(existing.fields?.Estado) !== "PendienteRevision") throw new TypeError("A reconciliation already exists for this movement");
      return { reconciliationId: existing.id, state: "PendienteRevision", created: false };
    }
    const movement = await this.find(this.movementsList, "MovimientoId", proposal.movementId);
    if (!movement) throw new TypeError("Reconciliation movement was not found uniquely");
    const candidate = proposal.candidates[0];
    const item = await this.create(this.reconciliationsList, {
      Title: proposal.movementId,
      MovimientoId: proposal.movementId,
      FacturaIdPropuesta: candidate?.invoiceId ?? "",
      Clasificacion: proposal.classification,
      Puntuacion: candidate?.score ?? 0,
      Motivo: proposal.reason,
      Candidatos: JSON.stringify(proposal.candidates),
      RequiereRevision: true,
      Estado: "PendienteRevision",
      FechaPropuesta: this.now().toISOString(),
    });
    await this.patch(this.movementsList, movement.id, { Estado: "EnRevision" });
    return { reconciliationId: item.id, state: "PendienteRevision", created: true };
  }

  async decide(input: { reconciliationId: string; responsible: string; action: ReconciliationDecision; result: string }): Promise<{ state: "Conciliada" | "Rechazada"; action: ReconciliationDecision }> {
    const item = await this.item(this.reconciliationsList, input.reconciliationId);
    const state = text(item.fields?.Estado);
    if (state !== "PendienteRevision") throw new TypeError("Reconciliation is already decided");
    const movementId = text(item.fields?.MovimientoId);
    if (!movementId) throw new TypeError("Reconciliation does not reference a movement");
    const finalState = input.action === "confirm_match" ? "Conciliada" : "Rechazada";
    const at = this.now().toISOString();
    await this.patch(this.reconciliationsList, input.reconciliationId, {
      Estado: finalState, Responsable: input.responsible, Decision: input.action,
      ResultadoDecision: input.result, FechaDecision: at,
    });
    await this.setMovementState(movementId, finalState === "Conciliada" ? "Conciliado" : "EnRevision");
    return { state: finalState, action: input.action };
  }

  private async setMovementState(movementId: string, state: "EnRevision" | "Conciliado"): Promise<void> {
    const movement = await this.find(this.movementsList, "MovimientoId", movementId);
    if (!movement) throw new TypeError("Reconciliation movement was not found uniquely");
    await this.patch(this.movementsList, movement.id, { Estado: state });
  }

  private async listId(name: string): Promise<string> {
    const cached = this.listIds.get(name);
    if (cached) return cached;
    const lists = await this.graph.request<ListResponse>(`/sites/${path(this.siteId)}/lists?$select=id,displayName`);
    const list = lists.value.find((value) => value.displayName === name);
    if (!list) throw new TypeError(`SharePoint list '${name}' was not found`);
    this.listIds.set(name, list.id);
    return list.id;
  }

  private async find(listName: string, field: string, value: string): Promise<Item | undefined> {
    const listId = await this.listId(listName);
    const filter = encodeURIComponent(`fields/${field} eq '${quote(value)}'`);
    const response = await this.graph.request<ItemResponse>(`/sites/${path(this.siteId)}/lists/${path(listId)}/items?$expand=fields&$filter=${filter}`);
    if (response.value.length > 1) throw new TypeError(`Multiple ${listName} items match ${field}`);
    return response.value[0];
  }

  private async item(listName: string, id: string): Promise<Item> {
    try { return await this.graph.request<Item>(`/sites/${path(this.siteId)}/lists/${path(await this.listId(listName))}/items/${path(id)}?$expand=fields`); }
    catch (error) { if (error instanceof GraphError && error.status === 404) throw new TypeError("reconciliationId was not found"); throw error; }
  }

  private async create(listName: string, fields: Record<string, unknown>): Promise<Item> {
    return await this.graph.request<Item>(`/sites/${path(this.siteId)}/lists/${path(await this.listId(listName))}/items`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }),
    });
  }

  private async patch(listName: string, id: string, fields: Record<string, unknown>): Promise<void> {
    await this.graph.request(`/sites/${path(this.siteId)}/lists/${path(await this.listId(listName))}/items/${path(id)}/fields`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
  }
}
