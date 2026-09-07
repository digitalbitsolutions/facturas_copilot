import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type TelemetryEvent = {
  taskId: string;
  category: string;
  route: string;
  model?: string;
  latencyMs: number;
  acceptedFirstPass: boolean;
  escalated: boolean;
  promptVersion: string;
};

export async function appendTelemetry(path: string, event: TelemetryEvent): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ ...event, recordedAt: new Date().toISOString() })}\n`, "utf8");
}
