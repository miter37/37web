import type { Page } from "playwright";
import type { SiteDefinition } from "../schema/site";
import { matchFingerprint } from "./fingerprint";
import { evaluateCondition } from "./conditions";

export interface DetectedState {
  state?: string;
  variant?: string;
}

export async function detectState(page: Page, site: SiteDefinition): Promise<DetectedState> {
  for (const [stateId, state] of Object.entries(site.states)) {
    for (const variant of state.variants) {
      if (await matchFingerprint(page, site, variant).catch(() => false)) {
        if (state.readyWhen && !(await evaluateCondition(page, site, state.readyWhen, {}))) continue;
        return { state: stateId, variant };
      }
    }
  }
  return {};
}
