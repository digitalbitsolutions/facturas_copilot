import assert from "node:assert/strict";
import test from "node:test";
import { DocumentIntelligenceInvoiceExtractor, mapInvoiceResult } from "./document-intelligence.ts";

const result = {
  status: "succeeded" as const,
  analyzeResult: { documents: [{ fields: {
    VendorName: { valueString: "Proveedor Norte, S.L.", confidence: 0.98 },
    InvoiceId: { valueString: "F-2026-42", confidence: 0.97 },
    InvoiceDate: { valueDate: "2026-09-01", confidence: 0.96 },
    DueDate: { valueDate: "2026-10-01", confidence: 0.91 },
    SubTotal: { valueCurrency: { amount: 100, currencyCode: "EUR" }, confidence: 0.95 },
    TotalTax: { valueCurrency: { amount: 21, currencyCode: "EUR" }, confidence: 0.94 },
    InvoiceTotal: { valueCurrency: { amount: 121, currencyCode: "EUR" }, confidence: 0.99 },
  } }] },
};

test("maps the prebuilt invoice fields to the validation contract", () => {
  assert.deepEqual(mapInvoiceResult(result), {
    invoice: {
      supplierName: "Proveedor Norte, S.L.", invoiceNumber: "F-2026-42", invoiceDate: "2026-09-01",
      dueDate: "2026-10-01", taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00", currency: "EUR",
    },
    confidence: {
      supplierName: 0.98, invoiceNumber: 0.97, invoiceDate: 0.96, dueDate: 0.91,
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

test("rejects documents outside the F0 file-size limit", async () => {
  const extractor = new DocumentIntelligenceInvoiceExtractor("https://di.example.com", { getAccessToken: async () => "token" });
  await assert.rejects(() => extractor.extract({
    messageId: "manual", attachmentId: "large", sender: "pilot", receivedAt: "2026-09-10T12:00:00Z",
    originalFilename: "large.pdf", contentType: "application/pdf", content: new Uint8Array(4 * 1024 * 1024 + 1),
  }), /4 MB/);
});
