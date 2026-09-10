import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { importBankRequest, reconcileBankRequest, validateInvoiceRequest } from "../api/services.ts";
import { DEFAULT_BANK_IMPORT_CONFIG, GraphClient, ManagedIdentityTokenProvider, SharePointBankPoller, SharePointDocumentRepository, SharePointInvoiceMailboxPoller } from "../microsoft365/index.ts";

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

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing app setting ${name}`);
  return value;
}

app.timer("pollBankExtracts", {
  schedule: process.env.BANK_IMPORT_SCHEDULE ?? "0 */10 * * * *",
  handler: async (_timer, context) => {
    try {
      const poller = new SharePointBankPoller(new GraphClient(new ManagedIdentityTokenProvider()), {
        siteId: requiredSetting("M365_SHAREPOINT_SITE_ID"),
        driveId: requiredSetting("M365_SHAREPOINT_DRIVE_ID"),
        incomingFolder: process.env.M365_BANK_FOLDER ?? "ExtractosBancarios",
        processedFolder: process.env.M365_BANK_PROCESSED_FOLDER ?? "Procesados",
        errorFolder: process.env.M365_BANK_ERROR_FOLDER ?? "Errores",
        importsList: process.env.M365_BANK_IMPORTS_LIST ?? "ImportacionesBancarias",
        movementsList: process.env.M365_BANK_MOVEMENTS_LIST ?? "MovimientosBancarios",
        exceptionsList: process.env.M365_EXCEPTIONS_LIST ?? "Excepciones",
        importConfig: DEFAULT_BANK_IMPORT_CONFIG,
      });
      const result = await poller.run();
      context.log("Bank extract polling completed", result);
    } catch (error) {
      context.error("Bank extract polling failed", error);
      throw error;
    }
  },
});

app.timer("pollInvoiceMailbox", {
  schedule: process.env.INVOICE_MAIL_POLL_SCHEDULE ?? "30 */10 * * * *",
  handler: async (_timer, context) => {
    try {
      const graph = new GraphClient(new ManagedIdentityTokenProvider());
      const poller = new SharePointInvoiceMailboxPoller(
        graph,
        requiredSetting("M365_MAILBOX_ADDRESS"),
        new SharePointDocumentRepository(graph, requiredSetting("M365_SHAREPOINT_DRIVE_ID"), process.env.M365_INVOICE_FOLDER ?? "Facturas"),
      );
      context.log("Invoice mailbox polling completed", await poller.run());
    } catch (error) {
      context.error("Invoice mailbox polling failed", error);
      throw error;
    }
  },
});
