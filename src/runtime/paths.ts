import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config";

export async function ensureRuntime(config: AppConfig): Promise<void> {
  for (const dir of [
    config.runtimeDir,
    path.join(config.runtimeDir, "metrics"),
    path.join(config.runtimeDir, "snapshots"),
    path.join(config.runtimeDir, "observations"),
    path.join(config.runtimeDir, "traces"),
    path.join(config.runtimeDir, "sessions"),
    config.profileDir,
  ]) await fs.mkdir(dir, { recursive: true });
}
