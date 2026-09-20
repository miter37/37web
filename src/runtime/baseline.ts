import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config";

export interface BaselineEvent {
  timestamp: string;
  task: string;
  site?: string;
  durationMs: number;
  llmCalls?: number;
  browserActions?: number;
  success: boolean;
  notes?: string;
}

function file(config: AppConfig) { return path.join(config.runtimeDir, "metrics", "baseline.jsonl"); }

export async function recordBaseline(config: AppConfig, event: Omit<BaselineEvent, "timestamp">) {
  await fs.mkdir(path.join(config.runtimeDir, "metrics"), { recursive: true });
  const row: BaselineEvent = { timestamp: new Date().toISOString(), ...event };
  await fs.appendFile(file(config), JSON.stringify(row) + "\n", { encoding: "utf8", mode: 0o600 });
  return row;
}

export async function baselineSummary(config: AppConfig) {
  try {
    const rows = (await fs.readFile(file(config), "utf8")).split("\n").filter(Boolean).map((x) => JSON.parse(x) as BaselineEvent);
    return rows;
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
