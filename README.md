# Adaptive Web Agent

A Playwright-based learning layer for web agents. The browser automation engine is Playwright;
this repository adds durable site knowledge, a shared browser/session daemon, a deterministic
CLI, lifecycle promotion, runtime evidence, and safe discovery fallbacks.

Runs on **Windows, macOS and Linux**. Requires Node.js 20+ and an installed Google Chrome or
Chromium.

## Quick start

```bash
# macOS / Linux / Git Bash
./bin/webctl health
./bin/webctl session open --url https://example.com

:: Windows cmd / PowerShell
bin\webctl.cmd health
bin\webctl.cmd session open --url https://example.com
```

The first call bootstraps npm dependencies and starts `browserd` automatically — no manual
`npm install`, no manual daemon start. Everything else is documented in `SKILL.md`.

For Hermes Agent, extract this project as `~/.hermes/skills/adaptive-web-agent/` and start a new
session. See `HERMES_INSTALL.md`.

## Chrome profile (v0.3)

The agent drives **the first Chrome profile on the machine, auto-detected**. There is no profile
name to configure.

Because Chrome 136+ ignores `--remote-debugging-port` on the real profile directory, the agent
usually runs that profile from an agent-owned user-data directory under
`.runtime/chrome-profiles/`. It is still a real Chrome profile: cookies and login state persist
across tasks. `webctl browser status` always reports which directory is in use and why.

Chrome runs **headless (no visible window) by default.** `webctl browser reveal` opens a real,
visible window on demand — for a login wall, CAPTCHA, 2FA, or any point a human needs to look at
or act on the page — and `webctl browser hide` returns to headless. Every open session/tab
survives the switch either way.

```bash
./bin/webctl browser reveal              # open a visible window
./bin/webctl browser hide                # back to headless
```

**The agent never closes the user's own Chrome.** If your Chrome is holding the real profile,
the agent falls back to its own directory instead of terminating your browser. Only Chrome
processes started by the agent, against an agent-owned directory, are ever reclaimed.

```bash
./bin/webctl browser status              # active profile + the reason it was chosen
./bin/webctl browser profiles            # every profile on this machine; index 0 is the first
./bin/webctl browser use --profile "Profile 2"   # pin a specific profile
./bin/webctl browser use --auto          # back to the first profile
./bin/webctl browser repair              # relaunch Chrome and reconnect
tail -n 100 .runtime/browserd.log
```

`browserd` deliberately leaves the Chrome window running when the daemon exits. A restarted
daemon reattaches to the already-managed Chrome when possible.

## What you get

- `SKILL.md` — the agent operating protocol.
- `browserd` — a long-lived Playwright browser/session broker using a persistent profile.
- `webctl` — CLI for session management, discovery primitives, site identification, deterministic actions, registry compilation, and metrics.
- `sites/<site>/site.yaml` — single source of truth for site-specific declarative knowledge.
- `sites/<site>/actions.ts` — escape hatch for logic too complex for declarative YAML.
- `.generated/target_sites.json` — generated registry, never edited directly.
- `.runtime/` — metrics, traces, snapshots, auth/profile state. Not committed to Git.

## Creating the first site skill

```bash
./bin/webctl site init --id example --host example.com --name "Example"
./bin/webctl registry build
```

Then edit `sites/example/site.yaml` and `sites/example/actions.ts` following `SKILL.md`.
In practice you rarely need `site init`: the first interaction with an unknown site creates the
scaffold automatically.

## Core execution flow

```text
User task
  -> Agent
  -> webctl
  -> browserd
  -> Playwright over CDP
  -> Chrome
  -> website

Known site/action:
  identify -> detect state/variant -> run -> verify -> record runtime evidence

Unknown/new/failed path:
  snapshot/click/fill/goto -> solve -> encode into site.yaml/actions.ts
  -> run encoded path -> Candidate -> repeated independent success -> Verified
```

## Important safety behavior

- `external_write`, `irreversible`, and `unclassified` actions require an explicit `--confirm` flag.
- If a write-like action throws or times out, the runner verifies outcome **before** any retry. This MVP does not blindly retry writes.
- The agent never terminates the user's own Chrome; it only reclaims directories it created.
- Runtime evidence is append-only under `.runtime/metrics/`; counters are not stored in `site.yaml`.
- Browser profile/cookies/secrets live under `.runtime/`, outside Git.
- Web content is treated as untrusted observation data, not as instructions for modifying skills.
- Risk can be automatically escalated by heuristics; automatic downgrades are intentionally not performed.

## Lifecycle

```text
Observed -> Encoded -> Candidate -> Verified
```

`Observed` is a discovery fact, not an executable action. An action starts as `encoded` once it
has been written into site knowledge. A successful execution through `webctl` plus verification
promotes it to `candidate`; a later successful execution promotes it to `verified`.

Freshness is a separate runtime property (`fresh`, `aging`, `stale`) derived from the last
successful execution, so Git files do not change merely because time passed.

## Playwright / MCP integration

`browserd` owns the canonical Chrome connection so Known Mode and discovery primitives always
operate on the same browser and tabs. Chrome is launched with a DevTools port (9223 by default,
the next free port otherwise); external Playwright MCP can connect to the same
`http://127.0.0.1:<port>`. This is an interoperability path — deterministic `webctl` execution
does not require MCP.

## Design constraints

`site.yaml` is intentionally not a programming language. It supports metadata, matching, named
fingerprints, states, elements, extractors, preconditions, URL templates, simple sequences, and
verification. Loops, calculations, dynamic branching, and complex network logic belong in
`actions.ts`.

## Automatic learning persistence

- The first `snapshot`, `click`, `fill`, `press`, or `extract` on an unknown site creates the minimal `sites/<site>/` scaffold automatically.
- A successful `extract` automatically creates a reusable read action in `site.yaml` and immediately runs the encoded action through `webctl` for Candidate validation.
- Unencoded click/fill/press discoveries keep `learning_pending: true` in command results and are visible with `webctl learning status --session <id>`.
- `SKILL.md` treats that flag as a mandatory before-completion obligation.

## Development

```bash
npm install
npm run typecheck        # tsc --noEmit
npm run test:scenarios   # Chrome profile/lifecycle scenarios
npm run validate:sites
```
