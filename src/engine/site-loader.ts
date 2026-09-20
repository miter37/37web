import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { pathToFileURL } from "node:url";
import type { AppConfig } from "../config";
import { SiteSchema, type SiteDefinition } from "../schema/site";
import type { SiteActionModule } from "../sdk/types";
import { scanActionFile } from "../security/action-scan";

export interface LoadedSite {
  definition: SiteDefinition;
  dir: string;
  yamlPath: string;
}

export async function loadSite(config: AppConfig, sitePathOrId: string): Promise<LoadedSite> {
  const dir = sitePathOrId.includes("/") || sitePathOrId.includes("\\")
    ? path.resolve(config.root, sitePathOrId)
    : path.join(config.sitesDir, sitePathOrId);
  const yamlPath = path.join(dir, "site.yaml");
  const raw = await fs.readFile(yamlPath, "utf8");
  const definition = SiteSchema.parse(YAML.parse(raw));
  return { definition, dir, yamlPath };
}

export async function loadActionModule(site: LoadedSite): Promise<SiteActionModule> {
  const file = path.join(site.dir, "actions.ts");
  try {
    await fs.access(file);
  } catch {
    return {};
  }
  await scanActionFile(file);
  const url = pathToFileURL(file);
  url.searchParams.set("v", String(Date.now()));
  const mod = await import(url.href);
  const actions = mod.actions ?? mod.default ?? {};
  return actions as SiteActionModule;
}
