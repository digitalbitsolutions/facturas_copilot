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
