import type { ExtractedInvoice, ExtractionConfidence } from "../invoices/types.ts";
import type { InvoiceExtractor, AttachmentInput } from "../processing/types.ts";
import type { AccessTokenProvider } from "../microsoft365/graph-client.ts";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-invoice";

type Field = {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
};

type AnalyzeResponse = {
  status?: "notStarted" | "running" | "succeeded" | "failed";
  error?: { code?: string; message?: string };
  analyzeResult?: { documents?: Array<{ fields?: Record<string, Field> }> };
};

export type DocumentIntelligenceOptions = {
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

function normalizedEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(value)) throw new Error("Invalid Document Intelligence endpoint");
  return value;
}

function text(field?: Field): string | undefined {
  return field?.valueString ?? field?.valueDate ?? field?.content;
}

function amount(field?: Field): string | undefined {
  const value = field?.valueCurrency?.amount ?? field?.valueNumber;
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : undefined;
}

function derivedTaxableBase(total?: Field, tax?: Field): string | undefined {
  const totalValue = total?.valueCurrency?.amount ?? total?.valueNumber;
  const taxValue = tax?.valueCurrency?.amount ?? tax?.valueNumber;
  if (typeof totalValue !== "number" || typeof taxValue !== "number" || !Number.isFinite(totalValue) || !Number.isFinite(taxValue) || totalValue <= taxValue) return undefined;
  return (Math.round((totalValue - taxValue) * 100) / 100).toFixed(2);
}

function confidence(fields: Record<string, Field>, mapping: Record<keyof ExtractedInvoice, string>): ExtractionConfidence {
  return Object.fromEntries(Object.entries(mapping).flatMap(([target, source]) => {
    const value = fields[source]?.confidence;
    return typeof value === "number" ? [[target, value]] : [];
  })) as ExtractionConfidence;
}

export function mapInvoiceResult(payload: AnalyzeResponse): { invoice: ExtractedInvoice; confidence: ExtractionConfidence } {
  const fields = payload.analyzeResult?.documents?.[0]?.fields;
  if (!fields) throw new Error("Document Intelligence did not detect an invoice");
  const supplier = text(fields.VendorAddressRecipient) ? fields.VendorAddressRecipient : fields.VendorName;
  const taxableBase = amount(fields.SubTotal) ?? derivedTaxableBase(fields.InvoiceTotal, fields.TotalTax);
  const taxableBaseConfidence = fields.SubTotal?.confidence
    ?? (typeof fields.InvoiceTotal?.confidence === "number" && typeof fields.TotalTax?.confidence === "number"
      ? Math.min(fields.InvoiceTotal.confidence, fields.TotalTax.confidence)
      : undefined);
  const currency = fields.InvoiceTotal?.valueCurrency?.currencyCode
    ?? fields.SubTotal?.valueCurrency?.currencyCode
    ?? fields.TotalTax?.valueCurrency?.currencyCode;
  return {
    invoice: {
      supplierName: text(supplier), ...(text(fields.VendorTaxId) ? { supplierTaxId: text(fields.VendorTaxId) } : {}), invoiceNumber: text(fields.InvoiceId), invoiceDate: text(fields.InvoiceDate),
      dueDate: text(fields.DueDate), taxableBase, vatAmount: amount(fields.TotalTax),
      totalAmount: amount(fields.InvoiceTotal), currency: currency?.toUpperCase(),
    },
    confidence: {
      ...confidence(fields, {
        supplierName: text(fields.VendorAddressRecipient) ? "VendorAddressRecipient" : "VendorName",
        supplierTaxId: "VendorTaxId",
        invoiceNumber: "InvoiceId", invoiceDate: "InvoiceDate", dueDate: "DueDate", taxableBase: "SubTotal",
        vatAmount: "TotalTax", totalAmount: "InvoiceTotal", currency: "InvoiceTotal",
      }),
      ...(typeof taxableBaseConfidence === "number" ? { taxableBase: taxableBaseConfidence } : {}),
    },
  };
}

export class DocumentIntelligenceInvoiceExtractor implements InvoiceExtractor {
  private readonly endpoint: string;
  private readonly tokenProvider: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(endpoint: string, tokenProvider: AccessTokenProvider, options: DocumentIntelligenceOptions = {}) {
    this.endpoint = normalizedEndpoint(endpoint);
    this.tokenProvider = tokenProvider;
    this.fetchImpl = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async extract(input: AttachmentInput): Promise<{ invoice: ExtractedInvoice; confidence: ExtractionConfidence }> {
    if (input.contentType !== "application/pdf") throw new Error("Document Intelligence pilot only accepts PDF files");
    if (input.content.length === 0 || input.content.length > 4 * 1024 * 1024) throw new Error("PDF must be between 1 byte and 4 MB for the F0 tier");
    const token = await this.tokenProvider.getAccessToken();
    const analyzeUrl = `${this.endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}&pages=1-2`;
    const initial = await this.fetchImpl(analyzeUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ base64Source: Buffer.from(input.content).toString("base64") }),
    });
    if (initial.status !== 202) throw await this.responseError("submit", initial);
    const operationUrl = initial.headers.get("operation-location");
    if (!operationUrl?.startsWith(`${this.endpoint}/`)) throw new Error("Document Intelligence returned an invalid operation location");

    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (this.pollIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      const response = await this.fetchImpl(operationUrl, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw await this.responseError("poll", response);
      const payload = await response.json() as AnalyzeResponse;
      if (payload.status === "succeeded") return mapInvoiceResult(payload);
      if (payload.status === "failed") throw new Error(`Document Intelligence analysis failed: ${payload.error?.message ?? payload.error?.code ?? "unknown error"}`);
    }
    throw new Error("Document Intelligence analysis timed out");
  }

  private async responseError(operation: string, response: Response): Promise<Error> {
    const body = await response.text();
    return new Error(`Document Intelligence ${operation} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}
