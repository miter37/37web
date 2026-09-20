import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config";
import { buildRegistry } from "./build";
import type { RegistryFile } from "./types";

export async function loadRegistry(config: AppConfig): Promise<RegistryFile> {
  const file = path.join(config.generatedDir, "target_sites.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as RegistryFile;
  } catch (error: any) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return buildRegistry(config);
    }
    throw error;
  }
}
