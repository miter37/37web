#!/usr/bin/env python3
"""X.com practice drill — SAFE MODE: fills composer with image+text, verifies Post is enabled,
then DISCARDS the draft. Never clicks Post. Run: python3 drill_x.py [--discard-asked]
"""
import asyncio, sys
sys.path.insert(0, "/home/doyoonkim/.agents/skills/37web/sites/scripts")
from cdp37 import CDP37

TEXT = "자동화 연습 드릴 — 발행되지 않습니다. (practice, do not publish)"
IMG = "/tmp/x_probe.png"

async def main():
    async with CDP37("x.com") as c:
        # 1. login check
        ok = await c.eval("!!document.querySelector('[data-testid=\"tweetTextarea_0\"]')")
        if not ok:
            await c.navigate("https://x.com/home")
            await asyncio.sleep(6)
            ok = await c.eval("!!document.querySelector('[data-testid=\"tweetTextarea_0\"]')")
        print("logged_in:", ok)

        # 2. focus composer + insert text via real input event path
        await c.eval("document.querySelector('[data-testid=\"tweetTextarea_0\"]').focus()")
        await c.insert_text(TEXT)
        await asyncio.sleep(1)
        dom_text = await c.eval("document.querySelector('[data-testid=\"tweetTextarea_0\"]').innerText")
        print("text_in_dom:", repr(dom_text)[:80], "match:", TEXT in (dom_text or ""))

        # 3. attach image via fresh backendNodeId
        nid = await c.set_files([IMG])
        print("file_input nodeId:", nid)
        await asyncio.sleep(4)
        media = await c.eval("!!document.querySelector('[data-testid=\"toast\"],[data-testid=\"addedImage\"],img[alt=\"\"]')")
        rm = await c.eval("!!document.querySelector('[data-testid=\"removeAttachment\"],[aria-label=\"Remove media\"]')")
        print("media_loaded:", media or rm)

        # 4. post button enabled? (DO NOT CLICK)
        dis = await c.eval("""(() => {
            const b = document.querySelector('[data-testid=\"tweetButtonInline\"]')
                   || document.querySelector('[data-testid=\"tweetButton\"]');
            return b ? (b.closest('[role=\"button\"]')?.disabled ?? b.disabled) : 'no-button';
        })()""")
        print("post_button_disabled:", dis)

        # 5. clear composer: select-all + delete, then check "Save post?" dialog -> Discard
        await c.eval("document.querySelector('[data-testid=\"tweetTextarea_0\"]').focus()")
        for k in (("a", "Meta")):
            await c.call("Input.dispatchKeyEvent", type="keyDown", modifiers=2,
                         key="a", code="KeyA", windowsVirtualKeyCode=65)
            await c.call("Input.dispatchKeyEvent", type="keyUp", modifiers=2,
                         key="a", code="KeyA", windowsVirtualKeyCode=65)
        await c.call("Input.dispatchKeyEvent", type="keyDown", key="Delete",
                     code="Delete", windowsVirtualKeyCode=46)
        await c.call("Input.dispatchKeyEvent", type="keyUp", key="Delete",
                     code="Delete", windowsVirtualKeyCode=46)
        await asyncio.sleep(1)
        # remove image if still attached
        await c.eval("""(() => {
            const btns=[...document.querySelectorAll('[data-testid=\"removeAttachment\"],[aria-label=\"Remove media\"]')];
            btns.forEach(b=>b.click()); return btns.length;
        })()""")
        # navigate away -> triggers 'Save post?' dialog; click Discard ( 폐기 )
        await c.navigate("https://x.com/home")
        await asyncio.sleep(3)
        discarded = await c.eval("""(() => {
            const d=[...document.querySelectorAll('[data-testid=\"confirmationSheetCancel\"],[role=\"button\"],[role=\"menuitem\"]')]
                .filter(e=>/Discard|폐기/i.test(e.textContent||''));
            if(d.length){d[0].click();return d[0].textContent.trim();} return null;
        })()""")
        print("discarded_via:", discarded)
        left = await c.eval("document.querySelector('[data-testid=\"tweetTextarea_0\"]')?.innerText||''")
        print("composer_now:", repr(left)[:60])

asyncio.run(main())
