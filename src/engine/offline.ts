import type { SiteDefinition } from "../schema/site";
import type { PageSnapshot, SnapshotElement } from "../runtime/snapshot";
import { matchesGlob } from "../utils/glob";

function elementStrategyMatches(e: SnapshotElement, s: any): boolean {
  if (s.role) return e.role === s.role && (!s.name || (s.exact ? e.name === s.name : Boolean(e.name?.includes(s.name))));
  if (s.testId) return e.testId === s.testId;
  if (s.text) return s.exact ? e.text === s.text : Boolean(e.text?.includes(s.text));
  if (s.label) return s.exact ? e.label === s.label : Boolean(e.label?.includes(s.label));
  if (s.placeholder) return s.exact ? e.placeholder === s.placeholder : Boolean(e.placeholder?.includes(s.placeholder));
  // CSS cannot be reliably evaluated from the sanitized structured snapshot.
  return false;
}

function namedElementMatches(snapshot: PageSnapshot, site: SiteDefinition, elementId: string): boolean {
  const def = site.elements[elementId];
  if (!def) return false;
  return def.strategies.some((s) => snapshot.elements.some((e) => elementStrategyMatches(e, s)));
}

export function matchFingerprintOffline(snapshot: PageSnapshot, site: SiteDefinition, name: string, stack: string[] = []): boolean {
  if (stack.includes(name)) throw new Error(`Fingerprint cycle: ${[...stack, name].join(" -> ")}`);
  const fp = site.fingerprints[name];
  if (!fp) return false;
  const next = [...stack, name];
  const atom = (a: any) => {
    if (a.url !== undefined) return matchesGlob(snapshot.url, a.url);
    if (a.title !== undefined) return matchesGlob(snapshot.title, a.title);
    if (a.text !== undefined) return snapshot.headings.some((x) => x.includes(a.text)) || snapshot.elements.some((e) => e.text?.includes(a.text) || e.name?.includes(a.text));
    if (a.element !== undefined) return namedElementMatches(snapshot, site, a.element);
    if (a.fingerprint !== undefined) return matchFingerprintOffline(snapshot, site, a.fingerprint, next);
    return false;
  };
  if (fp.all?.length && !fp.all.every(atom)) return false;
  if (fp.any?.length && !fp.any.some(atom)) return false;
  return true;
}

export function detectStateOffline(snapshot: PageSnapshot, site: SiteDefinition) {
  for (const [state, def] of Object.entries(site.states)) {
    for (const variant of def.variants) {
      if (matchFingerprintOffline(snapshot, site, variant)) return { state, variant };
    }
  }
  return {};
}
