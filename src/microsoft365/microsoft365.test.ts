import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError, GraphClient, GraphError, loadMicrosoft365Config, SharePointDocumentRepository, SharePointInvoiceMailboxPoller, SharePointSupplierDirectory } from "./index.ts";

const environment = {
  M365_TENANT_ID: "tenant", M365_CLIENT_ID: "client",
  M365_SHAREPOINT_SITE_URL: "https://company.sharepoint.com/sites/facturas",
  M365_SHAREPOINT_DRIVE_ID: "drive id", M365_INVOICE_FOLDER: "Facturas/2026",
  M365_BANK_FOLDER: "ExtractosBancarios/2026",
  M365_MAILBOX_ADDRESS: "facturas@company.test", M365_MAIL_FOLDER: "Inbox",
  M365_EXCEL_FILE_PATH: "Configuracion/RegistroFacturas.xlsx", M365_EXCEL_TABLE: "tblFacturas",
  M365_BANK_BATCH_TABLE: "tblLotesBancarios", M365_BANK_MOVEMENT_TABLE: "tblMovimientos",
  M365_RECONCILIATION_TABLE: "tblConciliaciones",
  M365_AI_BUILDER_MODEL_ID: "model",
};

test("loads and validates Microsoft 365 configuration", () => {
  const config = loadMicrosoft365Config(environment);
  assert.equal(config.invoiceFolder, "Facturas/2026");
});

test("reports every missing Microsoft 365 variable", () => {
  assert.throws(() => loadMicrosoft365Config({}), (error) => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.missingVariables.length, 14);
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
  const requests: Array<{ url: string; method: string }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET" });
    if (!init?.method) return new Response("missing", { status: 404 });
    assert.equal(init?.method, "PUT");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/pdf");
    return Response.json({ webUrl: "https://company.sharepoint.com/file.pdf" }, { status: 201 });
  };
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fakeFetch);
  const repository = new SharePointDocumentRepository(graph, "drive id", "Facturas/2026");
  const stored = await repository.putOnce({ processId: "process", filename: "Factura 1.pdf", contentType: "application/pdf", content: new Uint8Array([1]) });
  assert.match(requests[1].url, /drives\/drive%20id\/root:\/Facturas\/2026\/process_Factura%201\.pdf:\/content$/);
  assert.equal(stored.url, "https://company.sharepoint.com/file.pdf");
  assert.equal(stored.created, true);
});

test("loads active supplier master records from SharePoint", async () => {
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (url) => {
    assert.match(String(url), /lists\/MaestroProveedores\/items\?expand=fields&\$top=999$/);
    return Response.json({ value: [
      { id: "1", fields: { CodigoProveedor: "SUP-1", RazonSocial: "Proveedor Uno SL", NIF: "B12345678", Aliases: "P1;Proveedor 1", Activo: true } },
      { id: "2", fields: { RazonSocial: "Proveedor Inactivo", Activo: false } },
    ] });
  });
  const records = await new SharePointSupplierDirectory(graph, "site").listActive();
  assert.deepEqual(records, [{ supplierId: "SUP-1", legalName: "Proveedor Uno SL", taxId: "B12345678", aliases: ["P1", "Proveedor 1"], active: true }]);
});

test("does not overwrite an existing SharePoint document", async () => {
  const methods: string[] = [];
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (_url, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json({ webUrl: "https://company.sharepoint.com/existing.pdf" });
  });
  const repository = new SharePointDocumentRepository(graph, "drive", "Facturas");
  const stored = await repository.putOnce({ processId: "stable", filename: "invoice.pdf", contentType: "application/pdf", content: new Uint8Array([1]) });

  assert.deepEqual(stored, { url: "https://company.sharepoint.com/existing.pdf", created: false });
  assert.deepEqual(methods, ["GET"]);
});

test("mail poller downloads file attachments without selecting derived contentBytes", async () => {
  const requestedUrls: string[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requestedUrls.push(String(url));
    if (init?.method === "PUT") return Response.json({ webUrl: "https://company.sharepoint.com/invoice.pdf" }, { status: 201 });
    if (String(url).includes("/root:/Facturas/")) return new Response("missing", { status: 404 });
    if (String(url).includes("/attachments")) {
      return Response.json({ value: [{ id: "attachment", name: "invoice.pdf", contentType: "application/pdf", contentBytes: "AQ==", isInline: false }] });
    }
    return Response.json({ value: [{ id: "message", hasAttachments: true }] });
  };
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fakeFetch);
  const repository = new SharePointDocumentRepository(graph, "drive", "Facturas");
  const result = await new SharePointInvoiceMailboxPoller(graph, "facturas@company.test", repository).run();

  assert.deepEqual(result, { messages: 1, archived: 1 });
  const attachmentRequest = requestedUrls.find((url) => url.includes("/attachments"));
  assert.ok(attachmentRequest);
  assert.doesNotMatch(attachmentRequest, /contentBytes|\$select/);
  const uploadRequest = requestedUrls.find((url) => url.endsWith(":/content"));
  assert.match(uploadRequest ?? "", /\/mail_[a-f0-9]{20}_invoice\.pdf:\/content$/);
  assert.ok((uploadRequest ?? "").length < 180);
});
