import assert from "node:assert/strict";
import test from "node:test";
import { OllamaClient } from "./ollama-client.ts";
import { redactSecrets } from "./redact.ts";
import { routeTask } from "./router.ts";

test("redacts common secrets", () => {
  assert.equal(redactSecrets("api_key=abc123 password: hunter2"), "api_key=[REDACTED] password=[REDACTED]");
});

test("routes bounded work locally", () => {
  assert.equal(routeTask({ taskType: "classify", estimatedTokens: 200, verifiable: true }).route, "local");
});

test("routes sensitive and oversized work to Codex", () => {
  assert.equal(routeTask({ taskType: "extract", estimatedTokens: 200, verifiable: true, containsSensitiveData: true }).route, "codex");
  assert.equal(routeTask({ taskType: "summarize", estimatedTokens: 3_001, verifiable: true }).route, "codex");
});

test("parses a simulated Ollama JSON response", async () => {
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.options.num_ctx, 2_048);
    assert.match(body.messages[0].content, /\[REDACTED\]/);
    return new Response(JSON.stringify({ message: { content: "{\"category\":\"safe\"}" }, prompt_eval_count: 12, eval_count: 5 }));
  };
  const result = await new OllamaClient("http://local", fakeFetch).run({
    taskId: "test-1",
    taskType: "classify",
    model: "qwen3:1.7b",
    instructions: "Classify token=secret-value",
    outputSchema: { type: "object" },
  });
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.result, { category: "safe" });
  assert.equal(result.metrics.promptTokens, 12);
});

test("serializes concurrent requests", async () => {
  let active = 0;
  let maximumActive = 0;
  const fakeFetch: typeof fetch = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return new Response(JSON.stringify({ message: { content: "ok" } }));
  };
  const client = new OllamaClient("http://local", fakeFetch);
  const task = { taskId: "concurrency", taskType: "summarize" as const, model: "test", instructions: "test" };
  await Promise.all([client.run(task), client.run(task), client.run(task)]);
  assert.equal(maximumActive, 1);
});
