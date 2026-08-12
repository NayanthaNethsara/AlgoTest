# Contestant Client Design — Agent / Shell Split

> **Status: built.** Backend `internal/agent`, migration `0007_agents.sql`, the split Tauri client,
> and the portal's proctoring UI are all implemented. The notes below marked *as built* record
> where the implementation refined this design.

Companion to [plan-2.md](../plan-2.md), which fixes the contest decisions: air-gapped LAN,
contestants use their **own IDE**, one required user-level install, flag-for-review plus a hard
submission gate on agent liveness. This document designs the client itself.

New requirement driving this document:

> The proctor client must always be running in the background. The web portal exists as a **backup**
> for when something goes wrong with the client mid-contest.

---

## 0. Why the current client cannot satisfy that

Today one Tauri process is both the contest UI and the proctor, and the proctor has **no identity of
its own**. `telemetry-bridge.tsx` logs into the portal and hands the *user session token* to Rust via
`update_telemetry_auth`; `spawn_telemetry_loop` sends nothing until that call lands
([lib.rs:132](../competitor-desktop/src-tauri/src/lib.rs#L132)).

Four consequences, each fatal to the requirement:

| Coupling | Consequence |
| --- | --- |
| Agent token comes from the webview login | No portal login in the webview → no heartbeats → the gate `423`s the contestant |
| Browser fallback never calls `update_telemetry_auth` | The "backup" path **silently stops proctoring**, so `proctor_exempt` becomes the routine workaround — which is proctoring switched off |
| A remote origin must be able to invoke a Rust command | This is plan-2's Phase-1 spike and its self-declared highest-risk item |
| One process, `panic = "abort"` in release ([Cargo.toml](../competitor-desktop/src-tauri/Cargo.toml)) | Any UI-path panic takes the proctor down with it |

**The design move: split the agent from the shell — separate process, separate credential, separate
lifecycle.** The shell becomes a browser window with nothing security-relevant in it. If it crashes,
proctoring is unaffected, which is precisely the property the requirement asks for.

One binary, two modes selected by argv — one artifact to build, sign, and install:

```
mini-algothon-competitor --agent     # headless proctor + tray + loopback API. Autostarts at login.
mini-algothon-competitor             # contest shell: webview → portal. Spawns --agent if absent.
```

---

## 1. Topology

```
Contestant laptop                                     Contest server
┌────────────────────────────────────────────┐        ┌──────────────────────────────┐
│  Their own IDE + their own compilers       │        │ nginx :80                    │
│  (unwatched, unrestricted)                 │        │   /     → portal   :3000     │
│              │ copy                        │        │   /api/ → Go API   :8080     │
│              ▼                             │        ├──────────────────────────────┤
│  ┌──────────────────────┐                  │        │ requireUser   → portal, run, │
│  │ SHELL  (crashable)   │  webview ────────┼───────▶│                  submissions │
│  │  tray-hidden window  │                  │        │ requireAgent  → heartbeat,   │
│  └──────────┬───────────┘                  │        │                  events      │
│             │ GET /status (loopback)       │        ├──────────────────────────────┤
│             ▼                              │        │ proctor: gate · evaluator    │
│  ┌──────────────────────┐   heartbeat /15s │        │ Postgres 16                  │
│  │ AGENT  (must live)   │──────────────────┼───────▶│                              │
│  │  own token · tray    │   own bearer     │        └──────────────────────────────┘
│  │  127.0.0.1:47615     │◀─────────────────┼── browser fallback reads /status
│  └──────────────────────┘                  │
└────────────────────────────────────────────┘
```

The agent is the only thing that talks to `requireAgent` routes. The shell and the browser are
interchangeable consumers of the same portal, and **neither can affect liveness**.

---

## 2. Agent identity — enroll once, hold your own token

### Enrollment (first run, or after a wipe)

The agent owns the setup window; the existing static
[setup/index.html](../competitor-desktop/setup/index.html) is the right host for it (local origin, so
no capability problem).

1. Server URL — prefilled from a compiled-in LAN default, editable.
2. Disclosure + consent, fetched from `GET /api/v1/proctor/disclosure` with a compiled-in fallback.
   Accept or Quit, no pre-checked box.
3. Contestant credentials, or a one-time enrollment code printed on their seat card.

```
POST /api/v1/agent/enroll        (unauthenticated)
{ username, password | enrollment_code, machine_id, platform, agent_version, consent_version }
→ { agent_id, agent_token, user_id, display_name, policy }
```

`machine_id`: stable per-machine value — `IOPlatformUUID` (macOS), `MachineGuid` (Windows),
`/etc/machine-id` (Linux), hashed with a build salt so we never store a raw hardware id.

### Token storage and handling

Store `agent_token` in `app_config_dir()/agent.json`, mode `0600`. **Not the OS keychain** — on 300
laptops a macOS keychain prompt is a support queue, and the token's only power is *sending telemetry
as yourself*, which no contestant wants to steal. Server stores `sha256(token)` only, reusing the
pattern already in [session.go](../backend/internal/session/session.go#L60).

New table `proctor_agents`: `id, user_id, machine_id, token_hash, agent_version, platform,
enrolled_at, last_seen_at, revoked_at, revoked_reason`.

**One live agent per user.** Enrolling from a second machine revokes the first and records a
`tel.agent_rebound` finding. This does not *prevent* "clean laptop runs the agent, dirty laptop
writes the code" — nothing on the endpoint can — but it makes every swap visible in review.

### What this buys immediately

Telemetry no longer needs the webview, so **plan-2's Phase-1 Tauri remote-origin spike leaves the
critical path**. The shell needs zero IPC from a remote origin: tray, diagnostics, and setup all live
on local pages in the agent process. `update_telemetry_auth` is deleted.

---

## 3. Loopback attestation — how the web backup stays honest

The agent binds the first free port in `47615..47619` on `127.0.0.1` and serves:

```
GET /status
→ { agent_id, boot_id, seq, uptime_s, healthy, last_ack_at, attest_nonce, portal_url }
```

- CORS: `Access-Control-Allow-Origin` echoed **only** for the configured portal origin.
- `attest_nonce` rotates on every heartbeat; each heartbeat tells the server the nonce now in effect.
- *As built:* the server retains the **previous** nonce as well, and the agent publishes a new one
  only after the server acknowledges the heartbeat carrying it. Without both halves, a rotation
  landing between "portal reads the nonce" and "contestant submits" fails an honest contestant.
- *As built:* the nonce is never returned by any user-authenticated endpoint. Serving it from
  `/telemetry/self` would let a second machine fetch it from the server and forge co-location,
  which is the one thing this mechanism exists to make harder.
- Port discovery: the agent reports its bound port in the heartbeat, and
  `GET /api/v1/telemetry/self` returns it — so the portal never has to scan.

The portal — in the desktop shell *or* in a plain browser — fetches `/status` to drive an accurate
local "Proctoring: active" pill, and sends the nonce as `X-Agent-Attest` when submitting. A matching
nonce proves *a browser on the same machine as the live agent* made the request.

The portal is plain HTTP on an air-gapped LAN (plan-2 B7), so this is a same-scheme fetch and no
mixed-content rule applies. **If TLS is ever added to the portal, this channel breaks** — loopback
HTTP from an HTTPS page is blocked. Note it next to the TLS decision.

**Honest limit:** a contestant with two machines can relay the nonce over the LAN. Attestation proves
co-location of *browser and agent*, never that the code was written there. It raises cost, and its
absence is visible in review. It is not proof, and the gate must not treat it as proof.

---

## 4. Signal loop

One 5-second base tick, everything else a multiple of it. Deltas from the current implementation
matter more than the list:

| Signal | Cadence | Change from today |
| --- | --- | --- |
| Foreground app | sample 5s, **report dwell** | Today one instantaneous sample per 15s. A 10-second glance at a tethered browser is invisible. Report `{app_id: ms}` accumulated since the last heartbeat |
| Inference ports | 60s (12th tick) | Unchanged — two-stage connect + HTTP fingerprint is already right ([ports.rs](../competitor-desktop/src-tauri/src/signals/ports.rs)) |
| Internet reachability | 15s, **debounced** | Two targets (`1.1.1.1:53`, `8.8.8.8:53`), fire only on **two consecutive** successes. One 300ms fluke should not mint a weight-50 finding |
| Process matches | 15s, current set | *As built:* the agent sends the current matched set rather than diffs. It is 0–3 entries in practice, `signal_hash` already removes the cost of repeats, and it keeps the server stateless |
| Rules refresh | 5 min, ETag | `GET /api/v1/agent/rules`, compiled-in fallback |
| Keepalive | 5 min | Forces an event row even when nothing changed (plan-2 A4) |

### Heartbeat payload

```json
{
  "boot_id": "uuid-per-process-start",
  "seq": 412,
  "mono_ms": 6180000,
  "wall_ts": "2026-08-09T09:14:22Z",
  "agent_version": "1.2.0",
  "loopback_port": 47615,
  "attest_nonce": "b7f2…",
  "signal_hash": "sha256 of the signal set below",
  "buffered": false,
  "shell_alive": true,
  "signals": {
    "foreground_dwell": { "com.microsoft.VSCode": 11200, "com.google.Chrome": 3800 },
    "ports": [{ "port": 11434, "rule_id": "ai.port.ollama", "product": "Ollama", "confirmed": true }],
    "internet_reachable": false,
    "process_added": ["ollama"],
    "process_removed": [],
    "total_processes": 431,
    "lan_ip": "10.20.4.71"
  }
}
```

`signal_hash` is what makes 500 contestants cheap: the server upserts liveness on every ping but only
writes an event and re-evaluates rules when the hash changes (plan-2 A5).

*As built:* the hash deliberately covers **only stateful signals** — reachability, confirmed ports,
matched processes, and which apps appeared in the foreground. Dwell milliseconds and process counts
change on every single heartbeat, so including them would make every heartbeat a "state change" and
defeat the short-circuit entirely. There are unit tests for exactly this in `signals/mod.rs`.

---

## 5. Offline buffering and gap fairness

The agent keeps a 240-entry ring buffer (~1 hour at 15s) and flushes it to
`POST /api/v1/agent/events` on reconnect, `buffered: true`. Without this, every nginx reload becomes
300 contestant gaps.

Server-side classification:

| Observation | Meaning | Weight |
| --- | --- | --- |
| >30% of enrolled agents gap inside the same 60s window | **Infrastructure** outage — suppress findings for all of them, record one incident row | none |
| Clean `POST /agent/shutdown` received | Contestant stopped proctoring deliberately; submissions locked while stopped | none |
| Gap with no shutdown, agent returns with same `boot_id` | Network blip | low |
| Gap with no shutdown, **new `boot_id`** | Crash or kill | low — crashes happen, but record it |
| `seq` regresses on the same `boot_id` | Replay or forgery | high |
| `wall_ts` offset from server time **changes** by >120s | Clock tampering | medium |

*As built:* the check compares the *change* in a contestant's clock offset, not the offset itself. A
laptop whose clock is simply an hour wrong is not cheating; a clock that moves mid-contest is the
signal. Buffered replays are exempt, since they carry an old wall stamp by definition.

The infrastructure-outage rule is a few lines of SQL and it is the difference between a review queue
an organizer trusts and 300 findings they learn to ignore.

---

## 6. Lifecycle

- **Autostart** via `tauri-plugin-autostart`, user-level only: HKCU `Run` (Windows),
  `~/Library/LaunchAgents` (macOS), `~/.config/autostart` (Linux). Survives the mid-contest reboot.
  Contest-morning ritual is still "open the app" — autostart is recovery, not the primary path.
- **Single instance** on both modes (`tauri-plugin-single-instance`). Two agents means two `seq`
  streams and a permanent `seq` regression finding.
- **Closing the contest window hides it to tray**, with a one-time toast: *"Proctoring is still
  running. Quit from the tray icon."* This is what makes "always background" legible instead of
  alarming.
- **Quitting is always allowed** and never silent: tray → *Stop proctoring* → dialog stating
  submissions will lock → `POST /agent/shutdown` → exit.
- **Watchdog, both directions.** The shell polls loopback `/status` every 5s; if it is unreachable it
  shows a red banner with a *Restart proctoring* button that spawns `--agent`. The agent holds the
  shell's pid and reports `shell_alive` so the admin view can distinguish "shell crashed" from
  "contestant chose the browser".

---

## 7. UI surfaces

### Desktop client

| Surface | Owner | Purpose |
| --- | --- | --- |
| Setup + consent window | agent | Server URL, disclosure, Accept/Quit, enrollment. Local origin |
| Contest shell window | shell | Webview → portal. Fullscreen + maximized, **resizable, no kiosk, no alwaysOnTop** — the confirmed workflow requires alt-tabbing to their IDE |
| Tray icon + menu | agent | Status dot (green live / amber degraded / red locked), Open contest window, Diagnostics, Copy support code, Stop proctoring |
| Diagnostics window | agent | Agent version, boot id, uptime, seconds since last ack, server reachable, enrolled user, machine id, last 20 heartbeat results, **Copy diagnostics** |

**Support code** — `<username>-<machine_id[0:6]>-<boot_id[0:4]>`, shown in the tray and on every
error banner. One string a contestant reads aloud that drops an organizer straight onto their row in
the admin monitoring view. Across 300 laptops and a 4-hour window this is the highest-leverage UI
element in the client.

### Web backup

Same portal, three additions:

1. **Proctoring pill** in the nav, driven by loopback `/status` first and
   `GET /api/v1/telemetry/self` as the fallback.
2. **Non-dismissible locked banner** when no live agent is detected: *"Submissions are locked —
   proctoring agent not detected"*, with Retry, the support code, and how to restart the agent.
3. Web-client provenance ping (`client_type: WEB`, focus/blur, editor stats) — **corroboration only.
   Liveness never comes from the browser**, or the backup becomes the bypass.

---

## 8. Gate semantics (revision of plan-2 A6)

Liveness is a property of the **agent**, not of whichever client submits. That single change makes
the web backup safe to *offer*; a second one decides who may take it.

### Three modes, one of them free

There are exactly three ways to sit the contest, and they are not equally observable
([access.go](../backend/internal/agent/access.go)):

| Mode | What it is | What is given up |
| --- | --- | --- |
| `DESKTOP` | portal inside the desktop client, agent live behind it | nothing |
| `WEB_WITH_AGENT` | portal in the contestant's own browser, agent still reporting | nothing corroborates which window the code was typed in |
| `WEB_ONLY` | browser with no live agent at all | every endpoint signal |

`AccessGrant` is which modes an account may submit from: the two fallbacks are **independent
switches**, either, both, or neither. `DESKTOP` has no field because it is never withheld — an
account with no grants is not locked out of the contest, it is expected in the client. The effective
grant is the **union** of two levers, so neither can silently narrow the other:

- `contest_settings.access.allow_web_with_agent` / `access.allow_web_only` — the contest-wide floor,
  both seeded `false`. The right lever when the desktop client itself is the problem, rather than
  granting 300 people the same accommodation one at a time.
- `users.proctor_allow_web_with_agent` / `proctor_allow_web_only` — one contestant's grant, with a
  mandatory reason, the admin who granted it, and an optional expiry (`NULL` = the rest of the
  contest). Two checkboxes in the admin console's users table, `PATCH /api/v1/admin/users/:id/access`
  — which takes the whole grant rather than a delta, so two organizers on the same row cannot
  interleave into a combination neither chose.

Both are read per submission, so a grant takes effect on the contestant's next attempt.

**One combination is perverse and is not normalised away:** `WEB_ONLY` without `WEB_WITH_AGENT`
permits submissions with no agent while refusing them with one, so the contestant unlocks their own
submissions by *stopping* proctoring. It is enforced exactly as configured — occasionally it is what
someone means — but `AccessGrant.Perverse()` names it, the API returns a `warning`, the console
confirms before saving, and the monitoring row flags it. Silent normalisation would have been the
worse answer: an organizer would think they had refused something they had in fact granted.

### Resolving the mode

`DESKTOP` requires **two independent things**: the client's own claim, forwarded by the portal as
`X-Algothon-Client: desktop` from the marker the client sets in the window it opens, *and* the
agent's `shell_alive` report. Neither alone is enough:

- The marker is a readable cookie, so a browser can be made to send it. Pairing it with
  `shell_alive` means forging `DESKTOP` requires actually running the desktop client — and therefore
  being proctored — so the worst case is a `WEB_WITH_AGENT` contestant posing as `DESKTOP`, never an
  unproctored one. `WEB_ONLY` cannot be forged in either direction: it is the *absence* of agent
  reports rather than any client's assertion.
- `shell_alive` alone says the shell process is running, not that this submission came from it — a
  contestant with the client open in the background and the contest in Chrome is `WEB_WITH_AGENT`,
  and reading them as `DESKTOP` would make the browser grant unenforceable.

The corroboration is a **sighting within `ShellGraceSeconds` (90s)**, stored as
`telemetry_heartbeats.shell_alive_at`, not the newest heartbeat's boolean. The chain is lossy by
construction — shell pings the agent every 10s, agent forgets after 30s, agent reports every 15s — so
a resumed laptop or a stalled shell produces one `shell_alive: false` heartbeat while the contestant
sits in front of the client. Refusing them there would be this gate's worst failure. The bounded cost:
for 90s after genuinely closing the client, a hand-forged marker in a browser passes as `DESKTOP` —
which requires having just run the proctored client, so it buys the weaker mode, never an unproctored
one.

A desktop claim the agent does not corroborate is recorded (`claims_shell` / `shell_alive` in the
`tel.web_client` evidence) and downgraded, never upgraded.

| Agent | Mode | Grant | Submissions | Finding |
| --- | --- | --- | --- | --- |
| Live (≤90s) | `DESKTOP`, attested | any | allowed | — |
| Live (≤90s) | `WEB_WITH_AGENT`, attested | no `web_with_agent` | **423 Locked** `CLIENT_NOT_ALLOWED` | `tel.web_client` (low) |
| Live (≤90s) | `WEB_WITH_AGENT`, attested | `web_with_agent` | allowed | `tel.web_client` (low) |
| Live (≤90s) | either, **no attestation** | any | allowed | `tel.no_attest` (medium) |
| Stale (>90s) or never seen | `WEB_ONLY` | no `web_only` | **423 Locked** | `tel.no_agent_submit` |
| Stale (>90s) or never seen | `WEB_ONLY` | `web_only` | allowed | `tel.web_only_grant` (low) |
| Any | any, `proctor_exempt` | any | allowed | standing exemption finding |

- `/api/v1/run` stays **ungated** — contestants must be able to test through an agent hiccup.
- `423` body: `{ code, last_ping_at, seconds_since_ping, access_mode, allowed_modes, remedy }`, plus
  the banner polling `/telemetry/self` every 15s so they learn while coding, not with 90 seconds
  left. The poll forwards the same client marker, so it answers for the window the contestant is
  actually looking at rather than the most permissive one they could open.
- `CLIENT_NOT_ALLOWED` is deliberately not an `AGENT_*` code: the agent is reporting fine, and
  telling someone to restart a working client sends them in circles.
- It is also the one lock that gets a **full-screen notice** rather than the banner
  ([access-block.tsx](../competitor-frontend/src/components/portal/access-block.tsx)): it never
  clears on its own, so a contestant must not be able to code for an hour before discovering it. It
  names the mode they are in, the modes they hold, and is dismissible to the editor — test runs work
  in every mode, and stranding someone in front of a wall helps nobody. The other lock codes keep the
  banner: taking the screen away mid-keystroke over a 15-second agent restart is worse than the
  problem.
- A fleet-wide `telemetry_incidents` row still overrides the stale rows. An outage is ours, not the
  contestant's.
- `proctor_exempt` remains break-glass and remains distinct from a grant: an exemption switches
  proctoring **off**, while a `web_only` grant keeps every finding and records each submission against
  the organizer's stated reason. Reviewers can tell "allowed to use a browser" from "not being
  watched".
- Optional `contest_settings.require_agent_attest` promotes the no-attestation row from finding to
  block. Ship it **off**; it is a lever for an organizer who sees abuse, not a default.

---

## 9. Changes to existing code

### Bugs to fix first — these break the design's own foundations

1. **`client_type` and `signals` are silently dropped on every ping.** `heartbeatItem` has no
   `clientType` field and the batcher's INSERT/UPDATE omits the column
   ([batcher.go:14](../backend/internal/telemetry/batcher.go#L14),
   [batcher.go:102](../backend/internal/telemetry/batcher.go#L102)), while the non-batched
   `UpsertHeartbeat` does write it. `NewRouter` always constructs the batcher
   ([router.go:31](../backend/internal/api/router.go#L31)), so the batcher is the only live path and
   **every contestant appears as `DESKTOP`**, browser-only users included — the exact distinction
   this design depends on. Signals never reach the heartbeat row either.

2. **Risk score is unbounded and fires on every ping.** `EvaluateTelemetryPing` records a finding
   per ping with no dedup ([evaluator.go:31](../backend/internal/proctor/evaluator.go#L31)), and
   `recalculateRiskScore` is a plain `SUM(weight)`
   ([evaluator.go:129](../backend/internal/proctor/evaluator.go#L129)). On any machine with internet
   reachable that is +50 every 15s: `HIGH` within 30 seconds, ~48,000 by hour four, and one row per
   ping per user in `proctor_findings`. Needs the `signal_hash` short-circuit, one open finding per
   `(user, rule)` with an occurrence count, and a capped score with log-scaled repeats as plan-2 A5
   specifies.

3. **Windows foreground detection reads the wrong window.** It enumerates processes and takes the
   *first* one with a non-zero `MainWindowHandle`
   ([foreground.rs:38](../competitor-desktop/src-tauri/src/signals/foreground.rs#L38)) — an
   arbitrary app, not the focused one — and the `$h = …ReadInt32` assignment is dead code. Needs
   `GetForegroundWindow` + `QueryFullProcessImageNameW` via `windows-sys`.

4. **macOS foreground spawns `osascript` every 15s** (~100ms and a process launch per sample, worse
   once sampling moves to 5s). Use `objc2-app-kit` → `NSWorkspace.frontmostApplication()`, as plan-2
   A1 already prescribes.

5. **The risk dashboard queried `WHERE u.role = 'COMPETITOR'`** while roles are lowercase
   (`user.RoleCompetitor = "competitor"`), so `GET /admin/proctor/risk` returned zero rows always —
   the review queue was permanently empty. Found while wiring the gate.

6. **Delete the local-runner branch** in
   [competitor-frontend/src/lib/runner.ts](../competitor-frontend/src/lib/runner.ts#L14). Nothing in
   the repo listens on `:8081`, and because `executeRun` runs server-side, under the thin client that
   `fetch` would hit the **contest server's** loopback, not the laptop's. On a thrown error it returns
   `IE` without falling through, so `NEXT_PUBLIC_PLATFORM=desktop` breaks `/run` outright.
   Bundled compilers are already ruled out; remove the path.

### Client restructure

```
competitor-desktop/src-tauri/src/
  main.rs           # argv → agent::run() | shell::run()
  agent/
    mod.rs          # tick scheduler, ring buffer, seq/boot_id
    enroll.rs       # enrollment + agent.json (0600)
    transport.rs    # heartbeat, events flush, shutdown, rules (ETag)
    loopback.rs     # 127.0.0.1:47615..47619, /status, nonce rotation
    tray.rs         # status dot, menu, quit confirmation
    diagnostics.rs  # local diagnostics window + copy payload
  shell/
    mod.rs          # webview → client.json server_url, hide-to-tray, agent watchdog
  signals/          # existing modules, cadence + dwell + diff changes per §4
```

Deleted: `update_telemetry_auth`, `spawn_telemetry_loop`, `TelemetryState`, the `EnableTelemetry`
bypass, `competitor-desktop/src-tauri/server/` (stale bundled Node + Next artifact), and the
`beforeBuildCommand` bundling steps. `tauri.conf.json` keeps **no** hardcoded
`http://localhost:3000` window URL — agent mode creates no visible window at all.

### New API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/agent/enroll` | none | Issue `agent_token` |
| `POST /api/v1/agent/heartbeat` | agent | §4 payload; replaces the agent's use of `/telemetry/ping` |
| `POST /api/v1/agent/events` | agent | Buffered flush |
| `POST /api/v1/agent/shutdown` | agent | Clean stop |
| `GET /api/v1/agent/rules` | agent | Denylist + cadence, ETag |
| `GET /api/v1/proctor/disclosure` | none | Consent text, plus the published port list and process denylist it promises |
| `GET /api/v1/telemetry/self` | user | Extend with `loopback_port`, `attest_ok`, `agent_version`. Also records browser presence via `?tab_visible=` — the portal polls this every tick regardless, so presence costs no extra request and still never affects liveness |

---

## 10. Failure matrix — what "web as backup" actually covers

| Scenario | Detected by | Contestant sees | Submissions | Organizer |
| --- | --- | --- | --- | --- |
| Shell webview crashes / white-screens | shell gone, `shell_alive: false` | Tray still green | **allowed** — open the portal in a browser | none |
| Portal UI bug (bad deploy) | reports | Broken page | allowed via browser; hotfix the server-hosted portal | redeploy, no reimaging |
| Agent crashes | new `boot_id`, no shutdown | Red banner in shell/browser + *Restart proctoring* | locked until it returns (≤15s) | low-weight finding |
| Agent killed via Task Manager | gap, no shutdown | Locked banner | locked | review the gap |
| Contestant stops proctoring from tray | clean shutdown | Explicit confirm dialog | locked, by their choice | none |
| Laptop reboots | new `boot_id` after autostart | Back to green | locked for the reboot window | none |
| LAN blip / nginx reload | many agents gap at once | Amber pill, agent buffers | ≤90s allowed; then locked | suppressed as infrastructure |
| Server down | heartbeats fail | Amber pill, buffer fills | locked while down | fix the server; buffer replays |
| `agent.json` lost / wiped | no agent for that user | Setup window on next launch | locked until re-enrolled | re-enroll, 60s |
| Second machine enrolled | `tel.agent_rebound` | Old agent stops | old machine locked | **investigate** |
| Browser on machine B, agent on machine A | no attestation, LAN IP mismatch | Works | allowed (or blocked with the lever on) | **investigate** |
| Clock changed | `wall_ts` vs `mono_ms` skew | nothing | allowed | medium finding |

The load-bearing row is the first one: a client bug costs a contestant nothing, because the portal is
server-hosted and liveness lives in a process the UI cannot kill.

---

## 10a. Monitoring — what an organizer actually watches

Three surfaces, built on the five data layers (`proctor_agents`, `telemetry_heartbeats`,
`telemetry_events`, `telemetry_gaps`/`telemetry_incidents`, `proctor_findings`/`proctor_risk`).

**Fleet header** (`GET /api/v1/admin/proctor/overview`) — counted in SQL so it can poll at 10s with
500 contestants: enrolled/competitors, online, not-reporting (stale + offline), **in blackout**,
never-started, high-risk. Only the counts that would make someone stand up carry colour.

**Incident banner** — when >30% of live agents go quiet inside one 60s window, the sweeper opens an
incident, suppresses contestant gaps, and the banner says so explicitly: *treat gap records from this
window as ours, not theirs*. It stays visible for 15 minutes after recovery, because an organizer
reading a gap needs to know a blackout just ended.

**Live tab** gains a **Dark for** column distinguishing the three ways to be silent — never enrolled,
stopped deliberately (clean shutdown recorded), or blackout with no clean stop — plus a `GAP` filter.

**Agents tab** (`GET /api/v1/admin/proctor/agents`) — enrolment history including revoked and stopped
agents, with an enrolment count per contestant. More than one enrolment is what a two-laptop setup
looks like from here. Revoking requires a reason.

**Evidence timeline** (`GET /api/v1/admin/proctor/timeline/:userId`) — one vertical axis merging
events, gaps as spans, findings as markers, submissions as pins, and enrolments, unioned and ordered
in SQL so the `LIMIT` applies to the merged stream rather than truncating each source. Replayed
heartbeats are labelled *replayed* and placed at their original time, which is what makes a blackout
legible after the fact:

```
14:03  finding      Ollama Local LLM Port · weight 40 · seen 41×
14:05  blackout     Telemetry blackout — 2m 14s
14:07  replayed     internet reachable · Ollama on 11434
14:11  boot         agent returned, same boot id
14:12  submission   Submitted Range Sum · 4 typed · 1180 pasted
```

### What a network disconnect looks like

| Time | Agent | Server | Contestant |
| --- | --- | --- | --- |
| T+0 | Heartbeat fails, buffers **to disk** | `last_seen_at` freezes | Tray shows seconds since last report |
| T+45s | Still collecting | Live tab → STALE | Pill flips to "not reporting", banner appears |
| T+90s | | Gate `423`s; sweeper opens a gap | Banner names the remedy and support code |
| Reconnect | Flushes up to 240 held heartbeats | Events land **at their original timestamps**; gap closed | Pill green |

The load-bearing property: **disconnecting delays evidence, it does not erase it.** Tethering during
a blackout still arrives stamped with the minute it happened. Two implementation details are what make
that true, and both were missing in the first pass:

- **The buffer persists to `buffer.json`.** In memory only, the evasion was: unplug, tether, use a
  local model, kill the agent, replug — the gap would survive but everything observed inside it would
  be gone. On disk, a kill or a reboot only delays the flush. A contestant can still delete the file;
  the permanent gap record is what remains then.
- **The portal combines both vantage points.** `/telemetry/self` is unreachable exactly when the
  network drops, so trusting it alone showed a reassuring green pill at the one moment the indicator
  had to be right. The agent's loopback report needs no network, so the portal now derives lock state
  from whichever source is more pessimistic.

### Simulating a cheating attempt

`backend/cmd/proctorsim` drives the real HTTP API as fake agents, so what appears in the admin UI is
what a real endpoint produced — nothing is written straight to the database.

```bash
make proctorsim ARGS='-list'
make proctorsim ARGS='-scenario local-llm -user alice -pass secret -admin admin -admin-pass s3cret'
make proctorsim ARGS='-scenario all -user alice -pass secret -admin admin -admin-pass s3cret'
make proctorsim ARGS='-scenario fleet-outage -users competitors.csv -count 20'
```

| Scenario | What it proves |
| --- | --- |
| `clean` | A normal contestant produces no findings at all |
| `local-llm` | Process match + fingerprinted port → risk HIGH |
| `tethered` | `net.internet` opens, dispositive on an air gap |
| `blackout` | Held reports replay **at their original timestamps** — disconnecting delays evidence, it does not erase it |
| `replay` | A captured heartbeat is refused with `409 SEQ_REPLAY`, so it cannot hold the gate open |
| `rebind` | Second machine revokes the first and raises `tel.agent_rebound` |
| `clock-jump` | Only a *change* in clock offset counts; a steadily wrong clock does not |
| `browser` | The agent keeps reporting with `shell_alive: false`; the submission is `WEB_WITH_AGENT`, flagged, and refused unless that account has been granted browser access |
| `stopped` / `crash` | A clean stop is neutral; a kill is recorded |
| `fleet-outage` | >30% quiet at once opens an incident and suppresses every contestant gap |

With `-admin` credentials each scenario reads its own evidence back through the timeline API and
prints the findings, so it is self-verifying rather than something you have to go hunting for.

### The sequence counter is per-boot, not per-agent

`seq` exists to catch a replayed heartbeat, and it only means anything *within one boot*. Storing it
as a running maximum (`GREATEST(seq, incoming)`) looked harmless and was not: after a client restart
the agent's counter resets to 1 while the server still held the previous boot's high-water mark, so
every heartbeat of the new boot compared as a replay, got `409`, and never advanced `last_seen_at`.
The contestant saw *"not reporting · last report 73s ago"* for as long as it took the counter to climb
past the old value — minutes at a 15s cadence — and then it silently fixed itself.

`RecordHeartbeat` now resets the counter when `boot_id` changes. Two defences sit behind that:

- The agent declares a **fresh boot after two consecutive rejections**. A rejection it cannot fix by
  retrying would otherwise repeat forever, and each one keeps submissions locked; a restart is a
  legitimate reason for a sequence to reset, so recovering costs a low-weight restart finding and
  nothing else. No contestant should ever be locked out because the two sides disagree about
  bookkeeping.
- `proctorsim -scenario crash` now climbs to seq 5 before restarting and sends three heartbeats
  afterwards, so this exact regression fails the scenario. `-scenario server-restart` covers the
  same ground from the server's side.

### One startup trap, now closed

The scheduler originally slept a full interval before its first heartbeat, so for the first 15
seconds a freshly launched agent had no acknowledged report — and the portal could only read that as
"not reporting", which it rendered as *"cannot reach the contest server"*. Every client passed through
that state on launch, and 300 would at a contest start.

Fixed in three places: the agent reports on its **first** tick (and immediately after enrolling, via a
force flag), it distinguishes `starting` from unreachable in its loopback status, and the portal shows
a quiet "Proctoring is starting" strip for that state while polling every 5s instead of 15s until it
clears.

### Not built

No alerting — the fleet header has to be on a screen someone is looking at. There is no push when
twelve contestants drop at once, only a count that changes.

---

## 11. Privacy delta — the consent text must change

plan-2 A8 promises "**nothing at all when the app is closed**". An autostarting background agent
makes that sentence false, and shipping the old wording with this design would be a
misrepresentation. Restate it as:

- The agent collects **only while enrolled and running**, and it starts at login for the duration of
  the contest.
- The tray icon is always visible while it runs — there is no hidden state.
- **Stopping it is one click** and never blocked; it only locks scored submissions.
- Autostart is disclosed at consent and is removable by the contestant.
- Uninstall/withdrawal removes the autostart entry and revokes the token.

Everything else in A8 stands, and the published denylist and disclosure endpoint matter more here
than before: an agent that keeps running deserves a contestant who can read exactly what it looks at.

---

## 12. Build order

Slots into plan-2's phasing; **Phase 1 (the Tauri remote-origin spike) is deleted** — §2 removes the
need for a remote origin to invoke commands at all.

| Step | Work | Why here |
| --- | --- | --- |
| 0 | The three bugs in §9 (`client_type`, unbounded risk, Windows foreground) | Cheap, and every later step is measured through them |
| 1 | `proctor_agents` + enroll/heartbeat/shutdown with `requireAgent` | The credential split unblocks everything else |
| 2 | Split `main.rs` into agent/shell, tray, hide-to-tray, autostart, single-instance | The "always background" requirement itself |
| 3 | Gate on agent liveness (§8) + locked banner in both clients | Enforcement before detection, per plan-2 |
| 4 | Loopback `/status`, nonce, `X-Agent-Attest` | Makes the web backup safe rather than a bypass |
| 5 | Signal cadence rework: dwell, debounce, diffs, buffering, gap classification | Detection quality |
| 6 | Diagnostics window + support code | Contest-day support load |

### Verification gates

1. Kill the **shell** during a submission-in-progress → tray stays green, the same submission
   completes from a browser, no finding.
2. `kill -9` the **agent** → banner appears within 5s; submit → `423`; restart from the banner →
   submitting succeeds within 15s.
3. Stop the server for 3 minutes → agent buffers; on restart the timeline is continuous and the
   window is classified as infrastructure, with zero contestant findings across all test agents.
4. Submit from a browser on machine B while the agent runs on machine A → allowed, with
   `tel.no_attest` and an IP mismatch visible in review.
5. Start a plain dev server on `:8080` → **no** finding (the fingerprint false-positive control).
   Start Ollama → `ai.port.ollama` `confirmed: true` within 60s, exactly one finding, not one per
   ping.
6. Reboot a laptop mid-contest → agent back within 60s of login with a new `boot_id` and no gap
   finding beyond the reboot window.
