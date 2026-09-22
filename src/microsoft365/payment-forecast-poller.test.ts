import assert from "node:assert/strict";
import test from "node:test";
import XlsxPopulate from "xlsx-populate";
import { GraphClient } from "./graph-client.ts";
import { SharePointPaymentForecastPoller } from "./payment-forecast-poller.ts";

async function forecastWorkbook(): Promise<ArrayBuffer> {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const sheet = workbook.sheet(0).name("PrevisionPagos");
  sheet.cell("A1").value([["PrevisionId", "NumeroFactura", "Proveedor", "NIFProveedor", "FechaFactura", "FechaVencimiento", "ImporteFactura", "Moneda", "FechaPagoPrevista", "ImportePagoPrevisto", "EstadoPrevision", "ReferenciaPago", "MetodoPago", "Observaciones", "FuenteDocumento", "ConfianzaExtraccion", "RequiereRevision"], ["PREV-1", "F-1", "Proveedor", "B123", "2026-09-01", "2026-09-30", 12, "EUR", "2026-09-29", 12, "Programado", "F-1", "Transferencia", "", "F-1.pdf", "Alta", "No"]]);
  return (await workbook.outputAsync()) as ArrayBuffer;
}

test("imports forecasts without Graph OData filters on custom columns", async () => {
  const content = await forecastWorkbook();
  const calls: Array<{ url: string; method: string }> = [];
  let moveAttempts = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? "GET"; calls.push({ url, method });
    if (url.includes("root:/PrevisionesPagos:/children")) return Response.json({ value: [{ id: "file-1", name: "forecast.xlsx", file: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }] });
    if (url.endsWith("/content")) return new Response(content);
    if (url.includes("/lists?$select=id,displayName")) return Response.json({ value: [{ id: "imports", displayName: "ImportacionesPrevisiones" }, { id: "forecasts", displayName: "PrevisionesPagos" }, { id: "history", displayName: "HistorialPrevisiones" }, { id: "exceptions", displayName: "Excepciones" }] });
    if (method === "GET" && url.includes("/items?%24expand=fields")) return Response.json({ value: [] });
    if (method === "POST" && url.includes("/items")) return Response.json({ id: "created" }, { status: 201 });
    if (method === "PATCH") { moveAttempts += 1; if (moveAttempts === 1) return new Response("name collision", { status: 409 }); return Response.json({}); }
    throw new Error(`Unexpected Graph request: ${method} ${url}`);
  }) as typeof fetch;
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fetchImpl);
  const poller = new SharePointPaymentForecastPoller(graph, { siteId: "site", driveId: "drive", incomingFolder: "PrevisionesPagos", processedFolder: "ProcesadosPrevisiones", errorFolder: "ErroresPrevisiones", importsList: "ImportacionesPrevisiones", forecastsList: "PrevisionesPagos", historyList: "HistorialPrevisiones", exceptionsList: "Excepciones" });

  assert.deepEqual(await poller.run(), { found: 1, processed: 1, errors: 0 });
  assert.ok(calls.some((call) => call.url.includes("/lists/imports/items?%24expand=fields")));
  assert.ok(calls.some((call) => call.url.includes("/lists/forecasts/items?%24expand=fields")));
  assert.ok(calls.every((call) => !call.url.includes("%24filter") && !call.url.includes("$filter")));
  assert.equal(moveAttempts, 2);
});

test("does not treat batch metadata as a forecast update", () => {
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fetch);
  const poller = new SharePointPaymentForecastPoller(graph, { siteId: "site", driveId: "drive", incomingFolder: "in", processedFolder: "done", errorFolder: "error", importsList: "imports", forecastsList: "forecasts", historyList: "history", exceptionsList: "exceptions" });
  const existing = { Title: "PREV-1", PrevisionId: "PREV-1", LoteId: "old-batch", ArchivoOrigen: "old.xlsx", Estado: "Programado", FechaPagoPrevista: "2026-10-01" };
  const uploaded = { ...existing, LoteId: "new-batch", ArchivoOrigen: "new.xlsx" };
  assert.equal((poller as any).equal(existing, uploaded), true);
  assert.equal((poller as any).equal(existing, { ...uploaded, Estado: "Pendiente" }), false);
});
