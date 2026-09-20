import type { SiteActionModule } from "../../src/sdk/types";

export const actions: SiteActionModule = {
  async set_status(ctx) {
    // Example only. Prefer ctx.locator() helpers and Playwright semantic locators.
    const button = ctx.page.getByRole("button", { name: "Status" });
    await button.click();
    await ctx.page.getByRole("option", { name: String(ctx.input.status) }).click();
  },
};
