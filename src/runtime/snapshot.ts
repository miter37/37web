import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { AppConfig } from "../config";
import { redactText } from "../utils/strings";

export interface SnapshotElement {
  tag: string;
  role?: string;
  name?: string;
  text?: string;
  testId?: string;
  placeholder?: string;
  label?: string;
  href?: string;
}

export interface PageSnapshot {
  capturedAt: string;
  url: string;
  title: string;
  headings: string[];
  elements: SnapshotElement[];
}

export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  const raw = await page.locator('a,button,input,select,textarea,[role],[data-testid]').evaluateAll((nodes) =>
    nodes.slice(0, 300).map((node: any) => ({
      tag: String(node.tagName || "").toLowerCase(),
      role: node.getAttribute?.("role") || undefined,
      name: node.getAttribute?.("aria-label") || node.innerText || undefined,
      text: node.innerText || undefined,
      testId: node.getAttribute?.("data-testid") || undefined,
      placeholder: node.getAttribute?.("placeholder") || undefined,
      label: node.labels?.[0]?.innerText || undefined,
      href: node.getAttribute?.("href") || undefined,
    }))
  );
  const headings = await page.locator("h1,h2,h3").allInnerTexts().catch(() => []);
  return {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    title: redactText(await page.title().catch(() => "")),
    headings: headings.slice(0, 30).map(redactText),
    elements: raw.map((e: SnapshotElement) => ({
      ...e,
      name: e.name ? redactText(e.name) : undefined,
      text: e.text ? redactText(e.text) : undefined,
      href: e.href ? redactText(e.href) : undefined,
    })),
  };
}

export async function saveSnapshot(config: AppConfig, sessionId: string, snapshot: PageSnapshot): Promise<string> {
  const file = path.join(config.runtimeDir, "snapshots", `${Date.now()}-${sessionId}.json`);
  await fs.writeFile(file, JSON.stringify(snapshot, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return file;
}
