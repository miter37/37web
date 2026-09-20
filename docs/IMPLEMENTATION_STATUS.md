# Implementation status — v0.3

## Implemented

- TypeScript/Node runtime, running identically on Windows, macOS and Linux.
- Cross-platform Node launcher (`scripts/launcher.mjs`) doing self-check, first-run bootstrap, and browserd supervision; `bin/*` (POSIX) and `bin/*.cmd` (Windows) are thin wrappers over it.
- Automatic daemon port selection with the chosen port recorded in `.runtime/browserd-endpoint.json`; `WEBAGENT_PORT` pins it.
- Long-lived `browserd` owning a Chrome connection over CDP.
- Automatic Chrome profile resolution: the first profile on the machine, with the real profile directory used when Chrome permits remote debugging there and an agent-owned mirror otherwise.
- An explicit profile can be pinned at runtime (`webctl browser use --profile NAME`) or by environment variable, validated before it is persisted.
- Headless by default; `webctl browser reveal`/`browser hide` relaunch Chrome visible/headless on demand, reopening every tracked session at its last URL with cookies/login state intact.
- Automatic cleanup of tabs a page opens on its own (ad popups, `window.open()`) shortly after they appear, unless explicitly claimed as a session; `webctl session close --all` sweeps every open tab on demand.
- The user's own Chrome is never terminated; only agent-owned user-data directories are reclaimed.
- Explicit task session -> Playwright Page mapping.
- Local authenticated RPC between `webctl` and `browserd`.
- `SKILL.md` with Known/Discovery rules, exact command syntax, and site-authoring policy.
- `site.yaml` Zod schema with named fingerprints, states, elements, extractors, preconditions, URL templates, actions, variants, risk, lifecycle, and verification.
- Derived `.generated/target_sites.json` registry compiler.
- `site init` scaffolding, including deriving a host from an active browser session.
- Known Mode action runner for declarative and TypeScript `actions.ts` actions.
- Mandatory verification and `APPLIED / NOT_APPLIED / UNKNOWN` outcomes.
- `Observed -> Encoded -> Candidate -> Verified` model; executable knowledge starts at Encoded, with automatic Candidate/Verified promotion after verified executions.
- Runtime evidence outside Git, keyed by site/action/UI variant.
- Fresh/aging/stale evidence reporting.
- Risk escalation heuristics and confirmation gates.
- Verify-before-retry invariant for writes; no blind write retry.
- Structured page snapshots, screenshots, discovery click/fill/press/extract primitives.
- Read-only network request/response observation with query-value redaction.
- Offline state/fingerprint checks against sanitized structured snapshots.
- Static site validation and basic generated `actions.ts` security scan.
- Baseline measurement recording for before/after comparisons.
- CDP endpoint available for Playwright MCP interoperability.

## Deliberately not embedded

The runtime does **not** contain an LLM. The host agent reads `SKILL.md`, uses the discovery
primitives, and writes/patches site knowledge. This keeps model choice independent from the
browser runtime and is what allows a stronger agent to create deterministic paths that weaker
agents can later reuse.

## Deliberate limitations

- On Chrome 136+ the real profile's cookies are not inherited: the agent-owned profile requires a one-time sign-in. Copying profile data is not attempted, because Windows app-bound cookie encryption would silently break it.
- The `actions.ts` security scanner is a guardrail, not a hard sandbox. For hostile environments, run `browserd` and generated code in a least-privilege container/OS account.
- Git commits/review are not automated. Knowledge files are modified on lifecycle promotion, but commit/review remains with the host workflow.
- CAPTCHA/2FA/auth recovery is classified conceptually by the skill; the runtime does not attempt to bypass challenges.
- Offline snapshot testing is intentionally approximate for CSS-only locators because sanitized snapshots do not preserve a full DOM.
- Multiple browser contexts/accounts can be added later; one persistent context with explicit pages/sessions is used today.
- External MCP on the CDP port can share browser state, but concurrent control of the exact same tab must be coordinated by the host agent.
- The Windows process inspection path shells out to PowerShell; it is correct but slower than the POSIX `ps` path.
