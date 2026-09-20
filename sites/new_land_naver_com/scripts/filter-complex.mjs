/**
 * Robust Naver Real Estate Complex Filter & Scraper Script
 */

import playwright from "playwright";

const args = process.argv.slice(2);
function getArg(name, def = "") {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const complexId = getArg("complex", "22627");
const tradeTarget = getArg("trade", "매매");
const areasTarget = getArg("areas", "109B,109A,111C").split(",").map(s => s.trim());
const cdpPort = getArg("port", "9223");

async function run() {
  const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const ctx = browser.contexts()[0] || await browser.newContext();
  let page = ctx.pages().find(p => p.url().includes("new.land.naver.com"));
  if (!page) page = await ctx.newPage();
  await page.bringToFront();

  // Navigate if needed
  if (!page.url().includes(`complexes/${complexId}`)) {
    console.log(`Navigating to complex ${complexId}...`);
    await page.goto(`https://new.land.naver.com/complexes/${complexId}?ms=37.5135,127.0825,17&a=APT:ABYG:JGC&e=RETAIL`, {
      waitUntil: "networkidle"
    });
    await page.waitForTimeout(2000);
  }

  // 1. 거래방식: 매매
  console.log(`[1] Setting 거래방식 -> ${tradeTarget}`);
  const tradeBtn = (await page.$$("button.list_filter_btn"))[0];
  if (tradeBtn) {
    const text = await tradeBtn.innerText();
    if (!text.includes(tradeTarget)) {
      await tradeBtn.click();
      await page.waitForTimeout(400);

      // In the dropdown layer, click label containing tradeTarget
      const clicked = await page.evaluate((target) => {
        // Find visible layer
        const labels = Array.from(document.querySelectorAll(".filter_popup label, .area_layer label, .layer_area label, label"));
        const match = labels.find(l => l.innerText.trim() === target);
        if (match) {
          match.click();
          return true;
        }
        return false;
      }, tradeTarget);

      console.log(`Clicked ${tradeTarget} label:`, clicked);
      await page.waitForTimeout(300);
      await tradeBtn.click(); // Close panel
      await page.waitForTimeout(500);
    }
  }

  // 2. 면적 설정
  console.log(`[2] Setting 면적 -> ${areasTarget.join(", ")}`);
  const areaBtn = (await page.$$("button.list_filter_btn"))[1];
  if (areaBtn) {
    await areaBtn.click();
    await page.waitForTimeout(400);

    const checkedAreas = await page.evaluate((targets) => {
      const labels = Array.from(document.querySelectorAll(".filter_popup label, .area_layer label, .layer_area label, label"));
      const toggled = [];
      for (const t of targets) {
        const found = labels.find(l => l.innerText.includes(t));
        if (found) {
          const forId = found.getAttribute("for");
          const input = forId ? document.getElementById(forId) : null;
          if (input && !input.checked) {
            found.click();
            toggled.push(t);
          } else if (!input) {
            found.click();
            toggled.push(t);
          }
        }
      }
      return toggled;
    }, areasTarget);

    console.log("Checked areas:", checkedAreas);
    await page.waitForTimeout(300);
    await areaBtn.click(); // Close panel
    await page.waitForTimeout(500);
  }

  // 3. 동일매물 묶기
  console.log(`[3] Setting 동일매물 묶기`);
  const dongilChecked = await page.evaluate(() => {
    const input = document.querySelector("#address_group2, input[data-nclk=\"TAA.dongil\"]");
    const label = document.querySelector("label[for=\"address_group2\"]");
    if (input && !input.checked && label) {
      label.click();
      return true;
    }
    return input ? input.checked : false;
  });
  console.log("동일매물 묶기 is checked:", dongilChecked);
  await page.waitForTimeout(500);

  // 4. Verify Filters
  const state = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".list_filter_btn")).map(b => b.innerText.trim());
    return btns;
  });
  console.log("Final applied filters:", state);

  // 5. Scroll and Extract Listings
  console.log("[4] Scrolling to load all filtered listings...");
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const el = document.querySelector(".item_list--article, .item_list");
      if (el) el.scrollTop += 3000;
    });
    await page.waitForTimeout(300);
  }

  const listings = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".item"));
    const seen = new Set();
    const list = [];

    for (const c of cards) {
      const text = c.innerText.trim();
      if (!text.includes("매매") || seen.has(text)) continue;
      seen.add(text);

      const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
      const dongMatch = text.match(/([0-9]+동)/);
      const dong = dongMatch ? dongMatch[0] : "";
      const priceMatch = text.match(/매매\s*([0-9억\s,~]+)/);
      const price = priceMatch ? priceMatch[1].trim() : "";
      const areaMatch = text.match(/([0-9]+[A-Z]?)\/([0-9]+m²)/) || text.match(/([0-9]+[A-Z]?m²)/);
      const area = areaMatch ? areaMatch[0] : "";
      const floorMatch = text.match(/([0-9]+|고|중|저)\/([0-9]+층)/);
      const floor = floorMatch ? floorMatch[0] : "";
      const dirMatch = text.match(/(남동향|남서향|남향|동향|서향|북향)/);
      const direction = dirMatch ? dirMatch[0] : "";
      const rm = text.match(/중개사\s*([0-9]+곳)/);
      const realtorCount = rm ? rm[1] : "1곳";

      let desc = "";
      for (const line of lines) {
        if (line.length > 6 && !line.includes("아파트") && !line.includes("집주인") && !line.includes("확인매물") && !line.includes("중개사") && !line.includes("매매") && !line.includes("부동산")) {
          desc = line;
          break;
        }
      }

      if (price) {
        list.push({
          dong,
          price,
          area,
          floor,
          direction,
          realtorCount,
          desc
        });
      }
    }
    return list;
  });

  const parsePrice = (p) => {
    let sum = 0;
    const uk = p.match(/([0-9]+)억/);
    if (uk) sum += parseInt(uk[1]) * 10000;
    const man = p.match(/억\s*([0-9,]+)/) || p.match(/^([0-9,]+)$/);
    if (man && man[1]) sum += parseInt(man[1].replace(/,/g, ""));
    return sum;
  };

  listings.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));

  console.log(`TOTAL_LISTINGS: ${listings.length}`);
  console.log("RESULT_START");
  console.log(JSON.stringify(listings, null, 2));
  console.log("RESULT_END");

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
