import { mkdir, readFile, writeFile } from "node:fs/promises";

type Task = { id: string; targetFile: string; kind: "proposal" | "diff"; instruction: string };
type ModelResponse = {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  load_duration?: number;
};

const model = process.argv[2] ?? "qwen2.5-coder:3b";
const tasks = JSON.parse(await readFile("fixtures/local-ai/p2-code.json", "utf8")) as Task[];
const results: Record<string, unknown>[] = [];

for (const task of tasks) {
  const started = performance.now();
  try {
    const source = await readFile(task.targetFile, "utf8");
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
          content: `${task.instruction}\n\nDevuelve exclusivamente JSON con summary, targetFile, proposedChange y validation. targetFile debe ser exactamente ${task.targetFile}. ${task.kind === "diff" ? "proposedChange debe contener solo un diff unificado aplicable a ese archivo." : "proposedChange debe describir el caso con arrange, act y assert."}\n\nArchivo de contexto:\n${source}`,
        }],
        options: { num_ctx: 2_048, num_predict: 256, temperature: 0, seed: 42 },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as ModelResponse;
    const parsed = JSON.parse(payload.message?.content ?? "") as Record<string, unknown>;
    const proposedChange = parsed.proposedChange;
    const structuralValid = typeof parsed.summary === "string" && parsed.targetFile === task.targetFile
      && typeof proposedChange === "string" && typeof parsed.validation === "string";
    const changeUsable = task.kind === "diff"
      ? typeof proposedChange === "string" && proposedChange.includes("---") && proposedChange.includes("+++")
      : typeof proposedChange === "string" && /arrange|act|assert/i.test(proposedChange);
    const accepted = structuralValid && changeUsable;
    const evalSeconds = Number(payload.eval_duration ?? 0) / 1e9;
    const result = {
      taskId: task.id, targetFile: task.targetFile, kind: task.kind,
      status: accepted ? "accepted" : "escalate", acceptedFirstPass: accepted, escalated: !accepted,
      latencyMs: Math.round(performance.now() - started), loadMs: Math.round(Number(payload.load_duration ?? 0) / 1e6),
      promptTokens: payload.prompt_eval_count ?? 0, completionTokens: payload.eval_count ?? 0,
      tokensPerSecond: evalSeconds ? Number((Number(payload.eval_count ?? 0) / evalSeconds).toFixed(2)) : 0,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { taskId: task.id, targetFile: task.targetFile, kind: task.kind, status: "escalate", acceptedFirstPass: false, escalated: true, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

const accepted = results.filter((result) => result.acceptedFirstPass === true).length;
const latency = results.map((result) => Number(result.latencyMs ?? 0)).sort((a, b) => a - b);
await mkdir(".local-ai", { recursive: true });
await writeFile(".local-ai/p2-code-latest.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), model, taskCount: tasks.length, accepted, acceptanceRate: accepted / tasks.length, medianLatencyMs: latency[Math.floor(latency.length / 2)], results }, null, 2)}\n`, "utf8");
