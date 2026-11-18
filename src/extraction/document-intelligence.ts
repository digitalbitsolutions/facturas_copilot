import type { ExtractedInvoice, ExtractionConfidence, InvoiceField } from "../invoices/types.ts";
import type { InvoiceExtractor, AttachmentInput } from "../processing/types.ts";
import type { AccessTokenProvider } from "../microsoft365/graph-client.ts";
import { enrichWithFacturX } from "./factur-x.ts";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-invoice";

type Field = {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: Array<{ valueObject?: Record<string, Field> }>;
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
  const value = numericAmount(field);
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : undefined;
}

function numericAmount(field?: Field): number | undefined {
  const typedValue = field?.valueCurrency?.amount ?? field?.valueNumber;
  if (typeof typedValue === "number" && Number.isFinite(typedValue)) return typedValue;
  const textValue = field?.valueString ?? field?.content;
  if (!textValue) return undefined;
  const value = textValue.trim().replace(/[\s\u00a0]/g, "").replace(/(?:€|EUR|USD)$/i, "");
  if (!/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(value)) return undefined;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const lastSeparator = Math.max(lastComma, lastDot);
  const decimalSeparator = lastComma >= 0 && lastDot >= 0
    ? (lastComma > lastDot ? "," : ".")
    : lastSeparator >= 0 && value.length - lastSeparator - 1 <= 2 ? value[lastSeparator] : undefined;
  const normalized = decimalSeparator
    ? value.replace(decimalSeparator === "," ? /\./g : /,/g, "").replace(decimalSeparator, ".")
    : value.replace(/[.,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function derivedTaxableBase(total?: Field, tax?: Field): string | undefined {
  const totalValue = total?.valueCurrency?.amount ?? total?.valueNumber;
  const taxValue = tax?.valueCurrency?.amount ?? tax?.valueNumber;
  if (typeof totalValue !== "number" || typeof taxValue !== "number" || !Number.isFinite(totalValue) || !Number.isFinite(taxValue) || totalValue <= taxValue) return undefined;
  return (Math.round((totalValue - taxValue) * 100) / 100).toFixed(2);
}

function taxDetailAmounts(field?: Field): { taxableBase?: string; vatAmount?: string; confidence?: number } {
  const details = field?.valueArray ?? [];
  if (details.length === 0) return {};
  let base = 0;
  let tax = 0;
  let hasBase = false;
  let hasTax = false;
  let minimumConfidence: number | undefined;
  for (const { valueObject } of details) {
    const detailBase = valueObject?.Amount?.valueCurrency?.amount ?? valueObject?.Amount?.valueNumber;
    const detailTax = valueObject?.TaxAmount?.valueCurrency?.amount ?? valueObject?.TaxAmount?.valueNumber;
    if (typeof detailBase === "number" && Number.isFinite(detailBase)) {
      base += detailBase;
      hasBase = true;
    }
    if (typeof detailTax === "number" && Number.isFinite(detailTax)) {
      tax += detailTax;
      hasTax = true;
    }
    for (const candidate of [valueObject?.Amount?.confidence, valueObject?.TaxAmount?.confidence]) {
      if (typeof candidate === "number") minimumConfidence = minimumConfidence === undefined ? candidate : Math.min(minimumConfidence, candidate);
    }
  }
  return {
    ...(hasBase ? { taxableBase: base.toFixed(2) } : {}),
    ...(hasTax ? { vatAmount: tax.toFixed(2) } : {}),
    ...(minimumConfidence === undefined ? {} : { confidence: minimumConfidence }),
  };
}

function lineItemAmounts(field?: Field): { taxableBase?: string; confidence?: number } {
  const details = field?.valueArray ?? [];
  if (details.length === 0) return {};
  let total = 0;
  let minimumConfidence: number | undefined;
  for (const { valueObject } of details) {
    const value = numericAmount(valueObject?.Amount);
    if (typeof value !== "number" || !Number.isFinite(value)) return {};
    total += value;
    const confidence = valueObject?.Amount?.confidence;
    if (typeof confidence === "number") minimumConfidence = minimumConfidence === undefined ? confidence : Math.min(minimumConfidence, confidence);
  }
  return { taxableBase: total.toFixed(2), ...(minimumConfidence === undefined ? {} : { confidence: minimumConfidence }) };
}

function derivedVatAmount(total?: Field, taxableBase?: string): string | undefined {
  const totalValue = total?.valueCurrency?.amount ?? total?.valueNumber;
  const baseValue = taxableBase === undefined ? undefined : Number(taxableBase);
  if (typeof totalValue !== "number" || !Number.isFinite(totalValue) || typeof baseValue !== "number" || !Number.isFinite(baseValue) || totalValue < baseValue) return undefined;
  return (Math.round((totalValue - baseValue) * 100) / 100).toFixed(2);
}

function uniformLineTaxRate(field?: Field): { percent?: number; confidence?: number } {
  const details = field?.valueArray ?? [];
  if (details.length === 0) return {};
  const rates: number[] = [];
  let minimumConfidence: number | undefined;
  for (const { valueObject } of details) {
    const tax = valueObject?.Tax;
    const raw = tax?.valueNumber ?? tax?.valueString ?? tax?.content;
    const text = typeof raw === "string" ? raw.trim().replace(",", ".") : undefined;
    const percent = typeof raw === "number" ? raw : text && /^\d+(?:\.\d+)?%?$/.test(text) ? Number(text.replace("%", "")) : undefined;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent <= 0 || percent > 100) return {};
    rates.push(percent);
    if (typeof tax?.confidence === "number") minimumConfidence = minimumConfidence === undefined ? tax.confidence : Math.min(minimumConfidence, tax.confidence);
  }
  return rates.every((rate) => Math.abs(rate - rates[0]) < 0.0001)
    ? { percent: rates[0], ...(minimumConfidence === undefined ? {} : { confidence: minimumConfidence }) }
    : {};
}

function derivedTaxableBaseFromRate(total?: Field, percent?: number): string | undefined {
  const totalValue = numericAmount(total);
  if (typeof totalValue !== "number" || !Number.isFinite(totalValue) || typeof percent !== "number" || percent <= 0) return undefined;
  return (Math.round((totalValue / (1 + percent / 100)) * 100) / 100).toFixed(2);
}

function lineItems(field?: Field): import("../invoices/types.ts").InvoiceLine[] | undefined {
  const lines = field?.valueArray?.flatMap(({ valueObject }) => {
    const description = text(valueObject?.Description);
    if (!description) return [];
    const quantity = text(valueObject?.Quantity) ?? amount(valueObject?.Quantity);
    const unitPrice = amount(valueObject?.UnitPrice);
    const lineAmount = amount(valueObject?.Amount);
    return [{ description, ...(quantity ? { quantity } : {}), ...(unitPrice ? { unitPrice } : {}), ...(lineAmount ? { amount: lineAmount } : {}) }];
  }) ?? [];
  return lines.length ? lines : undefined;
}

function confidence(fields: Record<string, Field>, mapping: Partial<Record<InvoiceField, string>>): ExtractionConfidence {
  return Object.fromEntries(Object.entries(mapping).flatMap(([target, source]) => {
    const value = fields[source]?.confidence;
    return typeof value === "number" ? [[target, value]] : [];
  })) as ExtractionConfidence;
}

export function mapInvoiceResult(payload: AnalyzeResponse): { invoice: ExtractedInvoice; confidence: ExtractionConfidence } {
  const fields = payload.analyzeResult?.documents?.[0]?.fields;
  if (!fields) throw new Error("Document Intelligence did not detect an invoice");
  const supplier = text(fields.VendorAddressRecipient) ? fields.VendorAddressRecipient : fields.VendorName;
  const taxDetails = taxDetailAmounts(fields.TaxDetails);
  const itemAmounts = lineItemAmounts(fields.Items);
  const lineTaxRate = uniformLineTaxRate(fields.Items);
  const taxableBase = amount(fields.SubTotal) ?? derivedTaxableBase(fields.InvoiceTotal, fields.TotalTax) ?? taxDetails.taxableBase
    ?? derivedTaxableBaseFromRate(fields.InvoiceTotal, lineTaxRate.percent)
    ?? itemAmounts.taxableBase;
  const vatAmount = amount(fields.TotalTax) ?? taxDetails.vatAmount ?? derivedVatAmount(fields.InvoiceTotal, taxableBase);
  const taxableBaseConfidence = fields.SubTotal?.confidence
    ?? (typeof fields.InvoiceTotal?.confidence === "number" && typeof fields.TotalTax?.confidence === "number"
      ? Math.min(fields.InvoiceTotal.confidence, fields.TotalTax.confidence)
      : taxDetails.confidence ?? lineTaxRate.confidence ?? itemAmounts.confidence);
  const derivedVatConfidence = typeof fields.InvoiceTotal?.confidence === "number" && typeof taxableBaseConfidence === "number"
    ? Math.min(fields.InvoiceTotal.confidence, taxableBaseConfidence)
    : undefined;
  const currency = fields.InvoiceTotal?.valueCurrency?.currencyCode
    ?? fields.SubTotal?.valueCurrency?.currencyCode
    ?? fields.TotalTax?.valueCurrency?.currencyCode;
  const lines = lineItems(fields.Items);
  return {
    invoice: {
      supplierName: text(supplier), ...(text(fields.VendorTaxId) ? { supplierTaxId: text(fields.VendorTaxId) } : {}), invoiceNumber: text(fields.InvoiceId), invoiceDate: text(fields.InvoiceDate),
      ...(text(fields.CustomerName) ? { recipientName: text(fields.CustomerName) } : {}),
      ...(text(fields.CustomerTaxId) ? { recipientTaxId: text(fields.CustomerTaxId) } : {}),
      ...(lines ? { lines } : {}),
      dueDate: text(fields.DueDate), taxableBase, vatAmount,
      totalAmount: amount(fields.InvoiceTotal), currency: currency?.toUpperCase(),
    },
    confidence: {
      ...confidence(fields, {
        supplierName: text(fields.VendorAddressRecipient) ? "VendorAddressRecipient" : "VendorName",
        supplierTaxId: "VendorTaxId", recipientName: "CustomerName", recipientTaxId: "CustomerTaxId",
        invoiceNumber: "InvoiceId", invoiceDate: "InvoiceDate", dueDate: "DueDate", taxableBase: "SubTotal",
        vatAmount: "TotalTax", totalAmount: "InvoiceTotal", currency: "InvoiceTotal",
      }),
      ...(typeof taxableBaseConfidence === "number" ? { taxableBase: taxableBaseConfidence } : {}),
      ...(fields.TotalTax?.confidence === undefined && typeof (taxDetails.confidence ?? derivedVatConfidence) === "number"
        ? { vatAmount: taxDetails.confidence ?? derivedVatConfidence }
        : {}),
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
      if (payload.status === "succeeded") return enrichWithFacturX(mapInvoiceResult(payload), input.content);
      if (payload.status === "failed") throw new Error(`Document Intelligence analysis failed: ${payload.error?.message ?? payload.error?.code ?? "unknown error"}`);
    }
    throw new Error("Document Intelligence analysis timed out");
  }

  private async responseError(operation: string, response: Response): Promise<Error> {
    const body = await response.text();
    return new Error(`Document Intelligence ${operation} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}
