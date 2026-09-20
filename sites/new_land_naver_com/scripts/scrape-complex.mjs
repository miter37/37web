#!/usr/bin/env node
/**
 * Naver Real Estate (new.land.naver.com) complex listing scraper.
 *
 * WHY: direct /complexes/{id} navigation redirects away; raw fetch to the data
 * API returns {"error":"unauthorized user"} (the Bearer token lives in app
 * memory only). HOW: arrive via home search box (synthetic events on the React
 * search input do NOT fire its onChange — use real Playwright type+press),
 * click the suggestion row by JS, then hook XHR.setRequestHeader to capture the
 * auth header of the app's own /api/articles/complex call (triggered by
 * toggling the CHECKED trade checkbox off/on), then replay with our overrides.
 * 20/page JSON, paging via isMoreData. NOTE: never call browser.close() on a
 * connectOverCDP browser and exit explicitly.
 * 2026-09 addendum: evaluate(HOOK) only after `waitForFunction(() => /complexes\/\d+/.test(location.href))`
 * — evaluating during the SPA URL handoff throws "Execution context was destroyed". Listing items are
 * DIVs (`.infinite_scroll .item`), never `li`; item detail opens via physical bounding-box mouse clicks.
 * The 시세/실거래가 price API family needs that item-click → a.complex_link chain (see naver-land-search skill).
 *
 * Usage: node scrape-complex.mjs --cdp http://127.0.0.1:9223 --name "<exact 단지명>"
 *   [--trade A1,B1,B2] [--areaNos 2:3] [--order rank] [--sameAddressGroup true] [--out f.json]
 * tradeType: A1=매매 B1=전세 B2=월세. areaNos = houseSizeNo codes COLON-joined, per-단지.
 * 월세: dealOrWarrantPrc=보증금 + rentPrc=월세(만원 문자열).
 */
import playwright from "playwright";
import fs from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 ? argv[i + 1] : d; };
const CDP = arg("cdp", "http://127.0.0.1:9223");
const COMPLEX_NAME = arg("name", "");
const TRADES = (arg("trade", "A1,B1,B2")).split(",");
const AREA_NOS = arg("areaNos", "");
const ORDER = arg("order", "rank");
const GROUP = arg("sameAddressGroup", "true");
const OUT = arg("out", "");
const LIST_ONLY = argv.includes("--list-rows");

const HOOK = () => {
  if (window.__h9x) return;
  window.__h9x = 1; window.__tplU = null;
  const o = XMLHttpRequest.prototype.open;
  const ss = XMLHttpRequest.prototype.setRequestHeader;
  const sd = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__x = u; this.__xh = {}; return o.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { this.__xh[k] = v; } catch (e) {} return ss.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    try { if (/\/api\/articles\/complex/.test(this.__x)) window.__tplU = { u: this.__x, h: this.__xh }; } catch (e) {}
    return sd.apply(this, arguments);
  };
  window.__replay = (over) => new Promise((res) => {
    if (!window.__tplU) return res("NO-TPL");
    const u = new URL(window.__tplU.u, location.origin);
    for (const k in (over || {})) u.searchParams.set(k, over[k]);
    const x = new XMLHttpRequest();
    x.open("GET", u.pathname + u.search);
    for (const k in window.__tplU.h) { try { x.setRequestHeader(k, window.__tplU.h[k]); } catch (e) {} }
    x.onload = () => res(x.responseText);
    x.onerror = () => res("ERR");
    x.send();
  });
};

async function main() {
  if (!COMPLEX_NAME) throw new Error("--name <exact 단지명> required");
  const browser = await playwright.chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("https://land.naver.com/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button,a,span")].find((x) => (x.innerText || "").trim() === "다시 보지 않기" && x.offsetParent);
      b && b.click();
    });
    const box = page.locator('input[placeholder*="지역검색"]').first();
    await box.click({ timeout: 10000 });
    await box.fill("");
    await box.type(COMPLEX_NAME, { delay: 40 });   // React needs keystroke-level events
    await box.press("Enter");
    // some names trigger a direct redirect (single match) instead of the suggestion page
    try { await page.waitForURL(/complexes\/(\d+)/, { timeout: 3000, waitUntil: "commit" }); } catch (e) {}
    if (/complexes\/\d+/.test(page.url())) {
      const url = page.url();
      console.error("direct-navigate path taken for", COMPLEX_NAME);
    } else {
      await page.waitForURL(/new\.land\.naver\.com\/search/, { timeout: 20000, waitUntil: "commit" });
      await page.waitForTimeout(800);
    }
    // wait for suggestion rows, then click the best match
    let clicked = /complexes\/\d+/.test(page.url());
    for (let t = 0; t < 6 && !clicked; t++) {
      clicked = await page.evaluate((nm) => {
        const rows = [...document.querySelectorAll("a.item_link")];
        const a = rows.find((x) => (x.innerText || "").trim().startsWith(nm)) ||
                  rows.find((x) => (x.innerText || "").includes(nm));
        if (!a) return false;
        a.click(); return true;
      }, COMPLEX_NAME);
      if (!clicked) await page.waitForTimeout(500);
    }
    if (!clicked || LIST_ONLY) {
      const rows = await page.evaluate(() => JSON.stringify(
        [...document.querySelectorAll("a.item_link")].slice(0, 10).map((x) => (x.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70))));
      console.error("ROWS:", rows);
      if (!clicked) {
      // complex names are indexed without brand prefixes (e.g. 래미안헬리오시티 -> 헬리오시티)
      const BRANDING = /^(래미안|e편한세상|힐스테이트|자이|푸르지오|더샵|디에이치|롯데캐슬|아이파크|한화꿈에그린|중흥s-클래스|중흥S-클래스|반도유보라|호반베르디움|sk뷰|SK VIEW|예미지|두산위브|코아루|우미린|효성해링턴|de탄)/;
      let alt = COMPLEX_NAME;
      while (BRANDING.test(alt) && alt.length > 3) {
        alt = alt.replace(BRANDING, "");
        await box.fill("");
        await box.type(alt, { delay: 40 });
        await box.press("Enter");
        await page.waitForTimeout(1500);
        clicked = await page.evaluate((nm) => {
          const rows = [...document.querySelectorAll("a.item_link")];
          const a = rows.find((x) => (x.innerText || "").trim().startsWith(nm)) ||
                    rows.find((x) => (x.innerText || "").includes(nm));
          if (!a) return false;
          a.click(); return true;
        }, alt);
        if (clicked) { console.error("brand-stripped match:", alt); break; }
      }
    }
    if (!clicked) throw new Error("search result row not found for " + COMPLEX_NAME);
    }

    await page.waitForURL(/complexes\/(\d+)/, { timeout: 20000, waitUntil: "commit" }).catch(() => {});
    const url = page.url();
    const complexId = (url.match(/complexes\/(\d+)/) || [])[1] || "unknown";
    await page.waitForTimeout(2500);
    await page.evaluate(HOOK);

    const hasTpl = () => page.evaluate(() => !!(window.__tplU && /\/api\/articles\/complex/.test(window.__tplU.u)));
    if (!(await hasTpl())) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button.list_filter_btn")].find((x) => x.getAttribute("aria-label") === "거래방식");
        b && b.click();
      });
      await page.waitForTimeout(500);
      const cur = await page.evaluate(() => {
        const i = [...document.querySelectorAll("input[name=trad]")].find((x) => x.checked && x.value !== "ALL");
        if (i) { (i.closest("label") || i).click(); return i.value; }
        return null;
      });
      await page.waitForTimeout(1500);
      if (!(await hasTpl()) && cur) {
        await page.evaluate((v) => {
          const i = [...document.querySelectorAll("input[name=trad]")].find((x) => x.value === v);
          (i.closest("label") || i).click();
        }, cur);
        await page.waitForTimeout(1500);
      }
      if (!(await hasTpl())) {
        await page.evaluate(() => { const a = [...document.querySelectorAll(".sorting_type")].find((x) => /최신/.test(x.innerText)); a && a.click(); });
        await page.waitForTimeout(2000);
      }
      if (!(await hasTpl())) throw new Error("could not capture /api/articles/complex XHR template");
    }

    const result = {};
    for (const tr of TRADES) {
      let all = [];
      for (let p = 1; p <= 100; p++) {
        const over = { tradeType: tr, page: String(p), order: ORDER, sameAddressGroup: GROUP };
        if (AREA_NOS) over.areaNos = AREA_NOS;
        const raw = await page.evaluate((o) => window.__replay(o), over);
        let j; try { j = JSON.parse(raw); } catch (e) { console.error(tr, "bad json:", String(raw).slice(0, 80)); break; }
        if (!j.articleList) { console.error(tr, "api error:", j.error || j.message); break; }
        all = all.concat(j.articleList);
        if (!j.isMoreData || j.articleList.length === 0) break;
      }
      result[tr] = all;
      console.error(`${tr}: ${all.length} listings`);
    }
    const json = JSON.stringify({ complexId, name: COMPLEX_NAME, pageUrl: url, asOf: new Date().toISOString(), listings: result }, null, 1);
    if (OUT) { fs.writeFileSync(OUT, json); console.error("wrote", OUT, "complex", complexId); }
    else console.log(json);
    await page.close().catch(() => {});
    process.exit(0); // CDP transport keep-alive would otherwise hang the process
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
