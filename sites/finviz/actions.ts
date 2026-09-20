import type { Locator, Page } from "playwright";
import type { SiteActionContext, SiteActionModule } from "../../src/sdk/types";

/* ------------------------------------------------------------------ *
 * Ad overlay
 * ------------------------------------------------------------------ */

/**
 * finviz occasionally covers the page with a Connatix inline video-ad player. Its close
 * control is a custom element whose pointer-event handling is intercepted by sibling overlay
 * layers, so a normal mouse click - even Playwright's `force: true` - frequently reports
 * success without the player actually closing. Its internal handler only responds to a real
 * keyboard activation. Focusing the element and sending Enter is what reliably works.
 *
 * This is deliberately best-effort: the player does not always appear, and other elements can
 * intercept the focus() call transiently, so every failure mode here just returns false rather
 * than throwing. Nothing on finviz depends on the player being closed to keep working.
 */
export async function dismissAdOverlay(ctx: SiteActionContext | { page: Page }): Promise<boolean> {
  const page = ctx.page;
  const closeButton = page.locator("[part='inner-close-button']").first();
  if (!(await closeButton.count().catch(() => 0))) return false;
  try {
    await closeButton.focus({ timeout: 2000 });
    await page.keyboard.press("Enter");
    // Give the player's own close animation/teardown a moment before the caller reads the page.
    await page.waitForTimeout(300);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Table parsing
 * ------------------------------------------------------------------ */

// Each page.evaluate() callback below defines its own tiny `cellText(el)` helper. Playwright
// runs evaluate callbacks in the browser, so they cannot close over a Node-side function -
// only inline code survives the trip.
//
// Known caveat: cellText uses textContent, which also picks up a hidden decorative marker in
// screener/calendar ticker cells (the colored sector-icon fallback letter), so a ticker like
// "IONQ" can come back as "IIONQ" - a doubled first character. innerText would read the
// visible text correctly, but it depends on a layout pass that Chrome skips for a
// backgrounded/inactive tab, which made it return "" for every cell during testing - worse
// than the doubled-letter issue. If you need exact tickers, drop a duplicated leading
// character: `t.length > 1 && t[0] === t[1] ? t.slice(1) : t`.

/**
 * Headered table reader for finviz's screener, calendar (economic/earnings/dividends),
 * analyst-ratings, and insider-trades tables: one label row followed by data rows with the
 * same column count. Returns [] rather than throwing when the table is empty or missing - an
 * empty result on finviz is very often a real, correct answer (e.g. "no earnings on this
 * date"), not a failure.
 *
 * Deliberately scoped rather than "first <tr> = header, the rest = data": the screener and
 * calendar tables (the newer `.styled-table-new` widget) render an extra, non-`.styled-row`
 * <tr> inside <tbody> - almost certainly an internal sticky/frozen-header helper row - whose
 * innerText is the header labels glued to the first data row's values concatenated together.
 * Naive positional parsing (`rows[0]` header, `rows.slice(1)` data) silently ingests that row
 * as real data and corrupts the header mapping. Reading `thead` for labels and
 * `tbody tr.styled-row` for data sidesteps it entirely - both were verified independently
 * against the live site. Older, plainer tables (ratings, insiders) have no such row; they fall
 * back to `tbody tr`, which was verified clean for them.
 */
async function parseHeaderedTable(table: Locator): Promise<Record<string, string>[]> {
  const root = table.first();
  if (!(await root.count().catch(() => 0))) return [];

  // Locators, not page.evaluate()/querySelectorAll: the screener and calendar tables (the
  // newer `.styled-table-new` widget - the same design system as the ad player's
  // [part='inner-close-button']) render inside a shadow root. Playwright's locator engine
  // pierces shadow DOM automatically; the browser's native querySelectorAll does not, so an
  // evaluate()-based version of this function silently found zero rows on those tables while
  // working fine on the plain-DOM ratings/insiders tables. Locators work correctly on both.
  let headers = (await root.locator("thead th, thead td").allInnerTexts().catch(() => []));
  if (!headers.length) headers = await root.locator("tr").first().locator("th, td").allInnerTexts().catch(() => []);
  headers = headers.map((h) => h.trim() || "col");
  if (!headers.length) return [];

  let rows = root.locator("tbody tr.styled-row");
  if (!(await rows.count().catch(() => 0))) rows = root.locator("tbody tr");
  const rowCount = await rows.count().catch(() => 0);

  const records: Record<string, string>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const cells = (await rows.nth(i).locator("td").allInnerTexts().catch(() => [])).map((c) => c.trim());
    if (!cells.some(Boolean)) continue;
    const record: Record<string, string> = {};
    cells.forEach((value, j) => { record[headers[j] || `col${j}`] = value; });
    records.push(record);
  }
  return records;
}

/**
 * finviz's news widgets (ticker-page and /news.ashx home page) have no header row - every row
 * is directly a {time, headline link} record. The two widgets use different cell layouts
 * though: the ticker-page widget (#news-table) is a plain 2-cell [time, headline] row, while
 * the market news home page (/news.ashx) has an extra empty leading spacer cell, making it
 * [spacer, time, headline] - hence the configurable timeCellIndex, verified against both pages
 * directly rather than assumed. linkSelector narrows to the headline anchor within the row.
 */
async function parseNewsRows(
  page: Page, rowSelector: string, linkSelector: string, timeCellIndex: number,
): Promise<Array<{ time: string; headline: string; url: string }>> {
  // Locators, not page.evaluate()/querySelector - see parseHeaderedTable's note above. The
  // headline anchor inside a news row was not reliably found via a native querySelector
  // scoped to each row (empty results for some tickers, working for others); Playwright
  // locators removed the ambiguity, matching the fix already proven for the other tables.
  const rows = page.locator(rowSelector);
  const rowCount = await rows.count().catch(() => 0);
  const out: Array<{ time: string; headline: string; url: string }> = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const link = row.locator(linkSelector).first();
    if (!(await link.count().catch(() => 0))) continue;
    const cells = await row.locator("td").allInnerTexts().catch(() => []);
    const time = (cells[timeCellIndex] || "").trim();
    const headline = (await link.innerText().catch(() => "")).trim();
    const url = (await link.getAttribute("href").catch(() => null)) || "";
    if (headline) out.push({ time, headline, url });
  }
  return out;
}

/**
 * finviz's fundamentals table (table.snapshot-table2) is a label/value grid: every cell
 * alternates label, value, label, value, ... across each row. Not a list of records, so it
 * needs its own reader instead of parseHeaderedTable.
 */
async function parseFundamentals(table: Locator): Promise<Record<string, string>> {
  const root = table.first();
  if (!(await root.count().catch(() => 0))) return {};
  // Locators, not page.evaluate()/querySelectorAll - see parseHeaderedTable's note above.
  // This table isn't confirmed to be in a shadow root, but its cell count intermittently came
  // back empty via evaluate() (worked for one ticker, silently empty for another) while
  // Playwright's own locator read was reliable every time; matching the proven-safe pattern
  // here removes the ambiguity instead of leaving a flaky read in place.
  const cells = (await root.locator("td").allInnerTexts().catch(() => [])).map((c) => c.trim());
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < cells.length; i += 2) out[cells[i]] = cells[i + 1];
  return out;
}

/* ------------------------------------------------------------------ *
 * Navigation helpers
 * ------------------------------------------------------------------ */

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Actions (referenced by sites/finviz/site.yaml `implementation.export`)
 * ------------------------------------------------------------------ */

export const actions: SiteActionModule = {
  async dismiss_ad_overlay(ctx) {
    return dismissAdOverlay(ctx);
  },

  async get_stock_snapshot(ctx) {
    const ticker = String(ctx.input.ticker || "").trim();
    if (!ticker) throw new Error("get_stock_snapshot requires input.ticker, e.g. \"NVDA\"");
    await open(ctx.page, `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`);
    await dismissAdOverlay(ctx);
    const [tickerSymbol, companyName, price, change, fundamentals] = await Promise.all([
      ctx.extract("read_ticker_symbol"),
      ctx.extract("read_company_name"),
      ctx.extract("read_quote_price"),
      ctx.extract("read_quote_change"),
      parseFundamentals(await ctx.locator("fundamentals_table")),
    ]);
    return { ticker: tickerSymbol || ticker.toUpperCase(), companyName, price, change, fundamentals };
  },

  async get_stock_news(ctx) {
    // Reuses whatever ticker page is already open; navigate there first if you need a
    // specific ticker (e.g. via get_stock_price or get_stock_snapshot).
    await dismissAdOverlay(ctx);
    return parseNewsRows(ctx.page, "#news-table tr", "a.tab-link-news", 0);
  },

  async get_analyst_ratings(ctx) {
    await dismissAdOverlay(ctx);
    return parseHeaderedTable(await ctx.locator("analyst_ratings_table"));
  },

  async get_insider_trades(ctx) {
    await dismissAdOverlay(ctx);
    return parseHeaderedTable(await ctx.locator("insider_trades_table"));
  },

  async run_screener(ctx) {
    const filters = ctx.input.filters ? String(ctx.input.filters) : undefined;
    const order = ctx.input.order ? String(ctx.input.order) : undefined;
    const view = ctx.input.view ? String(ctx.input.view) : "111";
    await open(ctx.page, buildUrl("https://finviz.com/screener.ashx", { v: view, f: filters, o: order }));
    await dismissAdOverlay(ctx);
    return parseHeaderedTable(await ctx.locator("screener_table"));
  },

  async get_market_news(ctx) {
    await open(ctx.page, "https://finviz.com/news.ashx");
    await dismissAdOverlay(ctx);
    return parseNewsRows(ctx.page, "tr.news_table-row", "a.nn-tab-link", 1);
  },

  async get_earnings_calendar(ctx) {
    const date = ctx.input.date ? String(ctx.input.date) : undefined;
    await open(ctx.page, buildUrl("https://finviz.com/calendar/earnings", { dateFrom: date }));
    await dismissAdOverlay(ctx);
    // An empty result here commonly means "no earnings scheduled that day" - a real answer,
    // not a failure. Callers should not treat [] from this action as an error.
    return parseHeaderedTable(await ctx.locator("calendar_table"));
  },

  async get_dividends_calendar(ctx) {
    const date = ctx.input.date ? String(ctx.input.date) : undefined;
    await open(ctx.page, buildUrl("https://finviz.com/calendar/dividends", { dateFrom: date }));
    await dismissAdOverlay(ctx);
    return parseHeaderedTable(await ctx.locator("calendar_table"));
  },

  async get_economic_calendar(ctx) {
    const date = ctx.input.date ? String(ctx.input.date) : undefined;
    await open(ctx.page, buildUrl("https://finviz.com/calendar/economic", { dateFrom: date }));
    await dismissAdOverlay(ctx);
    return parseHeaderedTable(await ctx.locator("calendar_table"));
  },
};
