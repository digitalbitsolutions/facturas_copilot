import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError, GraphClient, GraphError, loadMicrosoft365Config, SharePointDocumentRepository, SharePointExceptionResolutionStore, SharePointInvoiceMailboxPoller, SharePointProcessStore, SharePointSupplierDirectory } from "./index.ts";

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

test("persists and reloads invoice process state by stable process ID", async () => {
  let storedFields: Record<string, unknown> | undefined;
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => {
    const path = String(url);
    if (path.endsWith("/lists?$select=id,displayName")) return Response.json({ value: [{ id: "processes", displayName: "ProcesosFacturas" }] });
    if (init?.method === "POST") {
      storedFields = (JSON.parse(String(init.body)) as { fields: Record<string, unknown> }).fields;
      return Response.json({ id: "item-1", fields: storedFields }, { status: 201 });
    }
    return Response.json({ value: storedFields ? [{ id: "item-1", fields: storedFields }] : [] });
  });
  const store = new SharePointProcessStore(graph, "site");
  await store.save({
    processId: "stable-id", state: "classified", documentKind: "invoice", classificationConfidence: 0.91,
    classificationReasons: ["invoice heading"],
    input: { messageId: "message", attachmentId: "attachment", sender: "sender@example.test", receivedAt: "2026-09-11T08:00:00Z", originalFilename: "invoice.pdf", contentType: "application/pdf" },
    updatedAt: "2026-09-11T08:01:00Z",
  });
  const loaded = await store.get("stable-id");
  assert.equal(loaded?.state, "classified");
  assert.equal(loaded?.documentKind, "invoice");
  assert.deepEqual(loaded?.classificationReasons, ["invoice heading"]);
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
  const processed: Array<{ sender: string; filename: string }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requestedUrls.push(String(url));
    if (String(url).includes("/attachments")) {
      return Response.json({ value: [{ id: "attachment", name: "invoice.pdf", contentType: "application/pdf", contentBytes: "AQ==", isInline: false }] });
    }
    return Response.json({ value: [{ id: "message", receivedDateTime: "2026-09-11T08:00:00Z", hasAttachments: true, from: { emailAddress: { address: "sender@example.test" } } }] });
  };
  const graph = new GraphClient({ getAccessToken: async () => "token" }, fakeFetch);
  const processor = { process: async (input: import("../processing/types.ts").AttachmentInput) => {
    processed.push({ sender: input.sender, filename: input.originalFilename });
    const { content: _content, ...metadata } = input;
    return { processId: "process", state: "completed" as const, input: metadata, updatedAt: "2026-09-11T08:01:00Z", idempotentReplay: false };
  } };
  const result = await new SharePointInvoiceMailboxPoller(graph, "facturas@company.test", processor, "2026-09-11T07:59:59Z").run();

  assert.deepEqual(result, { messages: 1, pdfAttachments: 1, completed: 1, diverted: 0, reviewRequired: 0, failed: 0, idempotentReplays: 0 });
  assert.deepEqual(processed, [{ sender: "sender@example.test", filename: "invoice.pdf" }]);
  const attachmentRequest = requestedUrls.find((url) => url.includes("/attachments"));
  assert.ok(attachmentRequest);
  assert.doesNotMatch(attachmentRequest, /contentBytes|\$select/);
});

test("mail poller ignores messages older than the activation cutoff", async () => {
  let attachmentRequests = 0;
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (url) => {
    if (String(url).includes("/attachments")) attachmentRequests += 1;
    return Response.json({ value: [{ id: "old", receivedDateTime: "2026-09-10T23:59:59Z", hasAttachments: true }] });
  });
  const processor = { process: async () => { throw new Error("Old messages must not be processed"); } };
  const result = await new SharePointInvoiceMailboxPoller(graph, "facturas@company.test", processor, "2026-09-11T00:00:00Z").run();
  assert.equal(result.pdfAttachments, 0);
  assert.equal(attachmentRequests, 0);
});

test("resolving an exception synchronizes its process to a terminal state", async () => {
  const patches: Array<{ url: string; fields: Record<string, unknown> }> = [];
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => {
    const path = String(url);
    if (path.endsWith("/lists/Excepciones/items/exception-1?$expand=fields")) {
      return Response.json({ id: "exception-1", fields: { Estado: "EnRevision", Codigo: "EX-07", CorrelationId: "process-1" } });
    }
    if (path.endsWith("/lists?$select=id,displayName")) return Response.json({ value: [{ id: "processes", displayName: "ProcesosFacturas" }] });
    if (path.includes("/lists/processes/items?$expand=fields")) return Response.json({ value: [{ id: "process-item", fields: { Estado: "review_required" } }] });
    if (init?.method === "PATCH") {
      patches.push({ url: path, fields: (JSON.parse(String(init.body)) as Record<string, unknown>) });
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  const store = new SharePointExceptionResolutionStore(graph, "site", "Excepciones", "ProcesosFacturas", () => new Date("2026-09-11T12:00:00Z"));
  const result = await store.resolve({ exceptionId: "exception-1", responsible: "reviewer@example.test", action: "confirm_duplicate", result: "Duplicate confirmed" });

  assert.deepEqual(result, { state: "Descartada", action: "confirm_duplicate" });
  assert.deepEqual(patches, [
    { url: "https://graph.microsoft.com/v1.0/sites/site/lists/processes/items/process-item/fields", fields: { Estado: "discarded", UpdatedAt: "2026-09-11T12:00:00.000Z" } },
    { url: "https://graph.microsoft.com/v1.0/sites/site/lists/Excepciones/items/exception-1/fields", fields: {
      Responsable: "reviewer@example.test", Estado: "Descartada", AccionResolucion: "confirm_duplicate", ResultadoResolucion: "Duplicate confirmed", FechaResolucion: "2026-09-11T12:00:00.000Z",
    } },
  ]);
});

test("replaying a closed exception synchronizes a legacy review process without rewriting the audit", async () => {
  const patches: Array<{ url: string; fields: Record<string, unknown> }> = [];
  const graph = new GraphClient({ getAccessToken: async () => "token" }, async (url, init) => {
    const path = String(url);
    if (path.endsWith("/lists/Excepciones/items/exception-1?$expand=fields")) {
      return Response.json({ id: "exception-1", fields: {
        Estado: "Resuelta", Codigo: "EX-06", CorrelationId: "process-1", Responsable: "reviewer@example.test",
        AccionResolucion: "update_supplier_and_resubmit", ResultadoResolucion: "Supplier restored", FechaResolucion: "2026-09-11T12:00:00Z",
      } });
    }
    if (path.endsWith("/lists?$select=id,displayName")) return Response.json({ value: [{ id: "processes", displayName: "ProcesosFacturas" }] });
    if (path.includes("/lists/processes/items?$expand=fields")) return Response.json({ value: [{ id: "process-item", fields: { Estado: "review_required" } }] });
    if (init?.method === "PATCH") {
      patches.push({ url: path, fields: (JSON.parse(String(init.body)) as Record<string, unknown>) });
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  const store = new SharePointExceptionResolutionStore(graph, "site", "Excepciones", "ProcesosFacturas");
  const result = await store.resolve({ exceptionId: "exception-1", responsible: "reviewer@example.test", action: "update_supplier_and_resubmit", result: "Ignored on replay" });

  assert.deepEqual(result, { state: "Resuelta", action: "update_supplier_and_resubmit" });
  assert.deepEqual(patches, [{
    url: "https://graph.microsoft.com/v1.0/sites/site/lists/processes/items/process-item/fields",
    fields: { Estado: "resolved", UpdatedAt: "2026-09-11T12:00:00Z" },
  }]);
});
