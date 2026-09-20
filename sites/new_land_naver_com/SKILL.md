---
name: adaptive-web-agent-new_land_naver_com
description: Site-specific knowledge and operational quirks for new.land.naver.com, maintained by Adaptive Web Agent.
version: 0.2.0
metadata:
  hermes:
    tags: [browser, site-specific, adaptive-web-agent, naver-land]
    category: automation
---

# new.land.naver.com Site Skill Knowledge

## Known Quirks & Proven Solutions

### 1. Complex Detail View Dismissal on Map Click
- **Quirk**: Clicking on the background map canvas (`#region_map`, coordinates `(x, y)`) dismisses the currently open complex detail panel and resets the URL back to generic complexes view.
- **Solution**: To close the trade or area filter popup layers, **never click the map**. Instead, **click the filter button itself again (`re-toggle`)** or the dedicated close button (`.btn_close_panel`).

### 2. Physical Events vs Synthetic Click
- **Quirk**: Synthetic DOM `.click()` on custom checkbox labels (e.g. `label[for="address_group2"]` for `동일매물 묶기`) can timeout or fail to trigger Vue/React state updates.
- **Solution**: Query the element via CDP/in-page evaluation and check `.checked` state, or dispatch physical pointer events.

### 3. List structure, item clicks & deduplication
- **Quirk**: The article list is `.item_list--article > .infinite_scroll > .item` DIVs (~20 rendered, virtualized) — NOT `li`; `li` locators time out and synthetic `.click()` on items does nothing.
- **Solution**: Physical bounding-box mouse click (Playwright `page.mouse.click` at item center) → URL gains `&articleNo=` and the detail panel renders `a.complex_link` tabs (단지정보 / 시세실거래가 / 동호수공시가격). Multiple agents post the same unit; dedupe by `${dong}_${area}_${floor}_${price}`.

### 4. Real Transaction Price (실거래가) extraction — navigation trap
- The 시세 `a.complex_link` exists ONLY inside a selected-complex detail panel. Clicking it without one (generic text search) navigates AWAY to the map list view. Correct chain: physical-click an item → click its panel's 시세 complex_link → in-panel 실거래가 text-click → fires `/api/complexes/{no}/prices`, `prices/real`, `buildings/{pyeongtype|landprice}` (+`dongNo` from `buildings/list`). Then replay `prices/real?tradeType=A1|B1|B2&areaNo=<numeric>&type=table&page=N`: `realPriceOnMonthList[].realPriceList[]` = dealPrice(매매)/leasePrice(전세)/rentPrice(월세; dealPrice=0 on B1/B2), floor, date. Panel area tabs = numeric `areaNo` = the complex's `input[id^=housesize]` values (per-complex; never hardcode). Full API map: `naver-land-search` skill references/api-replay.md.

## Reusable Deterministic Scripts
- **Complex Filter & Scraper**: [`sites/new_land_naver_com/scripts/filter-complex.mjs`](file:///home/doyoonkim/.agents/skills/37web/sites/new_land_naver_com/scripts/filter-complex.mjs)
  ```bash
  node sites/new_land_naver_com/scripts/filter-complex.mjs --complex <COMPLEX_ID> --trade 매매 --areas "<AREA1,AREA2>"
  ```

## Auto-learned capabilities

- `get_item_list_list_contents_item_area`: reusable read action backed by extractor `read_item_list_list_contents_item_area` (auto-learned from a verified discovery extraction).
- `get_complex_title_title_h2_h3`: reusable read action backed by extractor `read_complex_title_title_h2_h3` (auto-learned from a verified discovery extraction).
- `get_body`: reusable read action backed by extractor `read_body` (auto-learned from a verified discovery extraction).
- `get_a_item_link`: reusable read action backed by extractor `read_a_item_link` (auto-learned from a verified discovery extraction).
- `get_infinite_scroll_item`: reusable read action backed by extractor `read_infinite_scroll_item` (auto-learned from a verified discovery extraction).
