import fs from "node:fs/promises";
import YAML from "yaml";
import type { AppConfig } from "../config";
import type { LoadedSite } from "./site-loader";
import { evidenceFor } from "../runtime/metrics";

export type Lifecycle = "encoded" | "candidate" | "verified";

export async function promoteAfterSuccess(
  config: AppConfig,
  site: LoadedSite,
  actionId: string,
  variant: string,
  current: Lifecycle,
  variantSpecific: boolean,
): Promise<{ from: Lifecycle; to: Lifecycle; changed: boolean }> {
  const evidence = await evidenceFor(config, site.definition.site.id, actionId, variant);
  let next = current;
  if (current === "encoded" && evidence.successes >= 1) next = "candidate";
  if (current === "candidate" && evidence.successfulSessions >= 2) next = "verified";
  if (next === current) return { from: current, to: current, changed: false };

  const raw = await fs.readFile(site.yamlPath, "utf8");
  const doc = YAML.parse(raw);
  if (!doc.actions?.[actionId]) throw new Error(`Cannot promote missing action ${actionId}`);
  if (variantSpecific) {
    if (!doc.actions[actionId].variants?.[variant]) throw new Error(`Cannot promote missing variant ${variant}`);
    doc.actions[actionId].variants[variant].lifecycle = next;
  } else {
    doc.actions[actionId].lifecycle = next;
  }
  await fs.writeFile(site.yamlPath, YAML.stringify(doc), "utf8");
  return { from: current, to: next, changed: true };
}
