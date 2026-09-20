# Optional Playwright MCP interoperability

The core system does not require MCP: `browserd` owns the canonical persistent Playwright context and `webctl` supplies both Known Mode and discovery primitives.

Chrome is always launched with a DevTools port, so no special startup is needed. Read the active
port from `webctl browser status` (`cdpPort`, `9223` by default) and point Playwright MCP at
`http://127.0.0.1:<cdpPort>` using `mcp/playwright.example.json`.

To pin the port instead:

```bash
# macOS / Linux / Git Bash
WEBAGENT_CDP_PORT=9222 ./bin/browserd
```

```powershell
# Windows PowerShell
$env:WEBAGENT_CDP_PORT = "9222"; bin\browserd.cmd
```

This is an interoperability path. Keep one explicit task session/page identity in your orchestration and avoid concurrent conflicting actions from `webctl` and MCP on the same tab.
