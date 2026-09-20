import path from "node:path";
import { navigate } from "./navigate";
import type { Page } from "playwright";
import type { AppConfig } from "../config";
import type { ActionDefinition, SiteDefinition, VerifyDefinition } from "../schema/site";
import type { SiteActionContext } from "../sdk/types";
import { locatorFor } from "./locators";
import { runExtractor } from "./extractors";
import { detectState } from "./state";
import { evaluateCondition } from "./conditions";
import { effectiveRisk, isWriteLike, requiresConfirmation } from "./risk";
import { verifyAction } from "./verify";
import { appendMetric, type VerificationOutcome } from "../runtime/metrics";
import { classifyError } from "./failure";
import { interpolate } from "../utils/strings";
import { loadActionModule, type LoadedSite } from "./site-loader";
import { promoteAfterSuccess, type Lifecycle } from "./lifecycle";

export interface RunActionOptions {
  sessionId: string;
  actionId: string;
  input: Record<string, unknown>;
  confirmed?: boolean;
}

function resolveUrl(page: Page, template: string): string {
  if (/^https?:\/\//i.test(template)) return template;
  return new URL(template, page.url()).toString();
}

async function runDeclarative(page: Page, site: SiteDefinition, steps: any[], input: Record<string, unknown>) {
  for (const step of steps) {
    if (step.op === "goto") {
      const template = site.urlTemplates[step.urlTemplate];
      if (!template) throw new Error(`Unknown URL template: ${step.urlTemplate}`);
      await navigate(page, resolveUrl(page, interpolate(template, input)));
    } else if (step.op === "click") {
      await (await locatorFor(page, site, step.element)).click();
    } else if (step.op === "fill") {
      await (await locatorFor(page, site, step.element)).fill(interpolate(step.value, input));
    } else if (step.op === "select") {
      await (await locatorFor(page, site, step.element)).selectOption(interpolate(step.value, input));
    } else if (step.op === "press") {
      if (step.element) await (await locatorFor(page, site, step.element)).press(step.key);
      else await page.keyboard.press(step.key);
    } else if (step.op === "wait_for") {
      const timeoutMs = step.timeoutMs ?? 10_000;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evaluateCondition(page, site, step.condition, input).catch(() => false)) break;
        await page.waitForTimeout(100);
      }
      if (!(await evaluateCondition(page, site, step.condition, input).catch(() => false))) {
        throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
      }
    }
  }
}

export async function runKnownAction(config: AppConfig, page: Page, loaded: LoadedSite, options: RunActionOptions) {
  const site = loaded.definition;
  const action = site.actions[options.actionId];
  if (!action) throw new Error(`Unknown action: ${options.actionId}`);

  const detected = await detectState(page, site);
  if (action.allowedStates?.length && (!detected.state || !action.allowedStates.includes(detected.state))) {
    throw new Error(`Action ${options.actionId} not allowed in state ${detected.state || "UNKNOWN"}`);
  }
  for (const preconditionId of action.preconditions ?? []) {
    const condition = site.preconditions[preconditionId];
    if (!condition) throw new Error(`Unknown precondition: ${preconditionId}`);
    if (!(await evaluateCondition(page, site, condition, options.input))) throw new Error(`Precondition failed: ${preconditionId}`);
  }

  const variant = detected.variant || "_unknown";
  const variantSpec = action.variants ? action.variants[variant] : undefined;
  if (action.variants && !variantSpec) {
    throw new Error(`Action ${options.actionId} has variant-specific knowledge but no implementation for UI variant ${variant}`);
  }
  const implementation = variantSpec?.implementation ?? action.implementation;
  const verify = (variantSpec?.verify ?? action.verify) as VerifyDefinition[];
  const lifecycle = (variantSpec?.lifecycle ?? action.lifecycle) as Lifecycle;
  const risk = effectiveRisk(options.actionId, action as ActionDefinition);
  if (requiresConfirmation(risk) && !options.confirmed) {
    return { ok: false, confirmationRequired: true, risk, lifecycle, state: detected.state, variant };
  }

  const started = Date.now();
  let returned: unknown;
  let executionError: unknown;
  try {
    if (implementation.kind === "declarative") {
      await runDeclarative(page, site, implementation.steps, options.input);
    } else {
      const mod = await loadActionModule(loaded);
      const exportName = implementation.export || options.actionId;
      const fn = mod[exportName];
      if (!fn) throw new Error(`Missing code action export: ${exportName} in ${path.join(loaded.dir, "actions.ts")}`);
      const ctx: SiteActionContext = {
        page,
        input: options.input,
        site,
        sessionId: options.sessionId,
        variant,
        locator: (id) => locatorFor(page, site, id),
        extract: (id) => runExtractor(page, site, id),
        detectState: () => detectState(page, site),
      };
      returned = await fn(ctx);
    }
  } catch (error) {
    executionError = error;
  }

  if (!executionError && action.returns?.extractor) {
    returned = await runExtractor(page, site, action.returns.extractor);
  }

  // Invariant: a write-like action that throws/timeouts is verified before any retry.
  // This MVP performs no blind retry; the result stays UNKNOWN/NOT_APPLIED for the caller to decide.
  const verification = await verifyAction(page, site, verify, options.input).catch((error: any) => ({
    outcome: "UNKNOWN" as VerificationOutcome,
    details: [{ condition: "verification", error: error?.message || String(error) }],
  }));

  const applied = verification.outcome === "APPLIED";
  const ok = executionError ? (isWriteLike(risk) && applied) : applied;
  const failureClass = executionError ? classifyError(executionError) : (applied ? undefined : "verification");
  await appendMetric(config, {
    timestamp: new Date().toISOString(),
    sessionId: options.sessionId,
    site: site.site.id,
    action: options.actionId,
    variant,
    ok,
    verified: verification.outcome,
    durationMs: Date.now() - started,
    failureClass,
    error: executionError ? String((executionError as any)?.message || executionError).slice(0, 500) : undefined,
  });

  let promotion;
  if (ok && applied) {
    promotion = await promoteAfterSuccess(config, loaded, options.actionId, variant, lifecycle, Boolean(variantSpec));
  }

  return {
    ok,
    risk,
    lifecycle,
    state: detected.state,
    variant,
    verification,
    returned,
    executionError: executionError ? String((executionError as any)?.message || executionError) : undefined,
    failureClass,
    promotion,
    retryPolicy: isWriteLike(risk) ? "verify-before-retry; no blind retry" : "caller may retry after classifying transient failure",
  };
}
