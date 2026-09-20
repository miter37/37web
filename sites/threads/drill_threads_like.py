#!/usr/bin/env python3
"""Threads like drill — toggles like ON then OFF on first feed post (net zero).
Like buttons are aria-labels like '좋아요379' / '좋아요 취소379' — NOT svg titles.
Usage: python3 drill_threads_like.py
"""
import asyncio, sys
sys.path.insert(0, "/home/doyoonkim/.agents/skills/37web/sites/scripts")
from cdp37 import CDP37

FIND = r"""(() => {
    const b=[...document.querySelectorAll('[role=button],button')]
        .filter(e=>/^좋아요/.test((e.getAttribute('aria-label')||e.textContent||'').trim())
               && e.getBoundingClientRect().width>0
               && e.getBoundingClientRect().top>0);
    if(!b.length) return null;
    b[0].scrollIntoView({block:'center'});
    const r=b[0].getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2, label:(b[0].getAttribute('aria-label')||b[0].textContent).trim()};
})()"""

async def click_xy(c, x, y):
    for t in ("mouseMoved","mousePressed","mouseReleased"):
        await c.call("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left", clickCount=1,
                     buttons=1 if t!="mouseMoved" else 0)

async def main():
    async with CDP37("threads.com") as c:
        href = await c.eval("location.href")
        if not href.rstrip('/').endswith('threads.com'):
            await c.navigate("https://www.threads.com/"); await asyncio.sleep(6)
        box = await c.eval(FIND)
        print("like_button:", box)
        if not box: print("FAIL"); return
        await click_xy(c, box["x"], box["y"]); await asyncio.sleep(2)
        b2 = await c.eval(FIND)
        print("after_click1:", b2)
        liked = "취소" in (b2.get("label","") if b2 else "")
        if liked:
            await click_xy(c, b2["x"], b2["y"]); await asyncio.sleep(2)
            b3 = await c.eval(FIND)
            print("final:", b3, "OK (net zero)" if "취소" not in (b3 or {}).get("label","") else "CHECK")
        else:
            print("WARN: first click did not produce 취소 label — stopping, no blind retries")

asyncio.run(main())
