import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError, GraphClient, GraphError, loadMicrosoft365Config, SharePointDocumentRepository } from "./index.ts";

const environment = {
  M365_TENANT_ID: "tenant", M365_CLIENT_ID: "client",
  M365_SHAREPOINT_SITE_URL: "https://company.sharepoint.com/sites/facturas",
  M365_SHAREPOINT_DRIVE_ID: "drive id", M365_INVOICE_FOLDER: "Facturas/2026",
  M365_MAILBOX_ADDRESS: "facturas@company.test", M365_MAIL_FOLDER: "Inbox",
  M365_EXCEL_FILE_PATH: "Configuracion/RegistroFacturas.xlsx", M365_EXCEL_TABLE: "tblFacturas",
  M365_AI_BUILDER_MODEL_ID: "model",
};

test("loads and validates Microsoft 365 configuration", () => {
  const config = loadMicrosoft365Config(environment);
  assert.equal(config.invoiceFolder, "Facturas/2026");
});

test("reports every missing Microsoft 365 variable", () => {
  assert.throws(() => loadMicrosoft365Config({}), (error) => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.missingVariables.length, 10);
    return true;
  });
});

test("rejects a library URL where a SharePoint site URL is expected", () => {
  assert.throws(() => loadMicrosoft365Config({ ...environment, M365_SHAREPOINT_SITE_URL: "https://company.sharepoint.com/sites/facturas/Shared%20Documents" }), /must identify a site/);
});

test("Graph client authenticates and retries a transient response once", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-token");
    if (calls === 1) return new Response("busy", { status: 503 });
    return Response.json({ value: 42 });
  };
  const graph = new GraphClient({ getAccessToken: async () => "access-token" }, fakeFetch);
  assert.deepEqual(await graph.request("/test"), { value: 42 });
  assert.equal(calls, 2);
});

test("Graph client returns a safe typed error", async () => {
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async () => new Response("denied detail", { status: 403 }));
  await assert.rejects(() => graph.request("/test"), (error) => error instanceof GraphError && error.status === 403);
});

test("uploads a deterministic SharePoint path", async () => {
  let requestedUrl = "";
  const fakeFetch: typeof fetch = async (url, init) => {
    requestedUrl = String(url);
    assert.equal(init?.method, "PUT");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/pdf");
    return Response.json({ webUrl: "https://company.sharepoint.com/file.pdf" }, { status: 201 });
  };
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fakeFetch);
  const repository = new SharePointDocumentRepository(graph, "drive id", "Facturas/2026");
  const stored = await repository.putOnce({ processId: "process", filename: "Factura 1.pdf", contentType: "application/pdf", content: new Uint8Array([1]) });
  assert.match(requestedUrl, /drives\/drive%20id\/root:\/Facturas\/2026\/process_Factura%201\.pdf:\/content$/);
  assert.equal(stored.url, "https://company.sharepoint.com/file.pdf");
});
