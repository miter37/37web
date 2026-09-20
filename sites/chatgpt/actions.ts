import type { SiteActionContext, SiteActionModule } from "../../src/sdk/types";

const MAX_RESPONSE_WAIT_MS = 120000;

async function submitPrompt(ctx: SiteActionContext, prompt: string): Promise<void> {
  const textarea = await ctx.locator("prompt_textarea");
  await textarea.click();
  await textarea.fill(prompt);
  (await ctx.locator("submit_button")).click();
}

/**
 * Super simple & bulletproof response completion wait:
 * 1. Wait until stop-button disappears (streaming completely done).
 * 2. Ignore all charts/widgets/canvas during generation.
 * 3. Only at the very end, read the final text.
 */
async function waitForResponseComplete(ctx: SiteActionContext): Promise<string> {
  const page = ctx.page;
  const stopButton = page.locator("[data-testid='stop-button']");

  // Wait briefly for generation to begin
  try {
    await stopButton.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    // If response was instant or stop button missed, proceed
  }

  // Simply wait until stop button is gone
  const deadline = Date.now() + MAX_RESPONSE_WAIT_MS;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error("Browser page was closed unexpectedly during generation");
    const isStopping = await stopButton.isVisible().catch(() => false);
    if (!isStopping) break;
    await page.waitForTimeout(1000);
  }

  // Grace period for any final markdown/text rendering
  await page.waitForTimeout(1500);

  // Read the final text from the assistant turn (charts/widgets are naturally bypassed)
  const turns = page.locator("[data-testid^='conversation-turn-']");
  const count = await turns.count().catch(() => 0);
  if (count === 0) {
    throw new Error("No conversation turn found on ChatGPT page");
  }

  const latestTurn = turns.last();

  // Extract clean text directly from browser DOM
  const text = await latestTurn.evaluate((el: HTMLElement) => {
    return (el.innerText || el.textContent || "").trim();
  }).catch(async () => {
    return (await latestTurn.innerText().catch(() => "")).trim();
  });

  return text;
}

export const actions: SiteActionModule = {
  async ask_and_copy(ctx) {
    const prompt = String(ctx.input.prompt || "").trim();
    if (!prompt) throw new Error('ask_and_copy requires input.prompt, e.g. {"prompt":"..."}');
    await submitPrompt(ctx, prompt);
    await waitForResponseComplete(ctx);

    const copyButton = ctx.page.locator("[data-testid='copy-turn-action-button'], [aria-label='응답 복사'], [aria-label='Copy']").last();
    let copied = false;
    if (await copyButton.count().catch(() => 0)) {
      try {
        await copyButton.click({ force: true });
        copied = true;
      } catch {
        copied = false;
      }
    }
    return { copied };
  },

  async ask_and_extract(ctx) {
    const prompt = String(ctx.input.prompt || "").trim();
    if (!prompt) throw new Error('ask_and_extract requires input.prompt, e.g. {"prompt":"..."}');

    await submitPrompt(ctx, prompt);
    const text = await waitForResponseComplete(ctx);

    return {
      completed: true,
      text,
      text_length: text.length,
    };
  },
};
