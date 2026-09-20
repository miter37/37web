import type { Page } from "playwright";
import type { FingerprintDefinition, SiteDefinition } from "../schema/site";
import { matchesGlob } from "../utils/glob";
import { locatorFor } from "./locators";

export async function matchFingerprint(page: Page, site: SiteDefinition, name: string, stack: string[] = []): Promise<boolean> {
  if (stack.includes(name)) throw new Error(`Fingerprint cycle: ${[...stack, name].join(" -> ")}`);
  const fp = site.fingerprints[name];
  if (!fp) throw new Error(`Unknown fingerprint: ${name}`);
  return matchFingerprintDefinition(page, site, fp, [...stack, name]);
}

async function atomMatches(page: Page, site: SiteDefinition, atom: any, stack: string[]): Promise<boolean> {
  if (atom.url !== undefined) return matchesGlob(page.url(), atom.url);
  if (atom.title !== undefined) return matchesGlob(await page.title(), atom.title);
  if (atom.text !== undefined) return (await page.getByText(atom.text, { exact: false }).count().catch(() => 0)) > 0;
  if (atom.element !== undefined) return (await (await locatorFor(page, site, atom.element)).count().catch(() => 0)) > 0;
  if (atom.fingerprint !== undefined) return matchFingerprint(page, site, atom.fingerprint, stack);
  return false;
}

export async function matchFingerprintDefinition(page: Page, site: SiteDefinition, fp: FingerprintDefinition, stack: string[] = []): Promise<boolean> {
  if (fp.all?.length) {
    for (const atom of fp.all) if (!(await atomMatches(page, site, atom, stack))) return false;
  }
  if (fp.any?.length) {
    let matched = false;
    for (const atom of fp.any) if (await atomMatches(page, site, atom, stack)) { matched = true; break; }
    if (!matched) return false;
  }
  return true;
}
