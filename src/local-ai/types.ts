export type TaskType =
  | "classify"
  | "extract"
  | "summarize"
  | "code_patch"
  | "test_generation"
  | "vision";

export type LocalTask = {
  taskId: string;
  taskType: TaskType;
  model: string;
  instructions: string;
  context?: string[];
  outputSchema?: Record<string, unknown>;
  limits?: {
    numCtx?: number;
    numPredict?: number;
    timeoutMs?: number;
  };
  promptVersion?: string;
};

export type LocalResult = {
  status: "accepted" | "invalid" | "timeout" | "escalate";
  result?: unknown;
  error?: string;
  metrics: {
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    model: string;
    promptVersion: string;
  };
};
