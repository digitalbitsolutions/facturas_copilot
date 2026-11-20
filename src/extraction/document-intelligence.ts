import type { ExtractedInvoice, ExtractionConfidence, InvoiceField } from "../invoices/types.ts";
import type { InvoiceExtractor, AttachmentInput } from "../processing/types.ts";
import type { AccessTokenProvider } from "../microsoft365/graph-client.ts";
import { enrichWithFacturX } from "./factur-x.ts";
import { decideDueDate } from "./due-date.ts";
import { extractFiscal, vatRateSlots, type DiAnalyzeResult } from "./fiscal.ts";
import { dumpTaxTables } from "./fiscal-diagnose.ts";
import { diagnoseFields } from "./field-diagnostic.ts";

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
  boundingRegions?: Array<{ pageNumber?: number; polygon?: number[] }>;
};

type AnalyzeResponse = {
  status?: "notStarted" | "running" | "succeeded" | "failed";
  error?: { code?: string; message?: string };
  analyzeResult?: { documents?: Array<{ fields?: Record<string, Field> }>; content?: string };
};

const MAX_INVOICE_PAGES_TO_VERIFY = 16;

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
  const totalValue = numericAmount(total);
  const taxValue = numericAmount(tax);
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
  const totalValue = numericAmount(total);
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

function lineTaxShapes(field?: Field): Array<{ currency: boolean; number: boolean; text: boolean; percent: boolean }> {
  return (field?.valueArray ?? []).map(({ valueObject }) => {
    const tax = valueObject?.Tax;
    const raw = tax?.valueString ?? tax?.content;
    return { currency: Boolean(tax?.valueCurrency), number: typeof tax?.valueNumber === "number", text: typeof raw === "string", percent: typeof raw === "string" && raw.includes("%") };
  });
}

function lineTaxAmounts(field?: Field): { vatAmount?: string; confidence?: number } {
  const details = field?.valueArray ?? [];
  if (details.length === 0) return {};
  let total = 0;
  let minimumConfidence: number | undefined;
  for (const { valueObject } of details) {
    const value = numericAmount(valueObject?.Tax);
    if (typeof value !== "number") return {};
    total += value;
    const confidence = valueObject?.Tax?.confidence;
    if (typeof confidence === "number") minimumConfidence = minimumConfidence === undefined ? confidence : Math.min(minimumConfidence, confidence);
  }
  return { vatAmount: total.toFixed(2), ...(minimumConfidence === undefined ? {} : { confidence: minimumConfidence }) };
}

function derivedTaxableBaseFromRate(total?: Field, percent?: number): string | undefined {
  const totalValue = numericAmount(total);
  if (typeof totalValue !== "number" || !Number.isFinite(totalValue) || typeof percent !== "number" || percent <= 0) return undefined;
  return (Math.round((totalValue / (1 + percent / 100)) * 100) / 100).toFixed(2);
}

function labelledAmounts(content: string, label: RegExp): number[] {
  const values: number[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!label.test(line)) continue;
    for (const candidate of line.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? []) {
      const parsed = numericAmount({ content: candidate });
      if (typeof parsed === "number" && Number.isFinite(parsed)) values.push(parsed);
    }
  }
  return values;
}

function enrichWithRecognizedFiscalText(
  extraction: { invoice: ExtractedInvoice; confidence: ExtractionConfidence }, content?: string,
): { invoice: ExtractedInvoice; confidence: ExtractionConfidence } {
  if (!content || extraction.invoice.vatAmount) return extraction;
  const total = Number(extraction.invoice.totalAmount);
  if (!Number.isFinite(total)) return extraction;
  const bases = labelledAmounts(content, /\bbase\s+(?:imponible|gravable|tributaria)\b/i);
  const taxes = labelledAmounts(content, /\b(?:i\.?\s*v\.?\s*a\.?|iva|vat|cuota\s+tributaria)\b/i);
  const currentBase = Number(extraction.invoice.taxableBase);
  const candidateBases = Number.isFinite(currentBase) ? [currentBase, ...bases] : bases;
  for (const base of candidateBases) {
    for (const tax of taxes) {
      if (base < 0 || tax < 0 || Math.abs(base + tax - total) > 0.01) continue;
      const invoice = { ...extraction.invoice, taxableBase: base.toFixed(2), vatAmount: tax.toFixed(2) };
      const confidence = { ...extraction.confidence };
      const derivedConfidence = [extraction.confidence.taxableBase, extraction.confidence.totalAmount]
        .filter((value): value is number => typeof value === "number")
        .reduce<number | undefined>((minimum, value) => minimum === undefined ? value : Math.min(minimum, value), undefined);
      if (derivedConfidence !== undefined) {
        confidence.taxableBase ??= derivedConfidence;
        confidence.vatAmount = derivedConfidence;
      }
      return { invoice, confidence };
    }
  }
  return extraction;
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
  const lineTax = lineTaxAmounts(fields.Items);
  const taxableBase = amount(fields.SubTotal) ?? derivedTaxableBase(fields.InvoiceTotal, fields.TotalTax) ?? taxDetails.taxableBase
    ?? (lineTax.vatAmount ? derivedTaxableBase(fields.InvoiceTotal, { valueNumber: Number(lineTax.vatAmount) }) : undefined)
    ?? derivedTaxableBaseFromRate(fields.InvoiceTotal, lineTaxRate.percent)
    ?? itemAmounts.taxableBase;
  const vatAmount = amount(fields.TotalTax) ?? taxDetails.vatAmount ?? lineTax.vatAmount ?? derivedVatAmount(fields.InvoiceTotal, taxableBase);
  const taxableBaseConfidence = fields.SubTotal?.confidence
    ?? (typeof fields.InvoiceTotal?.confidence === "number" && typeof fields.TotalTax?.confidence === "number"
      ? Math.min(fields.InvoiceTotal.confidence, fields.TotalTax.confidence)
      : taxDetails.confidence ?? lineTax.confidence ?? lineTaxRate.confidence ?? itemAmounts.confidence);
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
      ...(lineTaxRate.percent !== undefined ? { vatRateSlots: [lineTaxRate.percent, 0, 0] as const } : {}),
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
      ...(fields.TotalTax?.confidence === undefined && typeof (taxDetails.confidence ?? lineTax.confidence ?? derivedVatConfidence) === "number"
        ? { vatAmount: taxDetails.confidence ?? lineTax.confidence ?? derivedVatConfidence }
        : {}),
    },
  };
}

type Extraction = { invoice: ExtractedInvoice; confidence: ExtractionConfidence };

/**
 * Applies the business decision before generic confidence validation.  A document
 * that does not state a due date must not retain a low-confidence date that was
 * inferred from another date such as "Data valor".
 */
function enrichWithDueDateDecision(extraction: Extraction, dueDate: Field | undefined, documentText: string): Extraction {
  const decision = decideDueDate({
    value: text(dueDate), content: dueDate?.content, confidence: dueDate?.confidence,
  }, documentText);
  if (decision.status === "ok") {
    return {
      invoice: { ...extraction.invoice, dueDate: decision.dueDate, dueDateStatus: "present" },
      confidence: { ...extraction.confidence, dueDate: decision.confidence },
    };
  }
  if (decision.status === "not_stated") {
    const { dueDate: _dueDate, ...invoice } = extraction.invoice;
    const { dueDate: _dueDateConfidence, ...confidence } = extraction.confidence;
    return { invoice: { ...invoice, dueDateStatus: "not_stated" }, confidence };
  }
  // Preserve the existing low-confidence validation path.  A missing field with
  // explicit payment terms also remains a manual review rather than an absence.
  return {
    invoice: extraction.invoice,
    confidence: { ...extraction.confidence, dueDate: dueDate?.confidence ?? 0 },
  };
}

function coherentFiscalSummary(invoice: ExtractedInvoice): boolean {
  const base = Number(invoice.taxableBase);
  const tax = Number(invoice.vatAmount);
  const total = Number(invoice.totalAmount);
  return [base, tax, total].every(Number.isFinite) && base >= 0 && tax >= 0 && Math.abs(base + tax - total) <= 0.01;
}

function sameInvoiceNumber(left?: string, right?: string): boolean {
  return !left || !right || left.normalize("NFKC").replace(/\W/g, "").toLocaleUpperCase("es-ES") === right.normalize("NFKC").replace(/\W/g, "").toLocaleUpperCase("es-ES");
}

function normalizedInvoiceNumber(value: string): string {
  return value.normalize("NFKC").replace(/\W/g, "").toLocaleUpperCase("es-ES");
}

function invoiceNumbers(payload: AnalyzeResponse): string[] {
  return (payload.analyzeResult?.documents ?? [])
    .map((document) => text(document.fields?.InvoiceId))
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizedInvoiceNumber);
}

function isPastLastPage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:page.*(?:range|out of|does not exist|invalid)|invalid.*page)/i.test(message);
}

function enrichWithFinalPageFiscalSummary(primary: Extraction, finalPage: Extraction): Extraction {
  if (!coherentFiscalSummary(finalPage.invoice) || !sameInvoiceNumber(primary.invoice.invoiceNumber, finalPage.invoice.invoiceNumber)) return primary;
  const invoice = {
    ...primary.invoice,
    taxableBase: finalPage.invoice.taxableBase,
    vatAmount: finalPage.invoice.vatAmount,
    totalAmount: finalPage.invoice.totalAmount,
    ...(finalPage.invoice.currency ? { currency: finalPage.invoice.currency } : {}),
  };
  const confidence = { ...primary.confidence };
  for (const field of ["taxableBase", "vatAmount", "totalAmount", "currency"] as const) {
    if (typeof finalPage.confidence[field] === "number") confidence[field] = finalPage.confidence[field];
  }
  return { invoice, confidence };
}

function enrichWithFiscalTable(primary: Extraction, content?: string): Extraction {
  const total = Number(primary.invoice.totalAmount);
  if (!content || !Number.isFinite(total)) return primary;
  const amount = "(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
  const summary = content.slice(Math.max(0, content.search(/base\s+imponible/i)));
  const rows = [...summary.matchAll(new RegExp(`${amount}\\s+(\\d+(?:[.,]\\d+)?)\\s*%?\\s+${amount}`, "g"))]
    .map((match) => ({ base: numericAmount({ content: match[1] }), tax: numericAmount({ content: match[3] }) }))
    .filter((row): row is { base: number; tax: number } => row.base !== undefined && row.tax !== undefined);
  const base = rows.reduce((sum, row) => sum + row.base, 0);
  const tax = rows.reduce((sum, row) => sum + row.tax, 0);
  if (rows.length < 1 || Math.abs(base + tax - total) > 0.01) return primary;
  return { invoice: { ...primary.invoice, taxableBase: base.toFixed(2), vatAmount: tax.toFixed(2) }, confidence: primary.confidence };
}

function isFiscallyCoherent(invoice: ExtractedInvoice): boolean {
  const [base, vat, total] = [invoice.taxableBase, invoice.vatAmount, invoice.totalAmount]
    .map((value) => (value ? Math.round(Number(value) * 100) : Number.NaN));
  return [base, vat, total].every(Number.isFinite) && Math.abs(base + vat - total) <= 1;
}

/** Emits only the approved diagnostic properties for deficient fiscal fields. */
function logLowConfidenceFiscalFields(extraction: Extraction, fields?: Record<string, Field>): void {
  for (const [source, field] of [["SubTotal", "taxableBase"], ["TotalTax", "vatAmount"], ["InvoiceTotal", "totalAmount"]] as const) {
    const raw = fields?.[source];
    const confidence = raw?.confidence ?? extraction.confidence[field];
    if (typeof confidence !== "number" || confidence >= 0.8) continue;
    const region = raw?.boundingRegions?.[0];
    console.warn(`Invoice fiscal field diagnostic ${JSON.stringify({ field, value: extraction.invoice[field] ?? null, confidence, page: region?.pageNumber ?? null, polygon: region?.polygon ?? null })}`);
  }
}

function enrichWithValidatedFiscalLayout(primary: Extraction, result: DiAnalyzeResult): Extraction {
  const headerTotal = Number(primary.invoice.totalAmount);
  const fiscal = extractFiscal(result, {
    ...(Number.isFinite(headerTotal) ? { headerTotal: Math.round(headerTotal * 100) } : {}),
  });
  if (!fiscal.ok) return primary;
  const { baseTotal, vatTotal } = fiscal.summary;
  return {
    invoice: {
      ...primary.invoice,
      taxableBase: (baseTotal / 100).toFixed(2),
      vatAmount: (vatTotal / 100).toFixed(2),
      vatRateSlots: vatRateSlots(fiscal.summary.rows),
    },
    confidence: {
      ...primary.confidence,
      taxableBase: 0.9,
      vatAmount: 0.9,
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

  async extract(input: AttachmentInput, context: { recognizedText?: string; ensureSingleInvoiceDocument?: boolean } = {}): Promise<{ invoice: ExtractedInvoice; confidence: ExtractionConfidence }> {
    if (input.contentType !== "application/pdf") throw new Error("Document Intelligence pilot only accepts PDF files");
    if (input.content.length === 0 || input.content.length > 4 * 1024 * 1024) throw new Error("PDF must be between 1 byte and 4 MB for the F0 tier");
    const token = await this.tokenProvider.getAccessToken();
    const primary = await this.analyze(input, token, "1-2");
    if (context.ensureSingleInvoiceDocument) await this.assertSingleInvoiceDocument(input, token, primary);
    const fields = primary.analyzeResult?.documents?.[0]?.fields;
    if (fields && !fields.SubTotal && !fields.TotalTax && !fields.TaxDetails) {
      console.warn(`Invoice analysis fiscal line shapes ${JSON.stringify(lineTaxShapes(fields.Items))}`);
    }
    for (const diagnostic of diagnoseFields(fields)) console.warn(`Invoice field diagnostic ${JSON.stringify(diagnostic)}`);
    let extraction = enrichWithFacturX(mapInvoiceResult(primary), input.content);
    if (!fields?.SubTotal && !fields?.TotalTax && !fields?.TaxDetails) try {
      // F0 analyses a maximum of two selected pages per request. A separate page-3
      // request retrieves a final fiscal summary without widening every invoice run.
      extraction = enrichWithFinalPageFiscalSummary(extraction, mapInvoiceResult(await this.analyze(input, token, "3")));
      const fiscalText = await this.analyze(input, token, "3", "prebuilt-read");
      extraction = enrichWithFiscalTable(extraction, fiscalText.analyzeResult?.content);
      const layout = await this.analyze(input, token, "3", "prebuilt-layout") as { analyzeResult?: DiAnalyzeResult };
      extraction = enrichWithValidatedFiscalLayout(extraction, layout.analyzeResult ?? {});
      console.warn(`Invoice fiscal layout ${JSON.stringify(dumpTaxTables(layout.analyzeResult ?? {}))}`);
    } catch {
      // A two-page PDF has no continuation page. Preserve the original safe review path.
      console.warn("Invoice fiscal continuation page was unavailable");
    }
    if (!isFiscallyCoherent(extraction.invoice)) try {
      // The invoice model can omit freight from SubTotal. Read pages 1-2 only
      // when its fiscal header is incomplete or incoherent, then accept layout
      // data exclusively through extractFiscal's existing reconciliation rules.
      const layout = await this.analyze(input, token, "1-2", "prebuilt-layout") as { analyzeResult?: DiAnalyzeResult };
      extraction = enrichWithValidatedFiscalLayout(extraction, layout.analyzeResult ?? {});
      if (!isFiscallyCoherent(extraction.invoice)) logLowConfidenceFiscalFields(extraction, fields);
    } catch {
      console.warn("Invoice first-pages fiscal layout was unavailable");
    }
    extraction = enrichWithRecognizedFiscalText(extraction, context.recognizedText);
    // The mailbox classifier supplies transient OCR text from the attachment;
    // mailbox processing must provide text for one invoice only.
    return enrichWithDueDateDecision(extraction, fields?.DueDate, context.recognizedText ?? primary.analyzeResult?.content ?? "");
  }

  /**
   * The F0 tier accepts only two selected pages per operation.  A PDF used by
   * the mailbox flow is therefore checked one page at a time after the first
   * pair.  Different invoice identifiers are never combined into one archive.
   */
  private async assertSingleInvoiceDocument(input: AttachmentInput, token: string, primary: AnalyzeResponse): Promise<void> {
    const identifiers = new Set(invoiceNumbers(primary));
    for (let page = 2; page <= MAX_INVOICE_PAGES_TO_VERIFY; page += 1) {
      let analysis: AnalyzeResponse;
      try {
        analysis = await this.analyze(input, token, String(page));
      } catch (error) {
        if (isPastLastPage(error)) return;
        throw error;
      }
      for (const identifier of invoiceNumbers(analysis)) identifiers.add(identifier);
      if (identifiers.size > 1) {
        throw new Error("PDF contains multiple invoice numbers and requires manual review");
      }
    }
    throw new Error(`PDF has more than ${MAX_INVOICE_PAGES_TO_VERIFY} pages and requires manual review`);
  }

  private async analyze(input: AttachmentInput, token: string, pages: string, model = MODEL_ID): Promise<AnalyzeResponse> {
    const analyzeUrl = `${this.endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${API_VERSION}&pages=${pages}`;
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
      if (payload.status === "succeeded") return payload;
      if (payload.status === "failed") throw new Error(`Document Intelligence analysis failed: ${payload.error?.message ?? payload.error?.code ?? "unknown error"}`);
    }
    throw new Error("Document Intelligence analysis timed out");
  }

  private async responseError(operation: string, response: Response): Promise<Error> {
    const body = await response.text();
    return new Error(`Document Intelligence ${operation} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}
