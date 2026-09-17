import { mkdir, readFile, writeFile } from "node:fs/promises";

type Category = "invoice" | "bank_settlement" | "other";
type Task = { id: string; expectedCategory: Category; excerpt: string };
type ModelResponse = {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  load_duration?: number;
};

const model = process.argv[2] ?? "qwen2.5:3b";
const tasks = JSON.parse(await readFile("fixtures/local-ai/p2-classification.json", "utf8")) as Task[];
const results: Record<string, unknown>[] = [];

for (const task of tasks) {
  const started = performance.now();
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: 0,
        format: "json",
        messages: [{
          role: "user",
          content: `Clasifica el extracto como invoice, bank_settlement u other. Devuelve exclusivamente JSON con category, confidence (0 a 1) y reasons (1 a 3 textos breves). Extracto: ${task.excerpt}`,
        }],
        options: { num_ctx: 2_048, num_predict: 128, temperature: 0, seed: 42 },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as ModelResponse;
    const parsed = JSON.parse(payload.message?.content ?? "") as Record<string, unknown>;
    const category = parsed.category;
    const confidence = parsed.confidence;
    const reasons = parsed.reasons;
    const schemaValid = (category === "invoice" || category === "bank_settlement" || category === "other")
      && typeof confidence === "number" && confidence >= 0 && confidence <= 1
      && Array.isArray(reasons) && reasons.length >= 1 && reasons.length <= 3 && reasons.every((reason) => typeof reason === "string");
    const accepted = schemaValid && category === task.expectedCategory;
    const evalSeconds = Number(payload.eval_duration ?? 0) / 1e9;
    const result = {
      taskId: task.id,
      expectedCategory: task.expectedCategory,
      actualCategory: typeof category === "string" ? category : null,
      status: accepted ? "accepted" : "escalate",
      acceptedFirstPass: accepted,
      escalated: !accepted,
      latencyMs: Math.round(performance.now() - started),
      loadMs: Math.round(Number(payload.load_duration ?? 0) / 1e6),
      promptTokens: payload.prompt_eval_count ?? 0,
      completionTokens: payload.eval_count ?? 0,
      tokensPerSecond: evalSeconds ? Number((Number(payload.eval_count ?? 0) / evalSeconds).toFixed(2)) : 0,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = {
      taskId: task.id,
      expectedCategory: task.expectedCategory,
      status: "escalate",
      acceptedFirstPass: false,
      escalated: true,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

const accepted = results.filter((result) => result.acceptedFirstPass === true).length;
const latency = results.map((result) => Number(result.latencyMs ?? 0)).sort((a, b) => a - b);
await mkdir(".local-ai", { recursive: true });
await writeFile(".local-ai/p2-classification-latest.json", `${JSON.stringify({
  generatedAt: new Date().toISOString(), model, taskCount: tasks.length, accepted, acceptanceRate: accepted / tasks.length,
  medianLatencyMs: latency[Math.floor(latency.length / 2)], results,
}, null, 2)}\n`, "utf8");
