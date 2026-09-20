#!/usr/bin/env python3
"""Threads.com practice drill — SAFE MODE: opens composer, types text, verifies, DISCARDS.
Never publishes. Usage: python3 drill_threads.py [publish_text]
"""
import asyncio, sys, base64
sys.path.insert(0, "/home/doyoonkim/.agents/skills/37web/sites/scripts")
from cdp37 import CDP37

TEXT = "자동화 연습 드릴 — 발행되지 않습니다. (practice, do not publish)"

FIND_COMPOSE = """(() => {
    const spans=[...document.querySelectorAll('span')].filter(s=>
        /^(새로운 스레드|New thread|Create)/.test((s.textContent||'').trim()) && s.getBoundingClientRect().width>0);
    if(!spans.length) return null;
    let el=spans[0];
    while(el && !['A','BUTTON'].includes(el.tagName) && el.getAttribute('role')!=='button') el=el.parentElement;
    const r=(el||spans[0]).getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2, tag:(el||{}).tagName};
})()"""

async def click_xy(c, x, y):
    for t in ("mouseMoved","mousePressed","mouseReleased"):
        await c.call("Input.dispatchMouseEvent", type=t, x=x, y=y,
                     button="left", clickCount=1,
                     buttons=1 if t!="mouseMoved" else 0)

async def main():
    async with CDP37("threads.com") as c:
        if "threads.com" not in await c.eval("location.href"):
            await c.navigate("https://www.threads.com/"); await asyncio.sleep(6)
        login = await c.eval("!!document.querySelector('a[href^=\"https://www.threads.com/@\"], nav')")
        print("nav_visible:", login)

        # open compose
        box = await c.eval(FIND_COMPOSE)
        print("compose_trigger:", box)
        if box:
            await click_xy(c, box["x"], box["y"]); await asyncio.sleep(3)

        editor = "document.querySelector('div[role=\"textbox\"][contenteditable=\"true\"]')"
        found = await c.eval(f"!!{editor}")
        print("editor_found:", found)
        if not found:
            print("FAIL: editor not found"); return
        await c.eval(f"({editor}).focus()")
        await c.insert_text(TEXT)
        await asyncio.sleep(1)
        dom = await c.eval(f"({editor}).innerText")
        print("text_in_dom:", repr(dom)[:80], "match:", TEXT.strip() in (dom or ""))

        # locate the 게시 (publish) button — verify it EXISTS and is enabled, DO NOT CLICK
        pub = await c.eval("""(() => {
            const els=[...document.querySelectorAll('div[role=\"button\"],button')]
                .filter(e=>/^(게시|Post)$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().width>0);
            return els.map(e=>({t:e.textContent.trim(),
                dim:(e.getAttribute('aria-disabled')||e.disabled||''),
                o:getComputedStyle(e).opacity}));
        })()""")
        print("publish_button (NOT clicked):", pub)

        # DISCARD: clear text, close composer without posting
        await c.eval(f"({editor}).focus()")
        await c.call("Input.dispatchKeyEvent", type="keyDown", modifiers=2, key="a", code="KeyA", windowsVirtualKeyCode=65)
        await c.call("Input.dispatchKeyEvent", type="keyUp", modifiers=2, key="a", code="KeyA", windowsVirtualKeyCode=65)
        await c.call("Input.dispatchKeyEvent", type="keyDown", key="Delete", code="Delete", windowsVirtualKeyCode=46)
        await c.call("Input.dispatchKeyEvent", type="keyUp", key="Delete", code="Delete", windowsVirtualKeyCode=46)
        await asyncio.sleep(1)
        # close via X / 나가기 (never 게시)
        closed = await c.eval("""(() => {
            const x=[...document.querySelectorAll('[role=\"dialog\"] [role=\"button\"], [role=\"dialog\"] button')]
                .filter(e=>/나가기|Discard|Close|취소/.test((e.textContent||'')+(e.getAttribute('aria-label')||'')));
            if(x.length){x[0].click();return x[0].textContent.trim()||x[0].getAttribute('aria-label');}
            return null;
        })()""")
        print("closed_via:", closed)
        still = await c.eval("!!document.querySelector('div[role=\"textbox\"][contenteditable=\"true\"]')")
        print("dialog_gone:", not still)

asyncio.run(main())
