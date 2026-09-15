import type { ExtractedInvoice, ExtractionConfidence } from "../invoices/types.ts";

type Extraction = { invoice: ExtractedInvoice; confidence: ExtractionConfidence };

function block(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match?.[1];
}

function value(xml: string | undefined, name: string): string | undefined {
  return block(xml ?? "", name)?.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() || undefined;
}

function amount(xml: string | undefined, name: string): string | undefined {
  const parsed = Number(value(xml, name));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : undefined;
}

function date(value: string | undefined): string | undefined {
  return value && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : undefined;
}

function text(content: Uint8Array): string | undefined {
  const source = Buffer.from(content).toString("latin1");
  const start = source.search(/<(?:\w+:)?CrossIndustryInvoice\b/i);
  if (start < 0) return undefined;
  const endMatch = /<\/(?:\w+:)?CrossIndustryInvoice>/ig;
  endMatch.lastIndex = start;
  const end = endMatch.exec(source);
  return end ? source.slice(start, end.index + end[0].length) : undefined;
}

function same(left: string | undefined, right: string | undefined, kind: "text" | "amount" = "text"): boolean {
  if (!left || !right) return true;
  if (kind === "amount") return Math.abs(Number(left) - Number(right)) < 0.005;
  return left.normalize("NFKC").trim().toLocaleUpperCase("es-ES") === right.normalize("NFKC").trim().toLocaleUpperCase("es-ES");
}

/**
 * Completes missing fields from a raw embedded Factur-X / ZUGFeRD XML payload.
 * It deliberately does not parse arbitrary XML or override Document Intelligence.
 */
export function enrichWithFacturX(extraction: Extraction, content: Uint8Array): Extraction {
  const xml = text(content);
  if (!xml) return extraction;
  const document = block(xml, "ExchangedDocument");
  const seller = block(xml, "SellerTradeParty");
  const settlement = block(xml, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const candidate: ExtractedInvoice = {
    supplierName: value(seller, "Name"),
    supplierTaxId: value(block(seller ?? "", "SpecifiedTaxRegistration"), "ID"),
    invoiceNumber: value(document, "ID"),
    invoiceDate: date(value(block(document ?? "", "IssueDateTime"), "DateTimeString")),
    dueDate: date(value(block(xml, "SpecifiedTradePaymentTerms"), "DateTimeString")),
    taxableBase: amount(settlement, "TaxBasisTotalAmount") ?? amount(settlement, "LineTotalAmount"),
    vatAmount: amount(settlement, "TaxTotalAmount"),
    totalAmount: amount(settlement, "GrandTotalAmount"),
    currency: value(xml, "InvoiceCurrencyCode")?.toUpperCase(),
  };
  const current = extraction.invoice;
  const compatible = same(current.supplierName, candidate.supplierName)
    && same(current.supplierTaxId, candidate.supplierTaxId)
    && same(current.invoiceNumber, candidate.invoiceNumber)
    && same(current.invoiceDate, candidate.invoiceDate)
    && same(current.currency, candidate.currency)
    && same(current.taxableBase, candidate.taxableBase, "amount")
    && same(current.vatAmount, candidate.vatAmount, "amount")
    && same(current.totalAmount, candidate.totalAmount, "amount");
  if (!compatible) return extraction;

  const invoice = { ...current };
  const confidence = { ...extraction.confidence };
  for (const field of Object.keys(candidate) as Array<keyof ExtractedInvoice>) {
    if (!invoice[field] && candidate[field]) {
      invoice[field] = candidate[field];
      confidence[field] = 1;
    }
  }
  return { invoice, confidence };
}
