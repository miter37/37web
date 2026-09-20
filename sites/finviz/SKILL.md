---
name: adaptive-web-agent-finviz
description: Site-specific knowledge for finviz.com, generated and maintained by Adaptive Web Agent.
version: 0.1.0
metadata:
  hermes:
    tags: [browser, site-specific, adaptive-web-agent, finance]
    category: automation
---

# finviz.com Site Skill

Read this before working on finviz. It covers what's actually needed to succeed quickly - not
every page on the site. `site.yaml`/`actions.ts` cover stock quotes, the screener, market/ticker
news, and the three calendar sections (earnings/dividends/economic). Groups, Futures, Forex,
Crypto, and Portfolio are intentionally not encoded - use Discovery Mode if you need them.

## Use the encoded actions first

```bash
webctl run get_stock_price      --session $S --site finviz --input '{"ticker":"NVDA"}'
webctl run get_stock_snapshot   --session $S --site finviz --input '{"ticker":"NVDA"}'
webctl run get_stock_news       --session $S --site finviz   # needs a quote page already open
webctl run get_analyst_ratings  --session $S --site finviz   # needs a quote page already open
webctl run get_insider_trades   --session $S --site finviz   # needs a quote page already open
webctl run run_screener         --session $S --site finviz --input '{"filters":"cap_large,sec_technology","order":"-change"}'
webctl run get_market_news      --session $S --site finviz
webctl run get_earnings_calendar   --session $S --site finviz --input '{"date":"2026-09-17"}'
webctl run get_dividends_calendar  --session $S --site finviz
webctl run get_economic_calendar   --session $S --site finviz
```

`get_stock_snapshot` is usually the right first call for a ticker: one action gets price,
change, company name, and the full fundamentals grid together. Ratings/insiders/news need a
quote page already open (call `get_stock_price` or `get_stock_snapshot` first).

`run_screener`/calendar actions take optional input; omit it for finviz's own defaults (full
screener, current week).

## Three things that will trip you up

1. **`webctl goto` reports `network: "busy"` on almost every finviz page. That is normal, not a
   failure.** finviz keeps loading ads/trackers indefinitely, so the network never truly goes
   idle. Don't retry or treat it as an error - the page is fully usable.

2. **An empty array from a calendar action is often the correct answer, not a bug.** Many days
   have zero earnings/dividends. Only worry if `get_earnings_calendar` etc. throws or the site
   otherwise looks broken.

3. **The video-ad player's close button does not respond to a mouse click, even `--force`.**
   It's a Connatix custom element whose handler only reacts to a real keyboard Enter after
   focus. If you're doing manual Discovery instead of using the encoded actions (which already
   call `dismiss_ad_overlay` for you):
   ```bash
   webctl press --session $S --css "[part='inner-close-button']" --key Enter
   ```
   A mouse `click`/`click --force` will often report success without actually closing it -
   verify with a screenshot before trusting it.

## If you extend this site's knowledge

- The screener and calendar tables render inside a **shadow root** (same component family as
  the ad player). Read them with Playwright **locators** (`.locator(...).allInnerTexts()`),
  never `page.evaluate()` + `querySelectorAll` - the native DOM query can't see inside a shadow
  root and will silently return nothing. `actions.ts`'s `parseHeaderedTable` already does this
  correctly; reuse it for any new table-shaped action instead of writing a new parser.
- Ticker news (`#news-table`, on the quote page) and market news (`tr.news_table-row`, on
  `/news.ashx`) look similar but have different cell layouts (2 cells vs. 3, with a leading
  spacer cell). Don't assume one's structure for the other - `parseNewsRows` already handles
  both, parameterized by which page you're on.
- `dismiss_ad_overlay` intentionally never promotes past `encoded`: "no player was open" is a
  correct, common outcome, not a verifiable postcondition. Don't force a `verify:` onto it.
