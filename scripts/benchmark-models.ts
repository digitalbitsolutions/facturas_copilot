import { mkdir, writeFile } from "node:fs/promises";

const defaultModels = [
  "qwen2.5:3b",
  "qwen2.5-coder:3b",
  "qwen2.5:7b",
  "qwen2.5-coder:7b",
];
const models = process.argv.slice(2);
if (models.length === 0) models.push(...defaultModels);

const prompt = `Devuelve exclusivamente JSON válido con esta forma: {"category":"bug","risk":"low","summary":"..."}. Clasifica: El botón Guardar no cambia de estado cuando el formulario está vacío.`;
const results: Record<string, unknown>[] = [];

for (const model of models) {
  const started = performance.now();
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model, stream: false, keep_alive: 0, format: "json",
        messages: [{ role: "user", content: prompt }],
        options: { num_ctx: 2_048, num_predict: 64, temperature: 0, seed: 42 },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json() as Record<string, any>;
    const evalSeconds = Number(data.eval_duration ?? 0) / 1e9;
    const result = {
      model, status: "ok", latency_ms: Math.round(performance.now() - started),
      load_ms: Math.round(Number(data.load_duration ?? 0) / 1e6),
      prompt_tokens: data.prompt_eval_count ?? 0,
      completion_tokens: data.eval_count ?? 0,
      tokens_per_second: evalSeconds ? Number((Number(data.eval_count ?? 0) / evalSeconds).toFixed(2)) : 0,
      valid_json: (() => {
        try {
          const parsed = JSON.parse(data.message?.content ?? "") as Record<string, unknown>;
          return parsed.category === "bug" && parsed.risk === "low" && typeof parsed.summary === "string";
        } catch {
          return false;
        }
      })(),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { model, status: "error", latency_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

await mkdir(".local-ai", { recursive: true });
await writeFile(".local-ai/benchmark-latest.json", `${JSON.stringify({ generated_at: new Date().toISOString(), configuration: { num_ctx: 2_048, num_predict: 64, temperature: 0, sequential: true }, results }, null, 2)}\n`, "utf8");
