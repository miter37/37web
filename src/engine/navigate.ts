import type { Page } from "playwright";

/**
 * Navigate in a way that survives ad-heavy pages and waiting for heavy SPA/anti-bot checks.
 */
export interface NavigateResult {
  url: string;
  title: string;
  /** "settled" when the network went quiet, "busy" when it never did (ads still loading). */
  network: "settled" | "busy";
}

export const DEFAULT_NAV_TIMEOUT_MS = 45000;
export const DEFAULT_SETTLE_MS = 3000;

export async function navigate(page: Page, url: string, options: { timeoutMs?: number; settleMs?: number } = {}): Promise<NavigateResult> {
  const timeout = options.timeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout });

  let network: NavigateResult["network"] = "busy";
  try {
    await page.waitForLoadState("networkidle", { timeout: settleMs });
    network = "settled";
  } catch {
    // Expected on ad-heavy sites; the document is already interactive.
  }

  // Automatic wait for Cloudflare challenge / interstitial loading pages (e.g. "잠시만 기다리십시오…", "Just a moment...")
  const isInterstitial = (title: string) => {
    const t = title.toLowerCase();
    return t.includes("잠시만") || t.includes("기다리") || t.includes("just a moment") || t.includes("checking your browser") || t.includes("attention required");
  };

  let title = await page.title().catch(() => "");
  if (isInterstitial(title)) {
    const interstitialDeadline = Date.now() + 15000;
    while (Date.now() < interstitialDeadline) {
      await page.waitForTimeout(1000);
      title = await page.title().catch(() => "");
      if (!isInterstitial(title)) break;
    }
  }

  return { url: page.url(), title, network };
}
