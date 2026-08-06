# Contest Hardening: Own-Machine Proctoring + Scale to 500

## Context

MiniAlgothon now has a web portal and a Tauri desktop app, and needs to run a real contest:
**200–500 contestants on an air-gapped LAN, on their own laptops.** Two problems block that.

**1. Anti-AI without wrecking UX.** Forcing everyone into our Monaco editor is bad UX and contestants
want their own IDE. The air gap already kills every cloud AI (no ChatGPT, no Copilot, no Cursor), so
the residual threat is narrow and specific: **local LLM runtimes** (Ollama, LM Studio, llama.cpp,
Jan, GPT4All, vLLM), IDE-bundled local models, and **a second path to the internet** (phone
tethering, second Wi-Fi adapter). The answer is to let contestants work wherever they like and paste
into the portal, while a proctor agent on the endpoint watches for exactly those three things.

**2. The current system will not survive 500 people.** Existing telemetry is one hardcoded string and
a process-name dump with a trivial `ENABLE_TELEMETRY=false` bypass. The judge recompiles the program
once per test case. SSE is broken. There is no rate limiting, no connection pool tuning, no lease
reaper, and a transient DB error silently awards full marks.

### Confirmed decisions

|             |                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Network     | Air-gapped LAN, organizers control the router. No internet egress.                               |
| Endpoint    | One required install: the Tauri app, user-level privileges.                                      |
| Editor      | Contestants use **their own IDE**, then paste into the portal Monaco and submit.                 |
| Enforcement | **Flag for human review**, never auto-disqualify. Plus a hard submission gate on agent liveness. |
| Anti-tamper | Submission gate + permanent gap logging. No signing/attestation.                                 |
| Client arch | **Thin client** — webview points at the server-hosted portal; stop bundling Next.js + Node.      |

### One honest trade-off up front

Choosing "paste into the portal" means **editor provenance is weak evidence.** If everyone
legitimately pastes, paste-dominance doesn't discriminate. It still captures something (one giant
paste 20s after opening vs. six pastes over 40 minutes of iteration), but the real anti-AI weight
falls on the **endpoint signals** — localhost inference ports, AI processes, internet reachability.
The plan is weighted accordingly: provenance rules ship at low weight and get tuned from day-one data.

---

## Architecture

```
Contestant laptop                          Contest server (one 16-core Linux box)
┌──────────────────────────┐               ┌──────────────────────────────────────┐
│ Their own IDE  (unwatched)│              │ nginx :80                            │
│         ↓ copy            │              │   /        → Next portal   :3000     │
│ ┌──────────────────────┐  │   paste +    │   /api/    → Go API        :8080     │
│ │ Tauri thin client    │──┼── submit ───▶│   /api/v1/submissions/stream (SSE)   │
│ │  webview → portal    │  │              ├──────────────────────────────────────┤
│ │  ┌────────────────┐  │  │  heartbeat   │ Go binary: API + judge + evaluator   │
│ │  │ proctor agent  │──┼──┼── /15s ─────▶│ isolate sandbox, 13 pinned cores     │
│ │  │ ports·procs·   │  │  │              ├──────────────────────────────────────┤
│ │  │ net·foreground │  │  │              │ Postgres 16                          │
│ │  └────────────────┘  │  │              └──────────────────────────────────────┘
│ └──────────────────────┘  │
└──────────────────────────┘
```

Two structural changes make everything else easier:

- **Thin client.** Delete the bundled Next.js server and Node binary. The webview navigates to a
  runtime-configured server URL. Lets us hotfix the UI mid-contest instead of reimaging 300 laptops.
- **nginx same-origin.** Everything on port 80. The already-written `EventSource("/api/v1/...")`
  starts working with zero frontend changes, CORS disappears, and the Tauri client sees one origin.

---

## Track A — Proctoring

### A1. Endpoint signals (Rust)

New modules under `competitor-desktop/src-tauri/src/signals/`, `#[cfg]`-gated per OS. Ranked by value:

| Signal                                      | Build?                              | Notes                                                                              |
| ------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Localhost inference port probe**          | **First.** Best ratio in the system | TCP connect + HTTP fingerprint                                                     |
| **Internet reachability**                   | **Yes**                             | `connect_timeout("1.1.1.1:53", 300ms)` — on a true air gap, success is dispositive |
| **Process match vs. server denylist**       | Yes                                 | name **and** cmdline; ship matches only, not 400 names                             |
| **Foreground app identity**                 | Yes                                 | app/bundle id                                                                      |
| Foreground window _title_                   | Windows + X11 only                  | macOS needs Screen Recording — **cut it there**                                    |
| Interface/gateway enumeration               | Low weight                          | Docker/VPN/VMs make this noisy                                                     |
| Wayland foreground                          | **Cut**                             | No portable protocol. Report `supported: false`                                    |
| Full process list upload                    | **Cut**                             | Current behavior; ~50 MB/min at 500 users                                          |
| Keyboard hooks, screenshots, clipboard, USB | **Cut**                             | Non-negotiable on personal machines                                                |

**Port probe** (`signals/ports.rs`), every 4th tick (60s). Two-stage — connect, then one HTTP GET and
substring-match. The fingerprint is what kills false positives: ports 8080/8000 are worthless without
it (every dev server trips them) and near-perfect with it.

| Port        | Path            | Body contains     | Product                       |
| ----------- | --------------- | ----------------- | ----------------------------- |
| 11434       | `/api/tags`     | `"models"`        | Ollama                        |
| 1234        | `/v1/models`    | `"object"`        | LM Studio                     |
| 1337 / 4891 | `/v1/models`    | `"object"`        | Jan / GPT4All                 |
| 8080, 8000  | `/v1/models`    | `"object":"list"` | llama-server / vLLM / LocalAI |
| 5000 / 5001 | `/api/v1/model` | `"result"`        | text-gen-webui / KoboldCpp    |

**Foreground** (`signals/foreground.rs`) — do **not** use `active-win-pos-rs`; on macOS it returns an
empty title without Screen Recording permission, so it would ship a signal that silently never works.

- macOS: `objc2-app-kit` → `NSWorkspace.frontmostApplication()` → bundle id. No permission prompt.
- Windows: `windows-sys` → `GetForegroundWindow` + `GetWindowTextW` + `QueryFullProcessImageNameW`.
- Linux/X11: `x11rb` → `_NET_ACTIVE_WINDOW` → `_NET_WM_NAME` / `WM_CLASS`.
- Wayland: `supported: false`. **The rule engine must treat missing foreground data as an environment
  fact, never as evidence** — otherwise every default-session Ubuntu user gets flagged.

**Processes** (`signals/processes.rs`) — hold one long-lived `System`, call `refresh_processes()` only
(current code rebuilds `System::new_all()` every 15s). Remove the `helper`/`service` exclusions — they
currently hide `Ollama Helper` and `LM Studio Helper (Renderer)`. Match name **and** joined cmdline
(`python -m vllm.entrypoints...` has a generic name). Send `{total, set_hash, matches[]}`; typical
payload 0–3 entries.

**Agent integrity** — delete the `ENABLE_TELEMETRY` bypass in `spawn_telemetry_loop`. Add `boot_id`
(random UUID per process start), a monotonic `seq`, and `agent_version` to every ping so the server can
distinguish restart / gap / forged agent.

**Rules come from the server** — `GET /api/v1/telemetry/rules`, cached, refetched every 5 min, with a
compiled-in fallback. Organizers update the denylist by editing a table, not by rebuilding 300 binaries.

### A2. Thin client + the one real integration risk

`competitor-desktop/src-tauri/src/lib.rs`: strip `NodeServer`, `spawn_next_server`, `find_server_dir`,
`find_node_binary`, the `Drop` impl, and the telemetry kill switch. New `config.rs` reading
`app_config_dir()/client.json` (`server_url`, `api_url`, `consent_version`). New
`competitor-desktop/setup/index.html` — a plain static setup + consent page wired as `frontendDist`;
once configured, Rust calls `webview_window.navigate(server_url)`.

Also delete `scripts/bundle-server.mjs`, `scripts/copy-app-server.mjs`, the `desktop-build` copy step in
[Makefile](Makefile), `beforeBuildCommand` in `tauri.conf.json`, and the build-time `NEXT_PUBLIC_API_URL`
in [.github/workflows/build-desktop.yml](.github/workflows/build-desktop.yml). (`src-tauri/server/` is
gitignored, not checked in — it's just a stale local artifact.)

> **⚠ Highest-risk item in the plan.** In Tauri v2 a **remote origin cannot invoke commands** unless a
> capability grants it via `remote.urls`, and `capabilities/*.json` is compiled in at build time —
> which fights the runtime-configurable URL head-on. `telemetry-bridge.tsx` calls
> `update_telemetry_auth`, so this **will break silently** the moment the webview points at a remote
> host. Fix: build the capability JSON at runtime in `setup()` from `client.json` and call
> `app.add_capability(...)`. Fallback: a wildcard `remote.urls` capability scoped to just the two
> commands. **Prove this works before writing anything else in Track A.**

Keep `fullscreen: true, maximized: true, resizable: true`. Do **not** add `alwaysOnTop` or `kiosk` —
the confirmed workflow requires alt-tabbing to their own IDE.

### A3. Editor provenance (Monaco)

New `competitor-frontend/src/hooks/use-editor-provenance.ts`; `code-editor.tsx` gains one pass-through
`onMount` prop; `code-workspace.tsx` calls the hook and passes `snapshot()` into `submitFast`.

Three Monaco gotchas that will otherwise silently break it:

- `onDidChangeModelContent` fires **before** `onDidPaste` → classify optimistically in the change
  handler, let `onDidPaste` reclassify.
- `e.isFlush` is true for `model.setValue()` — `handleLanguageChange` and `handleRestore` both do this.
  Bucket as `external_edits` or every language switch looks like a giant paste.
- `onDidPaste` misses drag-and-drop text and X11 middle-click paste. Add a third `bulk_insert` bucket:
  any single non-flush, non-undo insert > 20 chars with no following paste event.

Captured: counts of typed/pasted/bulk chars and events, largest paste, `ms_to_first_input`,
`ms_since_last_paste`, focus/blur, and a 30s-bucket edit timeline.
**Never captured:** code content, clipboard plaintext, paste hashes, per-keystroke timings.
(Collusion detection can run on `submissions.code`, which we already store — no extra collection.)

This is client-side JS in a webview the contestant controls and is forgeable via devtools. It is
**corroborating evidence only** — which is exactly why the policy is human review.

### A4. Storage — `backend/internal/db/migrations/0006_proctoring.sql`

Storing every ping is 33 rows/s ≈ 500k rows and 95% duplicates. Instead: **write an event only when the
signal set changes, plus a 5-minute keepalive** → ~15–25k meaningful rows. The live view is unaffected
(the existing per-user upsert still runs every ping).

New tables: `telemetry_events` (append-only), `telemetry_gaps` (permanent blackout record, never purged
with raw events), `submission_provenance`, `proctor_rules` (data-driven catalogue, seeded),
`proctor_findings` (evidence trail), `proctor_risk` (rollup), `proctor_reviews`, `proctor_consents`.
Plus `users.proctor_exempt` and signal columns on `telemetry_heartbeats`.

### A5. Rule engine — `backend/internal/proctor/`

`proctor.go` (types) · `evaluator.go` · `gate.go` · `repository.go`, per the repo's domain convention.

`OnHeartbeat` short-circuits on an unchanged signal hash — that's what keeps 33 req/s cheap (one upsert,
no rule evaluation). On change: write the event, match rules in memory, upsert findings.
`Sweep` every 30s opens/closes gaps (including `boot_id` change and `seq` regression) and recomputes
risk in one statement. Rules hot-reload every 60s — no restart.

Risk = capped sum of finding weights with log-scaled repeats. No ML, no decay; a 4-hour contest
doesn't need it.

**Weighting reflects the paste workflow.** Endpoint signals carry the weight; provenance corroborates:

| Rule                                                           | Weight |                                                    |
| -------------------------------------------------------------- | ------ | -------------------------------------------------- |
| `net.internet` — machine reaches the public internet           | 50     | critical, dispositive on an air gap                |
| `ai.port.*` confirmed by HTTP fingerprint                      | 35–40  | critical                                           |
| `ai.proc.*` (ollama, llama-server, lmstudio, jan, …)           | 30     | high                                               |
| `tel.no_agent_submit`, `ai.fg.denylist`                        | 25     | high                                               |
| `net.gateways`, `tel.web_client`, `prov.missing`               | 15–20  | medium                                             |
| `prov.no_typing`, `prov.paste_dominant`, `prov.instant_submit` | **10** | **low — everyone pastes; raise from day-one data** |
| `tel.gap`, `net.interfaces`                                    | 10     | low                                                |

`prov.*` ships at 10, not 30, precisely because the confirmed workflow makes pasting normal. Tuning is a
one-row `UPDATE`.

### A6. Submission gate

`Gate.Check` in `proctor/gate.go`, called from `createSubmission` in
[backend/internal/api/handler.go](backend/internal/api/handler.go) **after** code-size validation and
**before** `h.judge.Submit`. Returns **`423 Locked`** with `{error, code, last_ping_at,
seconds_since_ping}`. (`403` reads as authz, `409` is taken by `ErrActiveSubmissionExists`.)

- `PROCTOR_GATE_MAX_STALE_SECONDS = 90`, **not** the existing 45s `StatusOnline` boundary — 45s is 3
  missed intervals and one congested-LAN packet loss would lock someone out mid-submit.
- **`/api/v1/run` is NOT gated.** Contestants must be able to test code through an agent hiccup; only
  the scored path is gated.
- **Web-only contestants are blocked by default**, allowed via per-user `users.proctor_exempt` granted
  by an admin — not a global flag, which would silently open the whole contest the first time someone
  flips it to unstick one person. Exempt users carry a standing `tel.web_client` finding.

Frontend, both layers: `submitCode` surfaces `errorCode: "AGENT_STALE"` with an actionable message,
**and** a new `proctor-status-banner.tsx` polls `GET /api/v1/telemetry/self` every 15s so contestants
find out while coding, not with 90 seconds left on the clock.

### A7. Admin review UI

`admin-frontend/src/app/monitoring/page.tsx` → tabs **Live** | **Review**, plus a drill-down at
`monitoring/[userId]/page.tsx`.

The drill-down is the point: **one vertical time axis** interleaving telemetry events, gaps as shaded
spans, findings as markers, and submissions as pins. "Ollama appeared 14:03 · telemetry gap 14:05–14:07
· submission with 4 typed chars at 14:08" is a story an organizer can act on; three separate tables is
not. Actions are Clear / Escalate / Note — **no disqualify button**.

An inline rules editor (`PUT /api/v1/admin/proctor/rules/:id`) makes "tune the denylist live" real.

Two [AGENT.md](AGENT.md) violations to fix while in here: `monitoring/page.tsx` uses raw Tailwind colors
(`emerald-500`, `amber-400`, …) instead of semantic tokens, and it colors both liveness _and_ client
type in one table. New rule: liveness owns color in the Live tab, risk severity owns it in Review, the
other dimension stays neutral.

### A8. Privacy and consent — a deliverable, not a checkbox

This runs on contestants' personal machines.

**Collected:** foreground app identity (+ window title on Windows/X11 only), process _count_ and names
matching a **published** denylist, which of a published list of localhost ports answer as an LLM API,
interface/gateway counts, internet reachability, OS/arch/LAN IP, editor statistics.

**Not collected — state affirmatively:** no screenshots, no screen/camera/mic recording, no keystroke
content, no clipboard contents, no full process list, no file names or paths, no browser history, no
packet capture, no code beyond what is deliberately submitted, and **nothing at all when the app is
closed**.

**Retention:** events/heartbeats 30 days, gaps/findings/provenance/reviews 90 days for appeals. Purge
via a manual `cmd/proctor-purge` one-shot — **not** a cron job that could silently destroy evidence
during an appeal.

**Consent:** full disclosure on the setup page before login, Accept or Quit, no pre-checked box. Served
from `GET /api/v1/proctor/disclosure` so wording can change without a new binary. **Publish the
denylist** at `/api/v1/proctor/rules/public` — it's honest, and a contestant who knows Ollama is
detected doesn't start Ollama, which beats catching them afterwards. Persistent "Proctoring: active"
indicator in the portal nav. Document that quitting is always allowed and merely locks submissions.

---

## Track B — Scale

Verified against the code. Ranked by contest-day blast radius.

### B0. Correctness landmines — ~2 hours, highest ratio in the plan

1. **Full marks on zero or errored tests.** [judge.go:131](backend/internal/judge/judge.go#L131) —
   `if err != nil || len(tests) == 0` returns `StatusPassed` / `"AC"` / `score = MaxScore`. A transient
   DB error during the rush **silently awards a perfect score** and corrupts the leaderboard
   undetectably. There is a **second copy** at judge.go:214 (`j.runner == nil` awards full points per
   test). Split into an `internalError` path (`IE`, score 0) and requeue on `err != nil`.
2. **Delete the `problem_samples` fallback** ([repository.go:406](backend/internal/judge/repository.go#L406)).
   It grades against _public_ samples at a hardcoded 33 points, so hardcoding the sample output scores 99. Also gate publishing: refuse to publish a problem with zero rows in `problem_tests`.
3. **`u.email` breaks `GET /admin/submissions` 100% of the time**
   ([repository.go:302](backend/internal/judge/repository.go#L302)) — no migration ever adds an `email`
   column. This is the exact tool organizers reach for when something goes wrong. While there: stop
   selecting `s.code` (50 full source files per response) and actually read `limit`/`offset`, which the
   handler hardcodes to 50/0.
4. **Language whitelist mismatch** — `handler.go` accepts `c/go/rs/js/ts`; `runner.specs` knows only
   `cpp/java/python`. A `go` submission gets RTE on all 10 tests instead of a 400. One line.
5. `memoryKb` is thrown away even though `runner.Result.MemoryKB` is correctly populated.

### B1. Compile-once-run-many — the throughput fix

`evaluate()` calls `runner.Run` **per test**, and `Run` does `MkdirTemp` + `initBox` + **full compile** +
`cleanup` every call. A 10-test C++ submission compiles ten times.

New `RunBatch(ctx, BatchRequest) (BatchResult, error)` in
[backend/internal/runner/runner.go](backend/internal/runner/runner.go) — one box, one compile, N cases,
with an `OnCase` callback so SSE and lease renewal don't wait for the batch. Non-obvious requirements:
distinct step name per case (`run_0`, `run_1` — otherwise a silent program reads the previous case's
stdout), re-seed `work/` from a pristine artifact between cases, and a 90s budget so ten Python TLEs
can't blow the lease.

| Language | Today | After |          |
| -------- | ----- | ----- | -------- |
| C++      | 16.4s | 2.54s | **6.5×** |
| Java     | 14.9s | 3.74s | 4.0×     |
| Weighted | 13.3s | 2.42s | **5.5×** |

**300-submission rush: 16.6 minutes → 1.5 minutes.** And the worst case is the common case — a
non-compiling submission currently costs 15s of a slot recompiling the same broken program ten times.

### B2. Unlock the cores — two bugs found during verification

- **`Slot.Core` _is_ used for pinning** (runner.go:432 does `taskset -c`), and `Core == BoxID`. With
  `RUN_MAX_CONCURRENT=4`, **all sandbox work is pinned to cores 0–3 and cores 4–15 are unreachable.**
  Add `RUN_CPU_LIST` and pass real cores into the limiter.
- **`acquireSubmit` is never called** — `runner.Run` always calls `acquireRun`, so `RUN_RESERVE` and the
  entire two-tier pool are dead code. Judge workers compete with interactive `/run` for the same 4
  slots. `RunBatch` should acquire via `acquireSubmit`, which finally activates it.

Target config for a 16-physical-core host (**run `lscpu -e` first** — "16 cores" is usually 8 physical +
SMT, and that changes every number):

`RUN_CPU_LIST=3-15` · `RUN_MAX_CONCURRENT=13` · `RUN_RESERVE=5` (submitCap 8) · `JUDGE_WORKERS=8`
(must equal submitCap, or a worker holds a DB lease while blocked) · `RUN_MAX_QUEUE=100` ·
`JUDGE_LEASE_SECONDS=120`.

**Highest-leverage single line in the plan:** precompile `bits/stdc++.h` to a `.gch` in
[backend/deploy/provision-isolate.sh](backend/deploy/provision-isolate.sh). The runner's flags are fixed
and already match. C++ compile 1.5s → ~0.35s — another ~2× on the dominant cost, and it helps `/run`
even more than the judge since `/run` can't amortize a compile.

### B3. nginx same-origin — fixes SSE for free

The relative `EventSource("/api/v1/submissions/stream")` isn't a frontend bug; it's the _correct_ URL
for a same-origin deploy. Add nginx on :80 (`/api/` → :8080, `/` → :3000, `proxy_buffering off` on the
stream location — the handler already sets `X-Accel-Buffering: no`).

At 300 concurrent during a rush: **200 rps of Next.js server-action polling → ~0.** Also replace
`getSubmissionStatusAction` and `pingWebTelemetryAction` with direct `apiFetch` calls — right now
**Next.js sits in the hot path of every telemetry ping and every status poll**, doing a full RSC
round-trip per poll. Keep a 5s safety poll (not 1.5s) as the SSE backstop.

Broadcaster hardening: index subscribers by user (currently O(all subscribers) per test under RLock),
add a monotonic `Seq` so silent drops are detectable, cap one stream per user + a global limit.

_(Correction to an earlier read: the 1.5s poller is gated on `activeSubmission`, so it's 0.67 rps per
in-flight submission, not 200 rps of constant background polling. The Next.js hop is the real cost.)_

### B4. Limits and pools

- **pgxpool** is completely untuned (default `MaxConns = max(4, numCPU)`). Set `MaxConns=40`,
  `MinConns=10`, lifetimes, connect timeout. By Little's law ~380 q/s × 0.5ms = 0.19 connections
  average — 40 is burst headroom, and going past ~50 makes Postgres slower and starves you of a `psql`
  slot at 2am.
- **`http.Server` has no timeouts.** Set `ReadHeaderTimeout=5s`, `ReadTimeout=30s`,
  `IdleTimeout=120s`, `MaxHeaderBytes=16KB`, and **`WriteTimeout=0`** — anything else kills every SSE
  connection on a timer. Bound slow writes inside `streamSubmissions` with `ResponseController` instead.
- Gate `db.Migrate()` behind a config flag; a contest-day binary shouldn't be able to alter the schema.
- **Rate limiting** (new `backend/internal/api/ratelimit.go`, `golang.org/x/time/rate`): login 10/min/IP
  - 5/min/username, `/run` 12/min, `/submissions` 10/min, `/submissions/:id` 60/min, ping 8/min,
    admin 120/min. Plus `MaxBytesReader` body caps — `ShouldBindJSON` currently buffers the whole body
    _before_ the length checks in `run.go`.
- **Add a login semaphore** (size 8) around bcrypt. `DefaultCost` is ~80ms; 500 simultaneous logins at
  contest start peg all 16 cores. Ten lines, prevents the worst thundering herd in the system.
- Replace the in-process `activeRunUsers` map only if you go multi-node (see below) — a Postgres
  advisory lock, not Redis.

### B5. Telemetry ingest

`telemetry_heartbeats` is 500 rows taking 33 UPDATEs/s = **475k dead tuples over 4 hours**, and
`idx_telemetry_last_ping` indexes the one column that changes every ping — **which is the only thing
preventing HOT updates.** On a 500-row table that index is worse than a seq scan.

**One-line fix, most of the value:** drop it, plus `fillfactor=70` and aggressive autovacuum thresholds.

Then a 2s batcher (`telemetry/batcher.go`) with last-write-wins dedup and a single `unnest` upsert under
`SET LOCAL synchronous_commit = off` — a heartbeat isn't worth an fsync. **33 commits/s → 0.5.**
`pingTelemetry` enqueues and returns 202 with zero DB latency in the request path.

For the Track A event history: `pgx.CopyFrom` on the same cadence, **BRIN** index on the timestamp only,
and a **bounded channel that drops on overflow** — proctoring must never be able to stall the contest.

Admin telemetry today is ~1.5 MB every 10s per open tab (500 rows × full process arrays, all filtering
client-side). After the client change `running_processes` is always empty — drop the column from the
query and the type, add server-side `limit/offset/status/q`, return counts from SQL, poll at 15s and
pause on hidden tab. **~1.5 MB/10s → ~8 KB/15s.**

### B6. Lease reaper

No reaper exists. Any judge crash or restart mid-contest **permanently wedges every in-flight team** —
`HasActiveSubmission` sees `state='running'` forever, so every resubmit 409s for the rest of the
contest. With 8 workers, one restart wedges 8 teams instantly. The existing manual
`POST /admin/teams/:id/unstick` endpoint is evidence this has already happened.

`ReclaimExpiredLeases` (10s ticker) requeuing `state='running' AND lease_until < now()`, incrementing
the already-existing-but-never-used `attempts` column, failing to `IE` at 3. Plus `RenewLease` from
`RunBatch`'s `OnCase`, `ReleaseWorkerClaims` on graceful shutdown, and a lease check inside
`HasActiveSubmission` so a dead reaper can't permanently 409 a team.

### B7. Contest-day deployment

**nginx: yes** — and TLS is not the reason. Same-origin SSE, one port for the thin client (so the
server can move without reimaging laptops), slow-client absorption, and **an instant degradation lever
that needs no redeploy** (`return 503` on one location + `nginx -s reload`).

**TLS: no.** Air-gapped LAN, no CA, no way to trust a cert on 300 laptops; self-signed breaks the Tauri
webview and `EventSource`. Isolated VLAN, plain HTTP. Use nginx, not Caddy — Caddy's automatic HTTPS
will fight an air-gapped box.

systemd units for api/portal/admin. **First add `output: "standalone"` to
[admin-frontend/next.config.ts](admin-frontend/next.config.ts)** — it's missing, so the admin app can't
be built for deployment today.

> **systemd gotcha:** do **not** set `AllowedCPUs=` on the API service. It's a cgroup cpuset and
> `taskset` cannot escape one — sandboxes are children of the API process, so it would silently confine
> every sandbox to those cores regardless of `RUN_CPU_LIST`. Pin the _other_ services away instead.

Postgres tuning, WAL archiving, `pg_dump -Fc` every 5 min to disk + hourly to USB. **Run the restore
drill twice** — a week before and the morning of — and time it. Keep `synchronous_commit=on` globally;
turn it off per-transaction only in the telemetry batcher.

Host tuning: **CPU governor → `performance`** (one line, biggest source of timing variance — a core
ramping from 800MHz makes the first run 2–3× slower) and `swappiness=1` (a swapping sandbox produces
meaningless timings). **Do not** disable turbo or SMT — both cost capacity you need; measure variance
and widen time limits instead.

Degradation levers in a `contest_settings` table, cached in an `atomic.Value`: `submissions_enabled`,
`run_enabled`, `judge_paused`. Setting `run_enabled=false` hands the entire 13-slot pool to the judge —
emergency throughput doubling for the last 15 minutes.

`GET /api/v1/admin/status` as one JSON endpoint rendered as one dashboard card. **The number that
matters is `oldest_queued_age_seconds`** — >60s means the judge is falling behind; everything else is
diagnosis. Plus pool/limiter/SSE/batcher stats. ~150 lines. **Do not install Prometheus and Grafana on
an air-gapped box the week before the contest** — append JSONL to disk if you want post-hoc graphs.

### B8. Load test

Extend [backend/cmd/judgetest](backend/cmd/judgetest) with a session pool (seed accounts via the
existing `cmd/usertool` CSV path), submit/poll/stream/ping clients, and a `-variance` mode.

|     | Scenario                               | Pass criteria                                                                                                           |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| S1  | Steady state, 300 sessions, 10 min     | p95 `/run` < 4s, 503 < 1%, **zero IE**                                                                                  |
| S2  | Start herd — 500 logins in 30s         | all succeed < 20s, no 5xx                                                                                               |
| S3  | **Deadline rush** — 300 submits in 60s | **every submission terminal within 5 min**, zero stuck, zero wrong verdicts, leaderboard matches an independent recount |
| S4  | SIGKILL the API mid-S3                 | every `running` row requeued within 30s of restart, no team permanently 409'd                                           |
| S5  | Abuse cases concurrent with S1         | all 9 still pass, queue age < 30s during the fork bomb                                                                  |
| S6  | 300 SSE connections held 10 min        | zero sequence gaps, RSS growth < 200 MB                                                                                 |
| S7  | Telemetry soak 30 min                  | `n_dead_tup` < 5,000, admin payload < 50 KB                                                                             |
| S8  | Timed restore drill                    | full restore + verified checksums < 10 min                                                                              |
| S9  | Timing variance at concurrency 1/8/16  | CV < 10% (>20% → pin physical cores only)                                                                               |

S3 target is 1.7 submissions/s sustained; post-fix capacity is ~3.3/s. If missed, pull in order:
PCH → raise `RUN_MAX_CONCURRENT` if cores are idle → lower `RUN_RESERVE` → cut `RUN_CPU_SECONDS` →
reduce test counts → `run_enabled=false`.

---

## What NOT to do

- **No Redis.** The distributed state is one boolean per user and a token bucket. Postgres is already
  running, backed up, and understood. A second stateful service on an air-gapped box you can't Google
  fixes for is a liability.
- **No second node.** Post-fix capacity is ~3.3 submissions/s and ~26 runs/s against peak demand of
  ~1.7 and ~3.3. A second node buys a load balancer, sticky sessions, a distributed run lock, split
  telemetry, and a migration race. Keep a **cold spare** with an identical image and a tested restore —
  that's the right on-prem HA story, and S8 is what makes it real.
- **No local `/run` sidecar.** `competitor-frontend/src/lib/runner.ts` dispatches to
  `NEXT_PUBLIC_LOCAL_RUNNER_URL` (:8081) in desktop mode, but **nothing in this repo listens there** —
  it's a dead path. Shipping isolate + toolchains to contestant laptops isn't feasible cross-platform,
  and a runner they control is a security hole. Delete the dead branch; server-side `/run` has ample
  headroom after B1/B2.
- **No TLS, no Prometheus, no WebSockets, no kiosk mode, no keylogging, no screenshots.**
- **No auth caching yet.** Two DB queries per request sounds bad, but post-fix that's ~380 q/s against a
  pool sized for far more. A session cache adds revocation bugs for no measured gain — revisit only if
  S1 shows pool pressure.

---

## Phasing

| Phase | Work                                                                         | Effort    |
| ----- | ---------------------------------------------------------------------------- | --------- |
| **0** | **B0 correctness landmines** — blocks everything, corrupt leaderboard risk   | ~2h       |
| **1** | **Tauri capability spike** — prove a remote origin can invoke commands       | ~half day |
| **2** | Thin client (A2) + nginx same-origin (B3) — unblocks both tracks             | ~1d       |
| **3** | Compile-once (B1) + core budgeting & PCH (B2) — 5.5× then ~2× again          | ~1.5d     |
| **4** | Proctoring storage + submission gate (A4, A6) — enforcement before detection | ~1.5d     |
| **5** | Endpoint signals (A1) — **ports first**, then network, processes, foreground | ~2d       |
| **6** | Lease reaper (B6) + rate limiting (B4)                                       | ~1.5d     |
| **7** | Editor provenance (A3) + rule engine & risk (A5)                             | ~1.5d     |
| **8** | Telemetry ingest (B5) + admin review UI (A7) + privacy/consent (A8)          | ~2d       |
| **9** | Deployment (B7) + load test (B8)                                             | ~2d       |

Phases 0–2 are a hard dependency chain. Phase 1 is a spike, not a commitment — if the runtime capability
approach fails, fall back to the wildcard capability before building on top of it.

---

## Verification

Each phase has a gate; these are the ones that actually prove the design.

1. **Tauri remote origin (Phase 1).** Launch the client, point it at a LAN server URL, log in, and
   confirm `update_telemetry_auth` reaches Rust from the remote origin. If this fails, everything in
   Track A is blocked.
2. **Gate (Phase 4).** Kill the desktop app, wait 90s, submit → `423` with the proactive banner already
   showing. Restart the app → submission succeeds within 15s.
3. **Detection (Phase 5).** Install Ollama on a test machine of each OS; `ai.port.ollama` appears with
   `confirmed: true` within 60s. Start a plain dev server on :8080; confirm it does **not** produce a
   finding (the fingerprint false-positive control). Tether a phone; `net.internet` fires.
4. **Provenance (Phase 7).** Type a solution → `typed_chars` dominant. Paste one → `pasted_chars`
   dominant. Drag-drop text → `bulk_inserted_chars`. Switch language → `external_edits`, no phantom
   paste.
5. **End-to-end review (Phase 7).** A machine with Ollama running that submits a paste-only solution
   lands top of the review queue with a legible interleaved evidence timeline.
6. **Judge correctness (Phase 3).** Rejudge a known problem set before and after `RunBatch` and diff
   every verdict — the batch rewrite must not change a single one. Separately, point the judge at a
   problem with zero tests and confirm it now yields `IE`, not `AC`.
7. **Load (Phase 9).** S1–S9 above. S3 and S4 are the make-or-break pair.
8. **Restore drill (Phase 9).** Timed, on the spare box, twice.

Existing harnesses to reuse: `backend/internal/runner/runner_test.go`, `backend/cmd/judgetest`
(`runAbuseCases`), `backend/cmd/usertool` for bulk account seeding.
