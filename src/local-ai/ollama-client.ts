import { redactSecrets } from "./redact.ts";
import type { LocalResult, LocalTask } from "./types.ts";

type Fetch = typeof globalThis.fetch;

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: Fetch;
  private queue: Promise<void> = Promise.resolve();

  constructor(baseUrl = "http://127.0.0.1:11434", fetchImpl: Fetch = globalThis.fetch) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  run(task: LocalTask): Promise<LocalResult> {
    const result = this.queue.then(() => this.execute(task));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async execute(task: LocalTask): Promise<LocalResult> {
    const started = performance.now();
    const timeoutMs = Math.min(task.limits?.timeoutMs ?? 90_000, 90_000);
    const metrics = () => ({
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Math.round(performance.now() - started),
      model: task.model,
      promptVersion: task.promptVersion ?? "v1",
    });

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: task.model,
          stream: false,
          keep_alive: 0,
          format: task.outputSchema ? "json" : undefined,
          messages: [{
            role: "user",
            content: redactSecrets([task.instructions, ...(task.context ?? [])].join("\n\n")),
          }],
          options: {
            num_ctx: Math.min(task.limits?.numCtx ?? 2_048, 4_096),
            num_predict: Math.min(task.limits?.numPredict ?? 256, 512),
            temperature: 0,
          },
        }),
      });

      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = await response.json() as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const content = payload.message?.content ?? "";
      const measured = { ...metrics(), promptTokens: payload.prompt_eval_count ?? 0, completionTokens: payload.eval_count ?? 0 };

      if (task.outputSchema) {
        try {
          return { status: "accepted", result: JSON.parse(content), metrics: measured };
        } catch {
          return { status: "invalid", error: "Model output was not valid JSON", metrics: measured };
        }
      }
      return { status: "accepted", result: content, metrics: measured };
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { status: timedOut ? "timeout" : "escalate", error: error instanceof Error ? error.message : String(error), metrics: metrics() };
    }
  }
}
