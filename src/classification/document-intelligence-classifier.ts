import type { AccessTokenProvider } from "../microsoft365/graph-client.ts";
import type { AttachmentInput, DocumentClassification, DocumentClassifier } from "../processing/types.ts";
import { classifyDocumentText } from "./classifier.ts";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-read";

type AnalyzeResponse = {
  status?: "notStarted" | "running" | "succeeded" | "failed";
  error?: { code?: string; message?: string };
  analyzeResult?: { content?: string };
};

export type DocumentClassifierOptions = { fetch?: typeof fetch; pollIntervalMs?: number; timeoutMs?: number };

export class DocumentIntelligenceDocumentClassifier implements DocumentClassifier {
  private readonly endpoint: string;
  private readonly tokenProvider: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(endpoint: string, tokenProvider: AccessTokenProvider, options: DocumentClassifierOptions = {}) {
    this.endpoint = endpoint.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(this.endpoint)) throw new Error("Invalid Document Intelligence endpoint");
    this.tokenProvider = tokenProvider;
    this.fetchImpl = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async classify(input: AttachmentInput): Promise<DocumentClassification> {
    if (input.contentType !== "application/pdf" || input.content.length === 0 || input.content.length > 4 * 1024 * 1024) {
      throw new Error("Classification requires a PDF between 1 byte and 4 MB for the F0 tier");
    }
    const token = await this.tokenProvider.getAccessToken();
    const response = await this.fetchImpl(
      `${this.endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}&pages=1-2`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ base64Source: Buffer.from(input.content).toString("base64") }),
      },
    );
    if (response.status !== 202) throw await this.responseError("submit", response);
    const operationUrl = response.headers.get("operation-location");
    if (!operationUrl?.startsWith(`${this.endpoint}/`)) throw new Error("Document Intelligence returned an invalid classification operation location");

    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (this.pollIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      const poll = await this.fetchImpl(operationUrl, { headers: { authorization: `Bearer ${token}` } });
      if (!poll.ok) throw await this.responseError("poll", poll);
      const payload = await poll.json() as AnalyzeResponse;
      if (payload.status === "succeeded") return classifyDocumentText(payload.analyzeResult?.content ?? "");
      if (payload.status === "failed") throw new Error(`Document classification failed: ${payload.error?.message ?? payload.error?.code ?? "unknown error"}`);
    }
    throw new Error("Document classification timed out");
  }

  private async responseError(operation: string, response: Response): Promise<Error> {
    const body = await response.text();
    return new Error(`Document Intelligence classification ${operation} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}
