import type { Page } from "playwright";
import type { AppConfig } from "../config";
import { loadRegistry } from "../registry/load";
import { hostMatches, matchesGlob } from "../utils/glob";
import { loadSite, type LoadedSite } from "./site-loader";
import { matchFingerprint } from "./fingerprint";
import { detectState } from "./state";

export interface IdentifiedSite {
  loaded: LoadedSite;
  state?: string;
  variant?: string;
}

export async function identifySite(config: AppConfig, page: Page): Promise<IdentifiedSite | null> {
  const registry = await loadRegistry(config);
  const url = new URL(page.url());
  const candidates = registry.entries.filter((entry) =>
    entry.match.hosts.some((host) => hostMatches(url.hostname, host)) &&
    (!entry.match.urlPatterns?.length || entry.match.urlPatterns.some((pattern) => matchesGlob(url.pathname + url.search, pattern)))
  );

  for (const entry of candidates) {
    const loaded = await loadSite(config, entry.path);
    const fps = loaded.definition.match.fingerprints ?? [];
    if (fps.length) {
      let any = false;
      for (const fp of fps) if (await matchFingerprint(page, loaded.definition, fp).catch(() => false)) { any = true; break; }
      if (!any) continue;
    }
    const detected = await detectState(page, loaded.definition);
    return { loaded, ...detected };
  }
  return null;
}
