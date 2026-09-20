# Browser Recovery and Chrome Runtime

## Default model

Adaptive Web Agent v0.3 drives installed Google Chrome using **the first Chrome profile found on
the machine**, auto-detected. There is no hardcoded profile name.

- profile selection: first entry of Chrome's `Local State` `info_cache`, ordered `Default`, `Profile 1`, `Profile 2`, …
- user-data-dir: the real Chrome directory when Chrome permits remote debugging there, otherwise `<skill>/.runtime/chrome-profiles/<Profile>-user-data`
- browserd RPC: `127.0.0.1:3219`, moving to the next free port when taken (recorded in `.runtime/browserd-endpoint.json`)
- preferred CDP port: `9223`, moving to the next free port when taken
- headless by default (see below); Chrome remains running if browserd exits; a replacement
  browserd reattaches when possible.

### Why the directory is usually agent-owned

Chrome 136 stopped honouring `--remote-debugging-port` when Chrome runs against its normal
user-data directory. On Chrome 136+ the agent therefore mirrors the selected profile into its own
directory. It is still a real Chrome profile: cookies and login state persist the same as any
Chrome profile does. On Chrome < 136, with no Chrome currently holding the directory, the real
profile is used directly.

`webctl browser status` always reports `managed`, `userDataDir`, `headless`, and a `reason`
string explaining the profile choice.

## Headless by default

Chrome launches **headless (no visible window)** unless told otherwise. Every discovery/action
primitive (snapshot, screenshot, click, fill, extract) works identically headless or not - a
visible window is only useful when a *person* needs to see or act on the page themselves: a
login wall, a CAPTCHA, 2FA, or any failure you can't otherwise diagnose.

```bash
webctl browser reveal   # relaunch with a visible window
webctl browser hide     # relaunch back to headless
```

Headless is launch-time only in Chrome - there's no live CDP toggle - so both commands work by
releasing the current Chrome process and relaunching it with the opposite flag, the same
mechanism `browser repair` uses. Every tracked session is reopened at its last known URL in the
new window (`SessionStore.rebindContext`), and since it's the same on-disk profile, cookies and
login state carry over untouched. The choice is persisted in
`.runtime/display-preference.json` and overrides the `WEBAGENT_HEADLESS` env var/default from
then on - there is currently no CLI command to clear it back to "follow the default"; delete
that file (then `browser repair`) to do so.

## The agent never closes the user's Chrome

Only Chrome processes that explicitly name an **agent-owned** user-data directory are ever
terminated. Ordinary Chrome, started by the user, carries no `--user-data-dir` on its command
line and is never matched for termination.

When the real profile is wanted but the user's Chrome is holding it, the resolver reports the
conflict and falls back to an agent-owned directory instead of killing anything.

## Automatic recovery cases

1. Target directory is free → launch Chrome and attach via CDP.
2. A Chrome started earlier by the agent is still running with healthy CDP → reuse it.
3. A stale agent-started Chrome holds the agent-owned directory → terminate it, wait, force-kill if necessary, remove stale singleton locks, relaunch.
4. The user's own Chrome holds the real profile → leave it alone, fall back to an agent-owned directory.
5. Chrome refuses remote debugging on the real profile → fall back to an agent-owned directory automatically.
6. Preferred CDP port busy → choose the next free port in a bounded range.
7. Chrome exits during startup → fail fast with a clear startup error and the browserd log.
8. browserd dies while Chrome remains → new browserd reuses `chrome-state.json` and the live CDP endpoint.
9. Chrome dies while browserd remains → the next RPC relaunches Chrome and SessionStore reopens known task URLs.
10. Stale browserd pid → the launcher terminates the stale daemon before restarting.
11. browserd port occupied by an unrelated process → the launcher selects the next free port (unless `WEBAGENT_PORT` pins one, in which case it fails clearly).

## Commands

```bash
# macOS / Linux / Git Bash
./bin/webctl browser status
./bin/webctl browser profiles
./bin/webctl browser use --profile "Profile 2"
./bin/webctl browser use --auto
./bin/webctl browser repair
./bin/webctl browser reveal
./bin/webctl browser hide
./bin/webctl session list
tail -n 100 .runtime/browserd.log
```

```bat
:: Windows cmd / PowerShell
bin\webctl.cmd browser status
bin\webctl.cmd browser repair
```

`browser repair` is the explicit recovery hammer: it releases the agent-owned directory, clears
stale Chrome state, relaunches Chrome, reconnects Playwright, and rebinds task sessions where
possible.

## Pinning a profile

`webctl browser use` writes `.runtime/profile-preference.json` and restarts Chrome. The name is
validated against the real profile list before it is persisted, so a typo cannot wedge startup.

| Command | Effect |
| --- | --- |
| `browser use --profile "Profile 2"` | Pin that profile (matched by directory or display name) |
| `browser use --managed` | Always use an agent-owned directory |
| `browser use --real` | Always use the real Chrome directory (fails on Chrome 136+) |
| `browser use --user-data-dir DIR [--profile-directory NAME]` | Point at an arbitrary directory |
| `browser use --auto` | Clear the preference and return to the first profile |

The same choices are available as environment variables: `WEBAGENT_CHROME_PROFILE_NAME`,
`WEBAGENT_CHROME_PROFILE_STRATEGY` (`auto` / `managed` / `real`), `WEBAGENT_CHROME_USER_DATA_DIR`,
`WEBAGENT_CHROME_PROFILE_DIRECTORY`. The stored preference takes priority over the environment.
