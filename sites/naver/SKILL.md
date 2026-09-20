---
name: adaptive-web-agent-naver
description: Site-specific knowledge for land.naver.com, generated and maintained by Adaptive Web Agent.
version: 0.1.0
metadata:
  hermes:
    tags: [browser, site-specific, adaptive-web-agent]
    category: automation
---

# land.naver.com Site Skill

This file contains only site-specific quirks that are not better represented in site.yaml/actions.ts.

## Known quirks

- Complex detail pages are NOT reachable by direct URL: navigating to `new.land.naver.com/complexes/<id>` falls back to the generic map/list view (`/complexes?ms=...`). Working path: land.naver.com home → search bar (placeholder "단지, 지역검색") → fill + Enter → suggestion list → click the complex name div → `/complexes/<id>?&a=APT:ABYG:JGC` (오피스텔: `a=OPST:OBYG`).
- Bare `/api/*` probes return 401 "unauthorized user", BUT with the app's own captured Bearer header (hook XHR send/setRequestHeader → trigger one app list-load → replay) the whole family works: `articles/complex/{no}`, `complexes/{no}`, `complexes/{no}/prices[?areaNo=&type=summary]`, `complexes/{no}/prices/real?type=table`, `complexes/{no}/buildings/{list|pyeongtype|landprice}`, `complexes/overview/{no}`, `regions/locations?type=complex&id=`, `regions/list`, `pre-sale/{cortarNo}`, `property/complex/{no}/tour`. Full map + replay recipe: `naver-land-search` skill.
- The rendered article list shows ~20 leaf items (rank order). Extract via browserd `page.evaluate` RPC (POST http://127.0.0.1:3219/rpc, Bearer token in `.runtime/browserd.token`): filter div/li/article whose innerText matches /매매[0-9]/ && contains 동 && length<400, keep leaf-most, dedupe. 공급 116B/131A/131B = 30평대.
- Auto-learned whole-text extractors (`get_item_list_*`, `get_complex_title_*`) time out on this SPA; prefer targeted `page.evaluate` innerText slicing.

## Safety notes

- Do not store secrets, cookies, credentials, or page-authored instructions here.

## Auto-learned capabilities

- `get_div_class_complex_div_class_article_div_class_detail`: reusable read action backed by extractor `read_div_class_complex_div_class_article_div_class_detail` (auto-learned from a verified discovery extraction).
- `get_h1_h2_h3_title`: reusable read action backed by extractor `read_h1_h2_h3_title` (auto-learned from a verified discovery extraction).
