import assert from "node:assert/strict";
import test from "node:test";
import { GraphClient } from "./graph-client.ts";
import { SharePointPaymentQueryProjector } from "./payment-query-projector.ts";

test("excludes invoices marked as non-payable and removes their stale payment row", async () => {
  const calls: Array<{ path: string; method?: string }> = [];
  const client = new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({ path, method: init?.method });
    if (path.includes("/lists?$select")) return Response.json({ value: ["RegistroFacturas", "PrevisionesPagos", "Conciliaciones", "MovimientosBancarios", "ConsultaPagosCopilot"].map((displayName) => ({ id: displayName, displayName })) });
    if (path.includes("RegistroFacturas/items?%24expand")) return Response.json({ value: [{ id: "invoice", fields: { ProcessId: "invoice-1", Proveedor: "EMAS", NumeroFactura: "F26", ExcluirDePagos: true } }] });
    if (path.includes("PrevisionesPagos/items?%24expand") || path.includes("Conciliaciones/items?%24expand") || path.includes("MovimientosBancarios/items?%24expand")) return Response.json({ value: [] });
    if (path.includes("ConsultaPagosCopilot/items?%24expand")) return Response.json({ value: [{ id: "stale", fields: { ConsultaId: "invoice:invoice-1" } }] });
    if (path.endsWith("ConsultaPagosCopilot/items/stale") && init?.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${path}`);
  });
  const result = await new SharePointPaymentQueryProjector(client, { siteId: "site", invoicesList: "RegistroFacturas", forecastsList: "PrevisionesPagos", reconciliationsList: "Conciliaciones", movementsList: "MovimientosBancarios", queryList: "ConsultaPagosCopilot" }).run();
  assert.deepEqual(result, { projected: 0 });
  assert.ok(calls.some((call) => call.method === "DELETE" && call.path.endsWith("ConsultaPagosCopilot/items/stale")));
});

test("projects presentation amounts in euros alongside minor-unit storage", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const client = new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path.includes("/lists?$select")) return Response.json({ value: ["RegistroFacturas", "PrevisionesPagos", "Conciliaciones", "MovimientosBancarios", "ConsultaPagosCopilot"].map((displayName) => ({ id: displayName, displayName })) });
    if (path.includes("RegistroFacturas/items?%24expand")) return Response.json({ value: [{ id: "invoice", fields: { ProcessId: "invoice-1", Proveedor: "EMAS", NumeroFactura: "F26", Total: 79.86, Moneda: "EUR" } }] });
    if (path.includes("PrevisionesPagos/items?%24expand")) return Response.json({ value: [{ id: "forecast", fields: { PrevisionId: "PREV-1", Proveedor: "EMAS", NumeroFactura: "F26", ImportePagoPrevistoMenor: 7986, Estado: "Programado" } }] });
    if (path.includes("Conciliaciones/items?%24expand") || path.includes("MovimientosBancarios/items?%24expand") || path.includes("ConsultaPagosCopilot/items?%24expand")) return Response.json({ value: [] });
    if (path.endsWith("ConsultaPagosCopilot/items") && init?.method === "POST") { writes.push((JSON.parse(String(init.body)) as { fields: Record<string, unknown> }).fields); return Response.json({ id: "query" }, { status: 201 }); }
    throw new Error(`Unexpected ${path}`);
  });
  await new SharePointPaymentQueryProjector(client, { siteId: "site", invoicesList: "RegistroFacturas", forecastsList: "PrevisionesPagos", reconciliationsList: "Conciliaciones", movementsList: "MovimientosBancarios", queryList: "ConsultaPagosCopilot" }).run();
  assert.equal(writes[0].ImporteFacturaMenor, 7986);
  assert.equal(writes[0].ImporteFacturaPresentacion, "79,86 EUR");
  assert.equal(writes[0].ImportePagoPrevistoMenor, 7986);
  assert.equal(writes[0].ImportePagoPrevistoPresentacion, "79,86 EUR");
  assert.equal(writes[0].ImportePendientePresentacion, "79,86 EUR");
});
