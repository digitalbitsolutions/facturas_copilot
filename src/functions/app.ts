import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { importBankRequest, reconcileBankRequest, validateInvoiceRequest } from "../api/services.ts";
import { DocumentIntelligenceDocumentClassifier } from "../classification/index.ts";
import { DocumentIntelligenceInvoiceExtractor } from "../extraction/index.ts";
import { resolveSupplierIdentity, validateInvoice } from "../invoices/index.ts";
import { DEFAULT_BANK_IMPORT_CONFIG, GraphClient, ManagedIdentityTokenProvider, SharePointBankPoller, SharePointDocumentRepository, SharePointInvoiceMailboxPoller, SharePointInvoiceRegistry, SharePointProcessStore, SharePointSupplierDirectory } from "../microsoft365/index.ts";
import { AttachmentProcessor } from "../processing/index.ts";

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

app.http("extractInvoice", {
  route: "invoices/extract", methods: ["POST"], authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const contentType = request.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
      if (contentType !== "application/pdf") return json(415, { error: { code: "unsupported_media_type", message: "Send the PDF as application/pdf" } });
      const content = new Uint8Array(await request.arrayBuffer());
      const attachment = {
        messageId: request.headers.get("x-message-id") ?? "manual-pilot",
        attachmentId: request.headers.get("x-attachment-id") ?? crypto.randomUUID(),
        sender: request.headers.get("x-sender") ?? "manual-pilot",
        receivedAt: new Date().toISOString(),
        originalFilename: request.headers.get("x-filename") ?? "invoice.pdf",
        contentType, content,
      };
      const cognitiveTokenProvider = new ManagedIdentityTokenProvider("https://cognitiveservices.azure.com/");
      const classification = await new DocumentIntelligenceDocumentClassifier(
        requiredSetting("DOCUMENT_INTELLIGENCE_ENDPOINT"), cognitiveTokenProvider,
      ).classify(attachment);
      if (classification.kind !== "invoice") {
        return json(200, { classification, extractionSkipped: true });
      }
      const extractor = new DocumentIntelligenceInvoiceExtractor(
        requiredSetting("DOCUMENT_INTELLIGENCE_ENDPOINT"),
        cognitiveTokenProvider,
      );
      const extraction = await extractor.extract(attachment);
      const supplierDirectory = new SharePointSupplierDirectory(
        new GraphClient(new ManagedIdentityTokenProvider()),
        requiredSetting("M365_SHAREPOINT_SITE_ID"),
        process.env.M365_SUPPLIERS_LIST ?? "MaestroProveedores",
      );
      const supplierIdentity = resolveSupplierIdentity(extraction.invoice, await supplierDirectory.listActive());
      const resolvedInvoice = supplierIdentity.status === "matched"
        ? { ...extraction.invoice, supplierName: supplierIdentity.supplier.legalName, supplierTaxId: supplierIdentity.supplier.taxId ?? extraction.invoice.supplierTaxId }
        : extraction.invoice;
      const invoiceValidation = validateInvoice(resolvedInvoice, extraction.confidence);
      const validation = supplierIdentity.status === "matched"
        ? invoiceValidation
        : { valid: false as const, issues: invoiceValidation.valid ? [supplierIdentity.issue] : [...invoiceValidation.issues, supplierIdentity.issue] };
      return json(200, { classification, ...extraction, supplierIdentity, validation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      context.error("Invoice extraction failed", { message });
      return json(502, { error: { code: "extraction_failed", message } });
    }
  },
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
      if (process.env.INVOICE_PROCESSING_ENABLED?.toLowerCase() !== "true") {
        context.log("Invoice mailbox processing is disabled");
        return;
      }
      const graph = new GraphClient(new ManagedIdentityTokenProvider());
      const siteId = requiredSetting("M365_SHAREPOINT_SITE_ID");
      const cognitiveTokenProvider = new ManagedIdentityTokenProvider("https://cognitiveservices.azure.com/");
      const processor = new AttachmentProcessor({
        classifier: new DocumentIntelligenceDocumentClassifier(requiredSetting("DOCUMENT_INTELLIGENCE_ENDPOINT"), cognitiveTokenProvider),
        extractor: new DocumentIntelligenceInvoiceExtractor(requiredSetting("DOCUMENT_INTELLIGENCE_ENDPOINT"), cognitiveTokenProvider),
        processStore: new SharePointProcessStore(graph, siteId, process.env.M365_INVOICE_PROCESSES_LIST ?? "ProcesosFacturas", process.env.M365_EXCEPTIONS_LIST ?? "Excepciones"),
        documents: new SharePointDocumentRepository(graph, requiredSetting("M365_SHAREPOINT_DRIVE_ID"), process.env.M365_INVOICE_FOLDER ?? "Facturas"),
        registry: new SharePointInvoiceRegistry(graph, siteId, process.env.M365_INVOICE_REGISTRY_LIST ?? "RegistroFacturas"),
        supplierDirectory: new SharePointSupplierDirectory(graph, siteId, process.env.M365_SUPPLIERS_LIST ?? "MaestroProveedores"),
      });
      const poller = new SharePointInvoiceMailboxPoller(
        graph,
        requiredSetting("M365_MAILBOX_ADDRESS"),
        processor,
      );
      context.log("Invoice mailbox polling completed", await poller.run());
    } catch (error) {
      context.error("Invoice mailbox polling failed", error);
      throw error;
    }
  },
});
