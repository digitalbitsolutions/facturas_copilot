import type { TaskType } from "./types.ts";

export type Route = "deterministic" | "local" | "codex";

export type RouteRequest = {
  taskType: TaskType;
  estimatedTokens: number;
  verifiable: boolean;
  fileCount?: number;
  changedLines?: number;
  containsSensitiveData?: boolean;
  failedLocally?: boolean;
  concerns?: string[];
};

export type RouteDecision = { route: Route; reasons: string[] };

const DETERMINISTIC = new Set<TaskType>();
const HIGH_RISK = new Set(["auth", "authorization", "security", "privacy", "migration", "production", "destructive"]);

export function routeTask(request: RouteRequest): RouteDecision {
  const concerns = new Set((request.concerns ?? []).map((item) => item.toLowerCase()));
  const risky = [...concerns].filter((item) => HIGH_RISK.has(item));

  if (request.failedLocally) return { route: "codex", reasons: ["local_attempt_failed"] };
  if (request.containsSensitiveData) return { route: "codex", reasons: ["sensitive_data"] };
  if (risky.length) return { route: "codex", reasons: risky.map((item) => `high_risk:${item}`) };
  if (request.estimatedTokens > 3_000) return { route: "codex", reasons: ["context_over_3000_tokens"] };
  if ((request.fileCount ?? 1) > 1) return { route: "codex", reasons: ["multiple_files"] };
  if ((request.changedLines ?? 0) > 80) return { route: "codex", reasons: ["change_over_80_lines"] };
  if (!request.verifiable) return { route: "codex", reasons: ["not_automatically_verifiable"] };
  if (DETERMINISTIC.has(request.taskType)) return { route: "deterministic", reasons: ["deterministic_tool_available"] };
  return { route: "local", reasons: ["bounded_low_risk_verifiable"] };
}
