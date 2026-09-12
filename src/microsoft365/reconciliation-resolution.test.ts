import assert from "node:assert/strict";
import test from "node:test";
import { GraphClient } from "./graph-client.ts";
import { SharePointReconciliationStore } from "./reconciliation-resolution.ts";

function graph(responder: (path: string, init?: RequestInit) => Response): GraphClient {
  return new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => responder(new URL(url).pathname + new URL(url).search, init));
}

test("persists a review-only proposal and marks its movement for review", async () => {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const client = graph((path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path, body });
    if (path.includes("/lists?$select")) return Response.json({ value: [{ id: "recs", displayName: "Conciliaciones" }, { id: "moves", displayName: "MovimientosBancarios" }] });
    if (path.includes("recs/items?$expand") && path.includes("MovimientoId")) return Response.json({ value: [] });
    if (path.includes("moves/items?$expand")) return Response.json({ value: [{ id: "movement-item", fields: { MovimientoId: "mov-1" } }] });
    if (path.endsWith("recs/items")) return Response.json({ id: "rec-1" });
    if (path.endsWith("movement-item/fields")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${path}`);
  });
  const store = new SharePointReconciliationStore(client, "site", "Conciliaciones", "MovimientosBancarios", () => new Date("2026-09-12T10:00:00Z"));
  const result = await store.propose({ movementId: "mov-1", classification: "high", candidates: [{ invoiceId: "inv-1", score: 95, factors: [] }], requiresHumanReview: true, reason: "Automatic acceptance is disabled" });
  assert.deepEqual(result, { reconciliationId: "rec-1", state: "PendienteRevision", created: true });
  assert.deepEqual(calls.find((call) => call.path.endsWith("recs/items"))?.body, { fields: {
    Title: "mov-1", MovimientoId: "mov-1", FacturaIdPropuesta: "inv-1", Clasificacion: "high", Puntuacion: 95,
    Motivo: "Automatic acceptance is disabled", Candidatos: "[{\"invoiceId\":\"inv-1\",\"score\":95,\"factors\":[]}]",
    RequiereRevision: true, Estado: "PendienteRevision", FechaPropuesta: "2026-09-12T10:00:00.000Z",
  } });
  assert.deepEqual(calls.find((call) => call.path.endsWith("movement-item/fields"))?.body, { Estado: "EnRevision" });
});

test("rejects non-review proposals and records a human confirmation audit", async () => {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const client = graph((path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path, body });
    if (path.includes("/lists?$select")) return Response.json({ value: [{ id: "recs", displayName: "Conciliaciones" }, { id: "moves", displayName: "MovimientosBancarios" }] });
    if (path.includes("recs/items/rec-1?")) return Response.json({ id: "rec-1", fields: { Estado: "PendienteRevision", MovimientoId: "mov-1" } });
    if (path.includes("moves/items?$expand")) return Response.json({ value: [{ id: "movement-item" }] });
    if (path.endsWith("rec-1/fields") || path.endsWith("movement-item/fields")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${path}`);
  });
  const store = new SharePointReconciliationStore(client, "site", "Conciliaciones", "MovimientosBancarios", () => new Date("2026-09-12T10:00:00Z"));
  await assert.rejects(store.propose({ movementId: "mov-1", classification: "high", candidates: [], requiresHumanReview: false, reason: "unsafe" }), /must require human review/);
  assert.deepEqual(await store.decide({ reconciliationId: "rec-1", responsible: "reviewer@example.test", action: "confirm_match", result: "Reference and amount verified" }), { state: "Conciliada", action: "confirm_match" });
  assert.deepEqual(calls.find((call) => call.path.endsWith("rec-1/fields"))?.body, {
    Estado: "Conciliada", Responsable: "reviewer@example.test", Decision: "confirm_match", ResultadoDecision: "Reference and amount verified", FechaDecision: "2026-09-12T10:00:00.000Z",
  });
});
