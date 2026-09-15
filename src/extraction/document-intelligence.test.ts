import assert from "node:assert/strict";
import test from "node:test";
import { DocumentIntelligenceInvoiceExtractor, mapInvoiceResult } from "./document-intelligence.ts";

const result = {
  status: "succeeded" as const,
  analyzeResult: { documents: [{ fields: {
    VendorName: { valueString: "Proveedor Norte, S.L.", confidence: 0.98 },
    VendorTaxId: { valueString: "B12345678", confidence: 0.93 },
    InvoiceId: { valueString: "F-2026-42", confidence: 0.97 },
    InvoiceDate: { valueDate: "2026-09-01", confidence: 0.96 },
    DueDate: { valueDate: "2026-10-01", confidence: 0.91 },
    SubTotal: { valueCurrency: { amount: 100, currencyCode: "EUR" }, confidence: 0.95 },
    TotalTax: { valueCurrency: { amount: 21, currencyCode: "EUR" }, confidence: 0.94 },
    InvoiceTotal: { valueCurrency: { amount: 121, currencyCode: "EUR" }, confidence: 0.99 },
  } }] },
};

const facturX = `
<rsm:CrossIndustryInvoice xmlns:ram="urn:ram" xmlns:rsm="urn:rsm" xmlns:udt="urn:udt">
  <rsm:ExchangedDocument><ram:ID>F26/1334</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20260901</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Emas Printing Solutions, SL</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">B63644462</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
  <ram:ApplicableHeaderTradeSettlement><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>55.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount><ram:GrandTotalAmount>55.00</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode></ram:ApplicableHeaderTradeSettlement>
</rsm:CrossIndustryInvoice>`;

test("maps the prebuilt invoice fields to the validation contract", () => {
  assert.deepEqual(mapInvoiceResult(result), {
    invoice: {
      supplierName: "Proveedor Norte, S.L.", supplierTaxId: "B12345678", invoiceNumber: "F-2026-42", invoiceDate: "2026-09-01",
      dueDate: "2026-10-01", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00", currency: "EUR",
    },
    confidence: {
      supplierName: 0.98, supplierTaxId: 0.93, invoiceNumber: 0.97, invoiceDate: 0.96, dueDate: 0.91,
      taxableBase: 0.95, vatAmount: 0.94, totalAmount: 0.99, currency: 0.99,
    },
  });
});

test("prefers the legal vendor name and derives a missing taxable base conservatively", () => {
  const extracted = mapInvoiceResult({
    status: "succeeded",
    analyzeResult: { documents: [{ fields: {
      VendorName: { valueString: "energia", confidence: 0.92 },
      VendorAddressRecipient: { valueString: "Energía Ejemplo, S.A.U.", confidence: 0.89 },
      InvoiceId: { valueString: "E-100", confidence: 0.93 }, InvoiceDate: { valueDate: "2026-09-05", confidence: 0.93 },
      InvoiceTotal: { valueCurrency: { amount: 387.21, currencyCode: "EUR" }, confidence: 0.889 },
      TotalTax: { valueCurrency: { amount: 67.2, currencyCode: "EUR" }, confidence: 0.681 },
    } }] },
  });
  assert.equal(extracted.invoice.supplierName, "Energía Ejemplo, S.A.U.");
  assert.equal(extracted.invoice.taxableBase, "320.01");
  assert.equal(extracted.confidence.supplierName, 0.89);
  assert.equal(extracted.confidence.taxableBase, 0.681);
});

test("does not derive a zero base when the model mistakes tax for the invoice total", () => {
  const extracted = mapInvoiceResult({
    status: "succeeded",
    analyzeResult: { documents: [{ fields: {
      InvoiceTotal: { valueCurrency: { amount: 0.06, currencyCode: "EUR" }, confidence: 0.9 },
      TotalTax: { valueCurrency: { amount: 0.06, currencyCode: "EUR" }, confidence: 0.8 },
    } }] },
  });
  assert.equal(extracted.invoice.taxableBase, undefined);
  assert.equal(extracted.confidence.taxableBase, 0.8);
});

test("submits and polls a PDF using managed identity", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) return new Response(null, { status: 202, headers: { "operation-location": "https://di.example.com/result/1" } });
    return Response.json(result);
  };
  const extractor = new DocumentIntelligenceInvoiceExtractor(
    "https://di.example.com", { getAccessToken: async () => "token" }, { fetch: fetchMock as typeof fetch, pollIntervalMs: 0 },
  );
  const extracted = await extractor.extract({
    messageId: "manual", attachmentId: "one", sender: "pilot", receivedAt: "2026-09-10T12:00:00Z",
    originalFilename: "factura.pdf", contentType: "application/pdf", content: new Uint8Array([1, 2, 3]),
  });
  assert.equal(extracted.invoice.totalAmount, "121.00");
  assert.match(String(requests[0].init?.body), /base64Source/);
  assert.equal((requests[0].init?.headers as Record<string, string>).authorization, "Bearer token");
});

test("completes missing fiscal fields from a compatible Factur-X XML", async () => {
  const partial = {
    status: "succeeded" as const,
    analyzeResult: { documents: [{ fields: {
      VendorName: { valueString: "Emas Printing Solutions, SL", confidence: 0.99 }, VendorTaxId: { valueString: "B63644462", confidence: 0.99 },
      InvoiceId: { valueString: "F26/1334", confidence: 0.99 }, InvoiceDate: { valueDate: "2026-09-01", confidence: 0.99 },
      InvoiceTotal: { valueCurrency: { amount: 55, currencyCode: "EUR" }, confidence: 0.99 },
    } }] },
  };
  let calls = 0;
  const fetchMock = async (_url: string | URL | Request, _init?: RequestInit) => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 202, headers: { "operation-location": "https://di.example.com/result/factur-x" } })
      : Response.json(partial);
  };
  const extractor = new DocumentIntelligenceInvoiceExtractor("https://di.example.com", { getAccessToken: async () => "token" }, { fetch: fetchMock as typeof fetch, pollIntervalMs: 0 });
  const extracted = await extractor.extract({
    messageId: "manual", attachmentId: "factur-x", sender: "pilot", receivedAt: "2026-09-15T19:00:00Z",
    originalFilename: "F26_1334.pdf", contentType: "application/pdf", content: Buffer.from(`%PDF-1.7\n${facturX}`),
  });
  assert.equal(extracted.invoice.taxableBase, "55.00");
  assert.equal(extracted.invoice.vatAmount, "0.00");
  assert.equal(extracted.confidence.taxableBase, 1);
  assert.equal(extracted.confidence.vatAmount, 1);
});

test("does not use a Factur-X payload that contradicts Document Intelligence", async () => {
  let calls = 0;
  const fetchMock = async (_url: string | URL | Request, _init?: RequestInit) => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 202, headers: { "operation-location": "https://di.example.com/result/mismatch" } })
      : Response.json({
        status: "succeeded", analyzeResult: { documents: [{ fields: {
          VendorName: { valueString: "Different supplier", confidence: 0.99 }, InvoiceId: { valueString: "F26/1334", confidence: 0.99 },
          InvoiceDate: { valueDate: "2026-09-01", confidence: 0.99 }, InvoiceTotal: { valueCurrency: { amount: 55, currencyCode: "EUR" }, confidence: 0.99 },
        } }] },
      });
  };
  const extractor = new DocumentIntelligenceInvoiceExtractor("https://di.example.com", { getAccessToken: async () => "token" }, { fetch: fetchMock as typeof fetch, pollIntervalMs: 0 });
  const extracted = await extractor.extract({
    messageId: "manual", attachmentId: "mismatch", sender: "pilot", receivedAt: "2026-09-15T19:00:00Z",
    originalFilename: "F26_1334.pdf", contentType: "application/pdf", content: Buffer.from(`%PDF-1.7\n${facturX}`),
  });
  assert.equal(extracted.invoice.taxableBase, undefined);
  assert.equal(extracted.invoice.vatAmount, undefined);
});

test("rejects documents outside the F0 file-size limit", async () => {
  const extractor = new DocumentIntelligenceInvoiceExtractor("https://di.example.com", { getAccessToken: async () => "token" });
  await assert.rejects(() => extractor.extract({
    messageId: "manual", attachmentId: "large", sender: "pilot", receivedAt: "2026-09-10T12:00:00Z",
    originalFilename: "large.pdf", contentType: "application/pdf", content: new Uint8Array(4 * 1024 * 1024 + 1),
  }), /4 MB/);
});
