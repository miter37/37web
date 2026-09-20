#!/usr/bin/env python3
"""37web CDP helper — talks to the 37web browserd's Chrome (CDP port from .runtime/browserd-endpoint.json / chrome-state.json).

Usage as a module: from cdp37 import CDP37
CLI probes:  python3 cdp37.py eval <tab-match-substring> '<js expr>'
"""
import json, sys, urllib.request, asyncio, glob

import websockets

RUNTIME_GLOBS = [
    "/home/doyoonkim/.agents/skills/37web/.runtime",
    "/home/doyoonkim/.hermes/profiles/h0/skills/37web/.runtime",
]

def cdp_port():
    for g in RUNTIME_GLOBS:
        p = g + "/browserd-endpoint.json"
        try:
            cs = json.load(open(g + "/chrome-state.json"))
            return cs["cdpPort"]
        except Exception:
            continue
    raise RuntimeError("37web runtime not found")

class CDP37:
    def __init__(self, tab_match=None, port=None):
        self.port = port or cdp_port()
        tabs = json.load(urllib.request.urlopen(f"http://localhost:{self.port}/json/list"))
        pages = [t for t in tabs if t["type"] == "page"]
        if tab_match:
            pages = [t for t in pages if tab_match in t["url"]]
        if not pages:
            raise RuntimeError(f"no tab matching {tab_match!r}; open tabs: " +
                               ", ".join(t["url"][:60] for t in pages[:10]))
        self.tab = pages[0]
        self.ws_url = self.tab["webSocketDebuggerUrl"]
        self._id = 0
        self._ws = None

    async def __aenter__(self):
        self._ws = await websockets.connect(self.ws_url, max_size=256 * 1024 * 1024)
        return self

    async def __aexit__(self, *a):
        await self._ws.close()

    async def call(self, method, **params):
        self._id += 1
        mid = self._id
        await self._ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(await asyncio.wait_for(self._ws.recv(), timeout=60))
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    async def eval(self, expr, await_promise=False):
        r = await self.call("Runtime.evaluate", expression=expr,
                            returnByValue=True, awaitPromise=await_promise)
        if r.get("exceptionDetails"):
            raise RuntimeError("JS exception: " + json.dumps(r["exceptionDetails"])[:500])
        return r["result"].get("value")

    async def navigate(self, url):
        await self.call("Page.navigate", url=url)

    async def insert_text(self, text):
        await self.call("Input.insertText", text=text)

    async def set_files(self, files, selector="input[type='file']"):
        doc = await self.call("DOM.getDocument", depth=1)
        q = await self.call("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector=selector)
        node_id = q["nodeId"]
        if not node_id:
            raise RuntimeError(f"querySelector found nothing for {selector}")
        desc = await self.call("DOM.describeNode", nodeId=node_id)
        await self.call("DOM.setFileInputFiles",
                        files=files, backendNodeId=desc["node"]["backendNodeId"])
        return node_id

    async def click_by_testid(self, testid):
        """Physical click via bounding box + Input.dispatchMouseEvent (React-safe)."""
        box = await self.eval(f"""(() => {{
            const el = document.querySelector("[data-testid='{testid}']");
            if (!el) return null;
            el.scrollIntoView({{block:'center'}});
            const r = el.getBoundingClientRect();
            return {{x: r.x + r.width/2, y: r.y + r.height/2}};
        }})()""")
        if box is None:
            raise RuntimeError(f"no [data-testid={testid}]")
        for t in ("mousePressed", "mouseReleased"):
            await self.call("Input.dispatchMouseEvent", type=t, x=box["x"], y=box["y"],
                            button="left", clickCount=1)
        return box

if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "eval":
        async def m():
            async with CDP37(sys.argv[2]) as c:
                print(await c.eval(sys.argv[3]))
        asyncio.run(m())
    else:
        print(__doc__)
