import assert from "node:assert/strict";
import test from "node:test";
import { DocumentIntelligenceDocumentClassifier } from "./document-intelligence-classifier.ts";

test("reads PDF text and returns an auditable classification", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer token");
    if (calls === 1) return new Response(null, { status: 202, headers: { "operation-location": "https://di.example.com/operations/1" } });
    return Response.json({ status: "succeeded", analyzeResult: { content: "Factura Base imponible IVA Total factura" } });
  };
  const classifier = new DocumentIntelligenceDocumentClassifier(
    "https://di.example.com", { getAccessToken: async () => "token" }, { fetch: fakeFetch, pollIntervalMs: 0 },
  );
  const result = await classifier.classify({
    messageId: "m", attachmentId: "a", sender: "sender@example.test", receivedAt: "2026-09-11T00:00:00Z",
    originalFilename: "invoice.pdf", contentType: "application/pdf", content: new Uint8Array([37, 80, 68, 70]),
  });
  assert.equal(result.kind, "invoice");
  assert.equal(calls, 2);
});
