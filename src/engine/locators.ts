import type { Locator, Page } from "playwright";
import type { ElementDefinition, LocatorStrategy, SiteDefinition } from "../schema/site";

export function locatorFromStrategy(page: Page, strategy: LocatorStrategy): Locator {
  if (strategy.role) return page.getByRole(strategy.role as any, { name: strategy.name, exact: strategy.exact });
  if (strategy.testId) return page.getByTestId(strategy.testId);
  if (strategy.label) return page.getByLabel(strategy.label, { exact: strategy.exact });
  if (strategy.placeholder) return page.getByPlaceholder(strategy.placeholder, { exact: strategy.exact });
  if (strategy.text) return page.getByText(strategy.text, { exact: strategy.exact });
  if (strategy.css) return page.locator(strategy.css);
  throw new Error("Invalid locator strategy");
}

export async function resolveElement(page: Page, element: ElementDefinition): Promise<Locator> {
  let last: Locator | undefined;
  for (const strategy of element.strategies) {
    const locator = locatorFromStrategy(page, strategy).first();
    last = locator;
    if (await locator.count().catch(() => 0)) return locator;
  }
  if (last) return last;
  throw new Error("Element has no locator strategy");
}

export async function locatorFor(page: Page, site: SiteDefinition, elementId: string): Promise<Locator> {
  const element = site.elements[elementId];
  if (!element) throw new Error(`Unknown element: ${elementId}`);
  return resolveElement(page, element);
}
