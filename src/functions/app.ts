import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { importBankRequest, reconcileBankRequest, validateInvoiceRequest } from "../api/services.ts";

function json(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body, headers: { "content-type": "application/json; charset=utf-8" } };
}

async function execute(request: HttpRequest, context: InvocationContext, operation: (body: unknown) => unknown): Promise<HttpResponseInit> {
  try {
    return json(200, operation(await request.json()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    context.warn("Request rejected", { message });
    return json(400, { error: { code: "invalid_request", message } });
  }
}

app.http("health", {
  route: "health", methods: ["GET"], authLevel: "anonymous",
  handler: async () => json(200, { status: "ok", service: "facturas-copilot", version: "3.0" }),
});

app.http("validateInvoice", {
  route: "invoices/validate", methods: ["POST"], authLevel: "anonymous",
  handler: (request, context) => execute(request, context, validateInvoiceRequest),
});

app.http("importBankBatch", {
  route: "bank/import", methods: ["POST"], authLevel: "anonymous",
  handler: (request, context) => execute(request, context, importBankRequest),
});

app.http("reconcileBankBatch", {
  route: "bank/reconcile", methods: ["POST"], authLevel: "anonymous",
  handler: (request, context) => execute(request, context, reconcileBankRequest),
});
