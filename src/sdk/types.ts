import type { Locator, Page } from "playwright";
import type { SiteDefinition } from "../schema/site";

export interface SiteActionContext {
  page: Page;
  input: Record<string, unknown>;
  site: SiteDefinition;
  sessionId: string;
  variant?: string;
  locator(elementId: string): Promise<Locator>;
  extract(extractorId: string): Promise<string | null>;
  detectState(): Promise<{ state?: string; variant?: string }>;
}

export type SiteActionFunction = (ctx: SiteActionContext) => Promise<unknown>;
export type SiteActionModule = Record<string, SiteActionFunction>;
