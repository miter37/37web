# Architecture

```text
Agent / Orchestrator
       |
       | task_session_id
       v
+--------------------------+
| webctl                   |
| Known + discovery CLI    |
+------------+-------------+
             | localhost authenticated RPC
             v
+--------------------------+
| browserd                 |
| - persistent profile     |
| - session -> Page map    |
| - site identify          |
| - action runner          |
| - verification           |
+------------+-------------+
             |
             v
        Playwright
             |
             v
      Chrome/Chromium
             |
             v
          Website
```

Knowledge and runtime are deliberately separated:

```text
Git knowledge                         Runtime / not Git
-------------------------------       ------------------------------
sites/<site>/site.yaml                .runtime/browser-profile/
sites/<site>/SKILL.md                 .runtime/metrics/*.jsonl
sites/<site>/actions.ts               .runtime/snapshots/
.generated/target_sites.json (*)      .runtime/traces/

(*) generated from site.yaml; not a source of truth.
```

## Session continuity

`browserd` is the session broker. It owns one persistent Playwright context and maps explicit `task_session_id` values to Playwright `Page` instances. CLI calls are short-lived processes but the browser state remains in the daemon.

This avoids a global "current tab" and allows multiple task sessions without conflating pages.

## Knowledge lifecycle

```text
Observed -> Encoded -> Candidate -> Verified
```

Only Encoded/Candidate/Verified are represented as executable action metadata. Observed knowledge remains discovery evidence until an agent encodes it. Runtime success evidence is stored as append-only JSONL and keyed by `(site, action, variant)`.

## Risk and retries

Risk is an orthogonal axis. `unclassified` is treated conservatively. Simple static heuristics may raise risk but never lower it.

Write-like actions are not blindly retried. If execution fails, verification runs first. Only `APPLIED` can be treated as success. `UNKNOWN` is surfaced to the caller.

## Security boundary

The site code scanner blocks obvious access to shell/process execution, filesystem, raw Node networking, environment secrets, and direct `fetch`. This is a guardrail, not a cryptographic sandbox. Run generated site code under an OS/container account with least privilege for stronger isolation.

Raw page text is untrusted. Sanitized snapshots live only under `.runtime`.
