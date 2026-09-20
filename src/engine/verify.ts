import type { Page } from "playwright";
import type { SiteDefinition, VerifyDefinition } from "../schema/site";
import type { VerificationOutcome } from "../runtime/metrics";
import { detectState } from "./state";
import { evaluateCondition } from "./conditions";

export interface VerificationResult {
  outcome: VerificationOutcome;
  details: Array<{ condition: unknown; ok?: boolean; error?: string }>;
}

export async function verifyAction(page: Page, site: SiteDefinition, verify: VerifyDefinition[], vars: Record<string, unknown>): Promise<VerificationResult> {
  if (!verify.length) return { outcome: "UNKNOWN", details: [] };
  const details: VerificationResult["details"] = [];
  let unknown = false;
  for (const condition of verify as any[]) {
    try {
      let ok: boolean;
      if (condition.type === "state_is") ok = (await detectState(page, site)).state === condition.state;
      else ok = await evaluateCondition(page, site, condition as any, vars);
      details.push({ condition, ok });
      if (!ok) return { outcome: "NOT_APPLIED", details };
    } catch (error: any) {
      unknown = true;
      details.push({ condition, error: error?.message || String(error) });
    }
  }
  return { outcome: unknown ? "UNKNOWN" : "APPLIED", details };
}
