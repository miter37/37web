#!/usr/bin/env python3
"""Instagram create-flow drill — SAFE MODE: opens create modal, uploads image via synthetic
DataTransfer drop, walks crop+edit screens, fills caption, verifies 공유하기 (Share) is
enabled, then ABORTS (never clicks Share). Usage: python3 drill_instagram.py [image_path]
"""
import asyncio, sys, base64
sys.path.insert(0, "/home/doyoonkim/.agents/skills/37web/sites/scripts")
from cdp37 import CDP37

TEXT = "자동화 연습 드릴 — 발행되지 않습니다."
IMG = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ig_probe.png"

async def click_xy(c, x, y):
    for t in ("mouseMoved","mousePressed","mouseReleased"):
        await c.call("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left", clickCount=1,
                     buttons=1 if t!="mouseMoved" else 0)

async def find_and_box(c, js_expr):
    return await c.eval(js_expr)

NEXT_BTN = r"""(() => {
    const b=[...document.querySelectorAll('[role=dialog] div[role=button], [role=dialog] button')]
        .filter(e=>/^(다음|Next)$/.test((e.textContent||'').trim()));
    if(!b.length) return null;
    const r=b[b.length-1].getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2};
})()"""

async def main():
    b64 = base64.b64encode(open(IMG,'rb').read()).decode()
    async with CDP37("instagram.com") as c:
        if "instagram.com" not in await c.eval("location.href"):
            await c.navigate("https://www.instagram.com/"); await asyncio.sleep(6)
        assert not await c.eval("!!document.querySelector('input[name=\"username\"]')"), "LOGGED OUT"

        # 1. open create modal via aria-label
        trig = await c.eval(r"""(() => {
            const el=[...document.querySelectorAll('[aria-label]')]
                .find(e=>/새로운 게시물|Create post|Create/i.test(e.getAttribute('aria-label')));
            if(!el) return null;
            let t=el; while(t && t.getAttribute('role')!=='button' && !['BUTTON','A','DIV','I'].includes(t.tagName)) t=t.parentElement;
            const r=(t||el).getBoundingClientRect();
            return {x:r.x+r.width/2,y:r.y+r.height/2,label:el.getAttribute('aria-label')};
        })()""")
        print("create_trigger:", trig)
        assert trig, "no create button"
        await click_xy(c, trig["x"], trig["y"]); await asyncio.sleep(4)

        # 2. synthetic DataTransfer drop (setFileInputFiles is ignored by IG's dropzone)
        res = await c.eval("""(() => {
            const bin=atob('%s'); const bytes=new Uint8Array(bin.length);
            for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
            const file=new File([bytes],'upload.png',{type:'image/png'});
            const dt=new DataTransfer(); dt.items.add(file);
            const dlg=document.querySelector('[role=dialog]');
            let zone=null;
            for(const n of dlg.querySelectorAll('div,section,form'))
                if((n.innerText||'').includes('끌어다 놓으세요')||(n.innerText||'').includes('Drag photos')) zone=n;
            const target=zone||dlg;
            const o={bubbles:true,cancelable:true,composed:true,dataTransfer:dt};
            target.dispatchEvent(new DragEvent('dragenter',o));
            target.dispatchEvent(new DragEvent('dragover',o));
            target.dispatchEvent(new DragEvent('drop',o));
            return {zoneFound:!!zone,size:file.size};
        })()""" % b64)
        print("drop:", res); assert res["zoneFound"], "no dropzone"

        # 3. wait for crop screen (자르기)
        for _ in range(15):
            await asyncio.sleep(2)
            crop = await c.eval("!!document.querySelector('[role=dialog]')&&/자르기|Crop/.test(document.querySelector('[role=dialog]').innerText)")
            if crop: break
        print("crop_screen:", crop)

        # 4. set 원본 ratio (crop pitfall: default is 1:1)
        orig = await c.eval(r"""(() => {
            const icons=[...document.querySelectorAll('[role=dialog] svg')]
                .filter(s=>/자르기 선택|Select crop/.test(s.getAttribute('aria-label')||''));
            if(icons.length){let e=icons[0];while(e&&e.getAttribute('role')!=='button'&&!['BUTTON','I'].includes(e.tagName))e=e.parentElement;(e||icons[0]).click();}
            return icons.length;
        })()""")
        await asyncio.sleep(1.5)
        opt = await c.eval(r"""(() => {
            const o=[...document.querySelectorAll('[role=dialog]')].flatMap(d=>
                [...d.querySelectorAll('div,button,[role=button]')].filter(e=>/^(원본|Original)$/.test((e.textContent||'').trim())&&e.children.length<=1));
            if(!o.length) return null; o[o.length-1].click(); return o[o.length-1].textContent.trim();
        })()""")
        print("crop_options_icons:", orig, "clicked:", opt)

        # 5. Next x2 (crop -> edit -> caption)
        for i in range(2):
            nb = await c.eval(NEXT_BTN)
            assert nb, f"no Next at step {i}"
            await click_xy(c, nb["x"], nb["y"]); await asyncio.sleep(3)
            print("next", i+1, "done; dialog text:", repr((await c.eval("document.querySelector('[role=dialog]')?.innerText.slice(0,60)"))))

        # 6. caption via Input.insertText
        ed = await c.eval(r"""(() => {
            const t=document.querySelector('[role=dialog] div[contenteditable=true][role=textbox]');
            if(!t) return null; t.focus(); return true;
        })()""")
        print("caption_editor:", ed)
        await c.insert_text(TEXT); await asyncio.sleep(1)
        print("caption_in_dom:", (await c.eval("document.querySelector('[role=dialog] div[contenteditable=true][role=textbox]')?.innerText"))[:80])

        # 7. verify Share enabled — DO NOT CLICK
        sh = await c.eval(r"""(() => {
            const b=[...document.querySelectorAll('[role=dialog] div[role=button], [role=dialog] button')]
                .filter(e=>/^(공유하기|Share)$/.test((e.textContent||'').trim()));
            return b.map(e=>({t:e.textContent.trim(),
                dim:e.getAttribute('aria-disabled')||e.getAttribute('aria-disabled')||getComputedStyle(e).opacity}));
        })()""")
        print("share_button (NOT clicked):", sh)

        # 8. ABORT — close the dialog without sharing
        x = await c.eval(r"""(() => {
            const b=[...document.querySelectorAll('[role=dialog] [role=button], [role=dialog] button')]
                .filter(e=>/닫기|Close|취소/.test((e.getAttribute('aria-label')||'')+(e.textContent||'')));
            if(b.length){b[0].click();return (b[0].getAttribute('aria-label')||b[0].textContent).trim();}
            return null;
        })()""")
        print("closed_via:", x)
        await asyncio.sleep(2)
        gone = await c.eval("!!document.querySelector('[role=dialog]')")
        if gone:
            # Escape as fallback
            for t in ("keyDown","keyUp"):
                await c.call("Input.dispatchKeyEvent", type=t, key="Escape", code="Escape", windowsVirtualKeyCode=27)
            await asyncio.sleep(2)
            gone = await c.eval("!!document.querySelector('[role=dialog]')")
        print("dialog_gone:", not gone, "— post NOT published")

asyncio.run(main())
