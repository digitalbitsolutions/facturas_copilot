import assert from "node:assert/strict";
import test from "node:test";
import XlsxPopulate from "xlsx-populate";
import { bankImportConfigForProfile, parseBankFile, SharePointBankPoller } from "./bank-poller.ts";
import { GraphClient } from "./graph-client.ts";

test("parseBankFile reads the first worksheet and its headings", async () => {
  const book = await XlsxPopulate.fromBlankAsync();
  book.sheet(0).cell("A1").value([["FechaMovimiento", "Concepto", "Importe", "Moneda"], ["01/09/2026", "Cuota", "12,50", "EUR"]]);
  const content = await book.outputAsync();
  assert.deepEqual(await parseBankFile("extracto.xlsx", content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)), [
    { FechaMovimiento: "01/09/2026", Concepto: "Cuota", Importe: "12,50", Moneda: "EUR" },
  ]);
});

test("parseBankFile rejects unsupported bank formats", async () => {
  await assert.rejects(() => parseBankFile("extracto.pdf", new ArrayBuffer(0)), /Only/);
});

test("parseBankFile keeps commas inside quoted CSV fields", async () => {
  const content = Buffer.from('fecha_operacion,concepto,importe\n2026-09-12,"ADEUDO, FACTURA P26",-387.19\n');
  assert.deepEqual(await parseBankFile("extracto.csv", content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)), [
    { fecha_operacion: "2026-09-12", concepto: "ADEUDO, FACTURA P26", importe: "-387.19" },
  ]);
});

test("selects the versioned signed CSV profile and rejects unknown versions", () => {
  const profile = bankImportConfigForProfile("bankinter-simulated-csv-v1");
  assert.equal(profile.debitSign, "preserve");
  assert.equal(profile.columns.bookingDate, "fecha_operacion");
  assert.throws(() => bankImportConfigForProfile("unknown-v1"), /Unsupported BANK_IMPORT_PROFILE/);
});

test("does not create a second bank batch when its source hash was already persisted", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("root:/ExtractosBancarios:/children")) return Response.json({ value: [{ id: "file-1", name: "extract.csv", file: { mimeType: "text/csv" } }] });
    if (url.endsWith("/content")) return new Response("fecha_operacion,concepto,importe\n2026-09-12,ADEUDO,-100.00\n");
    if (url.includes("/lists?$select=id,displayName")) return Response.json({ value: [{ id: "imports", displayName: "ImportacionesBancarias" }, { id: "movements", displayName: "MovimientosBancarios" }] });
    if (url.includes("HashOrigen")) return Response.json({ value: [{ id: "existing-batch" }] });
    if (method === "PATCH") return Response.json({});
    throw new Error(`Unexpected Graph request: ${method} ${url}`);
  }) as typeof fetch;
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fetchImpl, "https://graph.test/v1.0");
  const poller = new SharePointBankPoller(graph, {
    siteId: "site", driveId: "drive", incomingFolder: "ExtractosBancarios", processedFolder: "Procesados", errorFolder: "Errores",
    importsList: "ImportacionesBancarias", movementsList: "MovimientosBancarios", exceptionsList: "Excepciones", importConfig: bankImportConfigForProfile("bankinter-simulated-csv-v1"),
  });

  assert.deepEqual(await poller.run(), { found: 1, processed: 1, errors: 0 });
  assert.equal(calls.filter((call) => call.method === "POST" && call.url.includes("/items")).length, 0);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
});
