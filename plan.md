# Competitive Programming Judge — Architecture, Capacity & Implementation Plan

## Context

The backend has a **good sandbox and no judge**. `backend/internal/runner/` (uncommitted on `feat/code-runner`) executes untrusted code in [isolate](https://github.com/ioi/isolate) correctly — meta files written outside the bind mount so user code can't forge verdicts, two-level admission control, box IDs doubling as a concurrency semaphore. That part is solid and stays.

Everything above it is missing:

- [judge.go:68](backend/internal/judge/judge.go#L68) — `judge.run()` returns `StatusPassed, "no test cases configured"`. It never calls the runner.
- [0001_auth.sql](backend/internal/db/migrations/0001_auth.sql) is the **only** migration. No `problems`, `test_cases`, `submissions`, or scores tables exist.
- Submissions live in a `map[string]Result` guarded by a mutex ([store.go](backend/internal/judge/store.go)) — lost on restart, unbounded, per-process.
- `POST/GET /api/v1/submissions` are **unauthenticated** and have no ownership check ([router.go](backend/internal/api/router.go)).
- `submitCode()` in [frontend/src/actions/code.ts](frontend/src/actions/code.ts) is mocked — it scores from a hash of the source.
- Runner limits are **global config only**. There is no per-request override, so "2s for Run, 4s per test for Submit" is not expressible today.
- `Result` has no verdict field: `ExitCode: -1` is overloaded for both TLE and compile-timeout, and `cgOOMKilled` is parsed in [meta.go](backend/internal/runner/meta.go) then ignored, so MLE surfaces as exit 137.

**Goal:** a durable, fair, horizontally-scalable judge for ~500 registered users (~150–200 concurrent), two modes — Run (own stdin, 2s) and Submit (10 hidden tests, 4s each, 1 point per passing test, all tests always run) — plus the host tuning that makes measured times reproducible enough to base verdicts on.

### Decisions taken from your answers

| Question | Answer | Consequence |
|---|---|---|
| Grading | 1 point per passing test, **run all 10** | No early exit. The 40s worst case per submission is real → this roughly doubles core demand vs. ICPC-style. Mitigated by a per-submission CPU budget (below). |
| Load | 500 registered, **150–200 concurrent** | Steady demand ~4 cores; deadline rush ~12. |
| Lifespan | **Ongoing platform** | Durable Postgres queue, real schema, authoring tooling, multi-node capable. |
| Hardware | Undecided | Sizing table below; recommendation is 16 physical cores / 32 GB. |

---

## Part 1 — The three questions you asked directly

### 1a. Should this be rewritten in another language? **No. Keep Go.**

Reason from where the CPU actually goes. Per submission the host burns ~15,000 ms: user code inside isolate plus one `g++`/`javac` invocation. The orchestrator's own work is ~11 process spawns, ~11 small file writes, ~11 streaming output comparisons, and a handful of SQL statements — single-digit milliseconds. A Rust or C++ rewrite would optimise **~0.05%** of total CPU.

Meanwhile Go's goroutine + bounded-channel model *is* the slot pool you need, `exec.CommandContext` is exactly how you drive and cancel `isolate`, and the existing integration already gets the subtle parts right. Rewriting costs weeks and buys nothing measurable. Spend that budget on the judge, the schema, and host tuning — those are where the real wins are.

### 1b. Where to deploy: **university bare-metal host, isolate on the host (not in a container)**

| Target | Verdict | Why |
|---|---|---|
| **Cloud Run** | ❌ Not usable for the judge | isolate needs `CAP_SYS_ADMIN`, mount/PID namespace creation, and a delegated writable cgroup v2 subtree. Cloud Run runs under gVisor with no privileged mode and no cgroup delegation — isolate cannot start. Even if it could, CPU is shared/throttled, so identical submissions get different times → **non-reproducible verdicts**, which is disqualifying for a contest. Add 40s+ requests billed per-request-CPU and cold starts. Fine for the Next.js frontend if you want it there; the Go API is better co-located with the judge. |
| **Cloud VM** | ⚠️ Workable with the right instance family | Avoid burstable/shared-core (`e2-*`, `t3`, `t4g`) — CPU steal makes timing noise. Use GCE `c3`/`c4-standard`, AWS `c7i` with dedicated tenancy or `*.metal`, or Hetzner **AX dedicated** (CCX dedicated-vCPU is acceptable value). Pin `--min-cpu-platform` on GCE so reboots don't move you between CPU generations. **The compromise you can't fix:** most cloud VMs won't let you disable turbo, so measured time drifts with host load. Widen limits to absorb it. |
| **Uni bare-metal server** | ✅ **Recommended** | Dedicated cores, no steal, and you can set the governor / disable turbo and HT in BIOS — the only way to make a 4s limit mean the same thing all contest. [provision-isolate.sh](backend/deploy/provision-isolate.sh) already targets exactly this. |
| Uni server, container only | ⚠️ Fallback | Needs `--privileged` + cgroup delegation. isolate's own manual discourages containers, and [backend/Dockerfile](backend/Dockerfile)'s header says so too: *"fine for development but not for production or for timing runs."* You also inherit whatever else the server runs. |

**Prerequisites to verify on the uni server before committing to it:**

```bash
stat -fc %T /sys/fs/cgroup          # must print: cgroup2fs
uname -r                            # kernel >= 5.x
nproc; lscpu | grep -E 'Socket|Thread|Model name'
grep -E 'constant_tsc|nonstop_tsc' /proc/cpuinfo | head -1   # invariant TSC
sudo -v                             # root/sudo available
```

**Design horizontal, deploy vertical.** Build on a Postgres-backed queue (Part 4) so judge workers are stateless pullers. Adding a second judge node mid-contest is then: provision the host with `provision-isolate.sh`, point `DATABASE_URL` at the same DB, start with judging enabled. Zero code change. Sessions are already Postgres-backed with hashed tokens ([session.go](backend/internal/session/session.go)), so `/run` can be load-balanced across nodes with no sticky sessions.

### 1c. How much power: **16 physical cores, 32 GB RAM, NVMe**

Full derivation and the 8/16/32 table are in Part 2.

---

## Part 2 — Capacity math

### Assumptions (change these and the numbers move)

| Parameter | Value |
|---|---|
| Concurrent users | 150 typical, 200 peak |
| Contest length | 3 h |
| Runs per user per hour | 12 (one every 5 min) |
| Submits per user per hour | 4 |
| Deadline-rush multiplier | 3× on submits, 2× on runs, sustained ~15 min |

### Cost per operation (CPU-seconds)

Compile dominates a *fast correct* solution — worth internalising: `g++ -O2` on a typical contest solution is 1.0–1.5 CPU-s, while the solution itself runs in 50 ms.

| Operation | Cost |
|---|---|
| Run (compile ~1.0 + exec, 2s cap) | **~1.5** avg, 3.0 worst |
| Submit — AC or fast-WA | 1.0 + 10 × 0.25 = **3.5** |
| Submit — partial TLE (4 fast tests, 6 time out) | 1.0 + 4×0.3 + 6×4 = **26** |
| Submit — full TLE | 1.0 + 10×4 = **41** |

Verdict mix (moderate / pessimistic): 60/45 % fast, 25/35 % partial TLE, 15/20 % full TLE
→ **weighted average submit = ~15 CPU-s (moderate), ~19 (pessimistic)**

### Demand

```
runs/s    = users × 12 / 3600
submits/s = users × 4  / 3600
cores     = runs/s × 1.5 + submits/s × 15
```

| Scenario | runs/s | submits/s | Cores |
|---|---|---|---|
| 150 concurrent, steady | 0.50 | 0.167 | **3.3** |
| 200 concurrent, steady | 0.67 | 0.222 | **4.3** |
| 200 concurrent, deadline rush | 1.33 | 0.667 | **12.0** |

Plus non-judge load: Postgres ~1, Go API ~0.5, Next.js SSR ~1, OS ~0.5 → **~3 cores reserved**.

### Sizing table

`ρ` = submit-pool utilisation during the 15-min rush. `ρ > 1` means the queue grows; the backlog then drains after the deadline.

| Physical cores | Reserved | Judge slots (run / submit) | ρ at rush | Rush backlog | Drain after deadline | First thing to break |
|---|---|---|---|---|---|---|
| **8** | 2 | 6 (2 / 4) | 2.5 | ~360 subs | **~18 min** | Submit queue wait; users see minutes-long waits at the deadline |
| **16** ✅ | 4 | 12 (4 / 8) | 1.25 | ~120 subs | **~4 min** | Nothing — comfortable, room to grow to ~300 concurrent |
| **32** | 4 | 28 (8 / 20) | 0.50 | 0 | none | Postgres connections / API before the judge |

**Recommendation: 16 physical cores.** 8 works but the deadline rush is visibly painful. 32 is only worth it if you expect to grow past ~300 concurrent.

### Sensitivity — the assumption that actually decides the hardware

Everything above rests on **submits per user per hour**. It is by far the most load-bearing assumption and the one you should measure rather than trust:

| Concurrent | Submits/user/h | Steady cores | Rush cores | Verdict |
|---|---|---|---|---|
| 150 | 4 | 3.3 | 10 | 16 cores comfortable |
| **200** | **4** | **4.3** | **12** | **16 cores — the recommendation** |
| 350 | 5 | 9.1 | 27 | 32 cores, or two 16-core nodes |
| 500 | 7 | 17 | 50 | 3–4 nodes. Do not assume this without measuring. |

A 3.5× move in that one number is a 5× move in hardware. Two things bound the damage, and both should be in from day one:

1. **The SQL throttle (max 1 in-flight submission per user)** makes arrival self-limiting. Peak queue depth can never exceed the number of active users, and no single user can queue 50 jobs during the rush. This converts an unbounded spike into a bounded, drainable backlog.
2. **The per-submission CPU budget** caps the tail at 20 CPU-s regardless of how pathological the submission is.

With both, an under-provisioned judge degrades into *longer queue waits* — annoying but fair and recoverable — rather than falling over. Get the Phase 5 load test done before the contest and replace these estimates with measurements.

**Highest-leverage knob given "run all 10 tests": a per-submission total CPU budget.** Cap cumulative CPU at ~20 s; once exceeded, mark the remaining tests `TLE` without executing them. The user still sees a full 10-row per-test table and the scoring semantics are unchanged for anything that could plausibly score, but the 41 CPU-s tail collapses to 20, dropping the weighted average from ~15 to ~11 CPU-s — about a 25% capacity gain. Make it a config knob (`JUDGE_SUBMISSION_CPU_BUDGET_SECONDS`, default 20, `0` = unlimited). Caveat to state in the UI: if tests are not ordered by size, a solution could in principle be cut off before a test it would have passed — order tests smallest-first when authoring.

### RAM

| Consumer | Budget |
|---|---|
| 12 judge slots × ~1 GB peak | 12 GB |
| Postgres | 4 GB |
| Go API + judge workers | 1 GB |
| Next.js | 1 GB |
| OS + page cache | 4 GB |
| **Total** | **~22 GB → provision 32 GB** (16 GB minimum) |

Per-slot peak is ~1 GB, not the 256 MB runtime limit: `g++` on template-heavy C++ reaches 500 MB–1 GB, `javac` ~400 MB, and a JVM with `-Xmx256m` has ~500 MB RSS. **This is a live bug** — compile currently shares the run's `--cg-mem` (256 MB), so a legitimate heavy compile gets OOM-killed. Fixed in Part 3.

### Disk & network

- **tmpfs for isolate's `box_root`** — worth it. Put `/var/local/lib/isolate` on tmpfs (size ~2 GB for 12 boxes): compile temp files and test I/O never touch disk, removing the only disk-latency source from the timed path. Bounded already by `--fsize=16384` per file.
- **NVMe** for Postgres and submission code storage. Volume is small (500 users × ~50 submissions × ~5 KB ≈ 125 MB of code; test data ~10 MB per problem).
- **Network: negligible.** Peak is ~200 poll requests/s of single-row JSON. Not a factor at any tier.

---

## Part 3 — Core & thread utilisation (the parallelism design)

### The slot model

One judge slot = **one dedicated physical core** = one fixed isolate box ID. Slots are created at startup and never move:

```
slot i → core (reserved + i) → isolate box ID i
```

Fixed rather than dynamic assignment because it gives cache-warm, migration-free execution and makes timing reproducible per slot.

### Pinning: `taskset` wrapping isolate

CPU affinity is inherited across `fork`/`exec`, so pinning the `isolate` process pins the user program and every child it spawns. In [runner.go:307](backend/internal/runner/runner.go#L307), `execBox` currently does:

```go
runErr := exec.CommandContext(ctx, r.cfg.IsolateBin, args...).Run()
```

Change to prepend the affinity wrapper:

```go
runErr := exec.CommandContext(ctx, "taskset",
    append([]string{"-c", strconv.Itoa(slot.core), r.cfg.IsolateBin}, args...)...).Run()
```

Two things this buys beyond reproducibility:

1. **A multithreaded solution can no longer steal other slots' cores.** isolate's `--time` already accounts CPU across the whole cgroup (so a 12-thread program burns its budget 12× faster and gets killed), but without pinning it degrades every *other* concurrent submission's timing on the way there. Pinning contains it.
2. Compile is single-threaded anyway (`g++`, `javac`), so pinning costs nothing there.

Alternative if `taskset` proves awkward: set `cpuset.cpus` on the per-box cgroup under isolate's `cg_root`. Prefer `taskset` — it's a one-line change and needs no cgroup writes from the Go process.

### Hyperthreading: use physical cores only

Treating both SMT siblings as independent judge slots makes measured runtime depend on whether the sibling happens to be busy — the same code can vary 30–40% and flip a TLE verdict. For a judge, reproducibility beats throughput.

- **Preferred:** disable HT in BIOS. Simplest, nothing to get wrong.
- **If you can't:** map slots to physical cores only and leave siblings idle. Get the mapping with `lscpu -p=CPU,CORE | grep -v '^#'` and take the first CPU per distinct CORE.
- Throughput sacrificed: ~20–30% on compile-heavy work. Accept it.

### Frequency scaling and turbo: pin the clock

A verdict depends on measured time, so the CPU must run at the same frequency whether one submission or twelve are in flight. Otherwise a lone submission gets turbo (say 4.8 GHz) while the deadline rush runs at base (3.2 GHz) — a **1.5× swing on the same code**, i.e. a TLE that depends on how busy the judge is.

```bash
cpupower frequency-set -g performance

# Intel p-state:
echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo
# acpi-cpufreq / AMD:
echo 0 | sudo tee /sys/devices/system/cpu/cpufreq/boost
```

Verify under load with `turbostat` or `grep MHz /proc/cpuinfo` that the frequency is flat.

### Reserving cores for the system

Untrusted code must never compete with the API that has to answer `/healthz` and `/run`. Reserve cores `0..R-1` (R = 2 on 8-core, 4 on 16-core):

```ini
# /etc/systemd/system.conf.d/cpuaffinity.conf
[Manager]
CPUAffinity=0-3
```

Strongest option — kernel won't schedule anything on judge cores by default, while `taskset` still places work there explicitly:

```
# kernel cmdline
isolcpus=4-15 nohz_full=4-15 rcu_nocbs=4-15
```

Postgres and the Go binary inherit the system affinity; only `taskset`-wrapped isolate calls reach cores 4–15.

**NUMA:** if dual-socket, confine all judge slots to one socket's cores (or partition slots per socket and pick a slot on the local node) so cross-socket memory latency doesn't add variance. Check with `lscpu | grep NUMA`.

### Two-tier pool: Run vs Submit

If both modes draw from one pool, a deadline rush of 40s submissions occupies every slot and **every interactive Run times out waiting**. That is the single most likely contest-day failure. Split the pool with an asymmetric borrowing rule:

- **Run may take any free slot.** A run holds a slot ~2s, so letting it borrow a submit slot delays submissions negligibly and protects the latency users actually feel.
- **Submit may only take a slot while at least `runReserve` slots stay free.** Long holds must never squeeze out interactive work.

Exact implementation (no `len(chan)` races) — extend [limiter.go](backend/internal/runner/limiter.go):

```go
type slot struct {
    boxID int
    core  int
}

type pool struct {
    free      chan slot     // cap N; the box-ID/core allocator, as today
    submitCap chan struct{} // cap N - runReserve; bounds concurrent submits
    admitRun    chan struct{} // cap N + MaxQueue      (existing overflow rejection)
    admitSubmit chan struct{} // cap submitCap + MaxQueue
    maxWait   time.Duration
}

func (p *pool) acquireRun(ctx context.Context) (slot, func(), error)
func (p *pool) acquireSubmit(ctx context.Context) (slot, func(), error) // submitCap, then free
```

Because `submitCap` has capacity `N - runReserve`, at least `runReserve` slots are always reachable by a Run. Keep the existing non-blocking `admit` overflow → instant `ErrBusy` → HTTP 503; that design is right and stays.

**Batch capacity should equal `JUDGE_WORKERS`, and the batch wait-queue should be zero-length.** The durable Postgres queue (Part 4) *is* the submit queue. A worker holds exactly one slot for an entire submission, so if `submitCap == JUDGE_WORKERS` then `acquireSubmit` never actually blocks and there is no second queue to reason about. Workers become the single throughput knob.

Sizing on 16 cores: `N = 12`, `JUDGE_WORKERS = 8` → `submitCap = 8`, so runs are guaranteed ≥4 slots and may use all 12 when submits are idle.

This is deliberately **work-conserving** rather than a strict box-ID partition. A strict partition also gives hard isolation and is slightly simpler, but because slots are pinned 1:1 to cores (above), an idle run partition means **idle cores** during exactly the submit-heavy rush where you need them. The `submitCap` semaphore gives the same hard guarantee — at most `N - runReserve` submits in flight, so `runReserve` slots are always reachable by a run — without needing priority-aware handoff on release, which a plain channel can't express. Runs win the contested slot automatically: when a slot returns to `free` and `submitCap` is exhausted, only a run waiter can take it.

### Per-submission execution strategy

**Compile once, then execute each test in a fresh box.**

- A `Session` holds one slot for its whole lifetime (compile + 10 tests) so every test of a submission runs on the same cache-warm core. Inherent cost: a slot is held up to ~40s.
- The compiled artifact lives in a host directory **outside** any box. Each test does `--cleanup` + `--init`, then mounts the artifact **read-only** at `/sandbox` and a fresh writable scratch dir at `/work` with `--chdir=/work`. Run `/sandbox/main`, or `java -cp /sandbox Main`.
- Cost: ~10–20 ms per test, i.e. **~0.5% of a 4000 ms budget**. Buys full isolation — no state carried between tests, no chance for user code to detect which test it's on or tamper with a later one. Take the isolation.

**Never parallelise the 10 tests of one submission across cores.** It doesn't reduce total CPU (only latency), it multiplies a single user's footprint by 10 during a rush, and concurrent siblings perturb each other's measured time. Sequential is both fairer and simpler; the async + polling UI (Part 5) makes the latency a non-issue.

### Deliverable: extend `provision-isolate.sh` with a tuning section

[provision-isolate.sh](backend/deploy/provision-isolate.sh) currently installs toolchains, builds isolate, writes `/usr/local/etc/isolate`, and enables `isolate.service`. It does **none** of the tuning above — so today a freshly provisioned host has turbo on, HT on, swap on, no core reservation, and `box_root` on disk. Every fairness property in this section is therefore unimplemented. Add a `tune_host()` step (or a companion `deploy/tune-host.sh` so it can be re-run independently) covering: governor + turbo off, swap off, THP `madvise`, tmpfs for `box_root`, systemd `CPUAffinity`, and a verification block that prints the resulting state.

Note `num_boxes` already defaults to **16** in the script, which matches the recommended `N=12` plus 4 spares exactly — no change needed there.

The tmpfs mount is a one-line `/etc/fstab` addition against the `box_root` the script writes:

```
tmpfs /var/local/lib/isolate tmpfs rw,size=2G,mode=755 0 0
```

### isolate / host tuning

| Knob | Setting | Why |
|---|---|---|
| `num_boxes` | `N + 4` | `CheckHost` needs the highest ID to exist, plus spares for a box left dirty by a crash |
| `--cg-mem` (run) | problem's `memory_limit_mb` | Per-problem, not global |
| `--cg-mem` (compile) | **1 GB, separate knob** | 256 MB OOM-kills legitimate heavy compiles today |
| `--processes` | 128 (as now) | JVM threads need well above isolate's default of 1 |
| `--open-files` | 256 (as now) | JVM exhausts the default 64 at startup |
| **Swap** | **OFF** — `swapoff -a`, remove from `/etc/fstab`, and `memory.swap.max=0` on the isolate cgroup | With swap, a memory hog swaps instead of being OOM-killed: timing becomes meaningless and one submission thrashes the whole host |
| THP | `enabled=madvise`, `defrag=never` | THP defrag stalls can reach hundreds of ms — significant against a 2s Run limit |
| `vm.overcommit_memory` | `0` (default) | cgroup limits do the enforcement; strict overcommit would fail legitimate JVM reservations |
| Clocksource | `tsc` | `cat /sys/devices/system/clocksource/clocksource0/current_clocksource`; non-invariant TSC (common on VMs) makes wall-time jitter |
| CPU accounting | keep `--cg` | CPU time is summed across the whole cgroup, so multi-threaded and multi-process submissions are charged correctly. Confirm current flag names with `isolate --help` on the provisioned host — 2.x changed some timing flags. |

---

## Part 4 — Durable queue (replaces the in-memory channel)

`chan Submission` + `map[string]Result` loses every in-flight and completed submission on restart, and can't span machines. Replace with a Postgres queue using `FOR UPDATE SKIP LOCKED`.

**Why Postgres and not Redis/NATS:** the load is <1 submission/s — four orders of magnitude below what a Postgres queue handles. Postgres is already a dependency, gives durability for free (a crash mid-contest must not lose submissions), keeps submission state and queue state in one transaction, and supports multi-node workers out of the box. Adding a broker would be exactly the speculative abstraction [AGENT.md](AGENT.md) forbids.

**Claim** (atomic, contention-free across any number of workers on any number of machines):

```sql
-- name: ClaimSubmission :one
UPDATE submissions SET
    state = 'running', claimed_at = now(), claimed_by = $1,
    lease_until = now() + $2::interval, attempts = attempts + 1
WHERE id = (
    SELECT id FROM submissions WHERE state = 'queued'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING *;
```

**Lease + reaper** — a worker extends `lease_until` every 5 s while judging (lease = 2× worst-case submission time, ~120 s). A separate goroutine requeues abandoned work:

```sql
-- name: RequeueExpiredLeases :execrows
UPDATE submissions SET state = 'queued', claimed_by = NULL, lease_until = NULL
WHERE state = 'running' AND lease_until < now() AND attempts < 3;

-- name: FailExhaustedSubmissions :execrows
UPDATE submissions SET state = 'error', verdict = 'IE', finished_at = now()
WHERE state = 'running' AND lease_until < now() AND attempts >= 3;
```

A judge node dying mid-submission therefore costs one requeue, not a lost submission. Workers poll every ~500 ms when idle (cheap: one indexed query against a partial index) — good enough at this rate, and avoids `LISTEN/NOTIFY`, which would need a dedicated connection outside `pgxpool` to shave ≤500 ms off a job that takes seconds.

Three details that make this actually safe:

- **`attempts` is incremented at claim time, not on failure.** A submission that kills a worker three times lands on `state='error', verdict='IE'` instead of poisoning the queue forever.
- **Finalize in one transaction**: the submission row, all 10 `submission_tests` rows, and the conditional `problem_scores` bump commit together. That makes a retry after partial work idempotent — buffer the per-test results in memory (10 small rows) and write once.
- **Graceful shutdown must release claims.** [main.go:52](backend/cmd/server/main.go#L52) currently does `go j.Start(ctx)` and never joins it, so SIGTERM exits mid-grade and the submission waits out its full lease. Join the judge (`errgroup`) and run `UPDATE submissions SET state='queued', claimed_by=NULL WHERE claimed_by=$1 AND state='running'` on the way out.

**Second node mid-contest:** run the *same binary* on machine B with the same `DATABASE_URL`. Workers identify themselves as `claimed_by = hostname:pid`, claim via `SKIP LOCKED`, and box IDs are per-host — nothing to coordinate. Only host-local knobs differ (`JUDGE_WORKERS`, slot count ≤ that host's `num_boxes`).

---

## Part 5 — Implementation

### Schema — `backend/internal/db/migrations/0002_judge.sql`

Following the style of [0001_auth.sql](backend/internal/db/migrations/0001_auth.sql).

```sql
-- +goose Up
CREATE TABLE problems (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    difficulty      TEXT NOT NULL,
    statement       TEXT NOT NULL,
    constraints     TEXT NOT NULL DEFAULT '',
    time_limit_ms   INTEGER NOT NULL DEFAULT 4000,
    memory_limit_mb INTEGER NOT NULL DEFAULT 256,
    max_score       INTEGER NOT NULL,
    published       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE problem_samples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    input       TEXT NOT NULL,
    output      TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    UNIQUE (problem_id, ordinal)
);

-- Hidden grading tests. No competitor-facing endpoint may ever select these.
CREATE TABLE problem_tests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id   UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    input        BYTEA NOT NULL,
    expected     BYTEA NOT NULL,
    input_sha    TEXT NOT NULL,   -- keys the per-host disk cache
    expected_sha TEXT NOT NULL,
    points       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (problem_id, ordinal)
);

CREATE TABLE submissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id    UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language      TEXT NOT NULL,
    code          TEXT NOT NULL,
    state         TEXT NOT NULL DEFAULT 'queued',
    verdict       TEXT,
    score         INTEGER NOT NULL DEFAULT 0,
    max_score     INTEGER NOT NULL,
    tests_total   INTEGER NOT NULL,
    tests_done    INTEGER NOT NULL DEFAULT 0,
    compile_error TEXT,
    max_time_ms   INTEGER NOT NULL DEFAULT 0,
    max_memory_kb INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at    TIMESTAMPTZ,
    claimed_by    TEXT,
    lease_until   TIMESTAMPTZ,
    attempts      INTEGER NOT NULL DEFAULT 0,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX idx_submissions_queued ON submissions (created_at) WHERE state = 'queued';
CREATE INDEX idx_submissions_lease  ON submissions (lease_until) WHERE state = 'running';
CREATE INDEX idx_submissions_user   ON submissions (user_id, problem_id, created_at DESC);

CREATE TABLE submission_tests (
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    ordinal       INTEGER NOT NULL,
    verdict       TEXT NOT NULL,
    time_ms       INTEGER NOT NULL,
    memory_kb     INTEGER NOT NULL,
    points        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (submission_id, ordinal)
);

CREATE TABLE problem_scores (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id         UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    best_score         INTEGER NOT NULL,
    best_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, problem_id)
);

-- +goose Down
DROP TABLE problem_scores;
DROP TABLE submission_tests;
DROP TABLE submissions;
DROP TABLE problem_tests;
DROP TABLE problem_samples;
DROP TABLE problems;
```

- **Test data in `BYTEA` as source of truth, plus a sha-keyed disk cache per judge host.** One backup, one place to edit, and a second judge machine gets the data for free — no rsync/NFS/object store. But **pgx cannot stream `bytea`**: a plain `SELECT expected` materialises the whole blob as `[]byte`, which would quietly defeat the streaming checker above. So the worker writes each blob **once** to `JUDGE_TESTDATA_DIR/<sha>.in|.out` (`backend/internal/judge/testdata.go`) and every later submission streams from disk. Add `input_sha`/`expected_sha` columns to key the cache, and cap sizes at `JUDGE_MAX_TESTCASE_BYTES` (64 MB) in the import tool.
- **Avoid nullable `UUID` columns entirely in this schema.** [sqlc.yaml](backend/sqlc.yaml) overrides `uuid → string` *unconditionally*, so a nullable UUID generates a non-nullable Go `string` and silently breaks NULL handling. Nullable `INT` is fine (`*int32`).
- **Leaderboard is a plain aggregate over `problem_scores`**, not a materialized view: 500 users × ~10 problems = 5,000 rows, sub-millisecond. `SUM(best_score)` ordered by total desc, then earliest `updated_at` as the tiebreak.
- Queries go in `backend/internal/db/queries/{problems,submissions,leaderboard}.sql` following the `-- name: X :one|:many|:exec` convention in [sessions.sql](backend/internal/db/queries/sessions.sql); regenerate with `make generate`.

### Runner changes — `backend/internal/runner/`

**Per-request limits.** Add to `Request`, defaulting to `Config` when zero:

```go
type Limits struct {
    CPUSeconds      float64       // isolate accepts fractional --time
    Wall            time.Duration
    MemoryKB        int64
    CompileTimeout  time.Duration
    CompileMemoryKB int64         // NEW: separate from run memory
}

type Request struct {
    Language string
    Code     string
    Stdin    string
    Limits   Limits
}
```

`execOpts.cpuSeconds` becomes `float64` and is rendered with the existing `formatSeconds`.

Also make `fsizeKB` a config field rather than a const ([runner.go:40](backend/internal/runner/runner.go#L40)) — a problem with legitimately large output needs to raise it.

**Language factors, applied as multiply-then-clamp.** A 4s C++ limit is unachievable in Python. The clean formulation: the problem author sets the **C++-fair base** (`problems.time_limit_ms`), the runner multiplies by the language factor, and clamps to the pool ceiling. Your "4s max per test" is then honoured as the *hard ceiling after the multiplier*, so worst case per submission stays 10 × 4s regardless of language.

| | Base | ×factor | Ceiling | cpp | python |
|---|---|---|---|---|---|
| Run | fixed 2000 ms | — | 2 s | 2 s | 2 s |
| Submit per test | `time_limit_ms` (e.g. 1000) | 1.0 / 2.0 / 3.0 | **4 s** | 1 s | 3 s |

```go
type spec struct {
    filename      string
    compileCmd    []string
    runCmd        []string
    timeFactor    float64 // cpp 1.0, java 2.0, python 3.0
    memoryBonusKB int64   // interpreter/VM overhead granted on top of the problem's limit
}
```

`memoryBonusKB` (java +128 MB, python +64 MB, cpp 0) exists because otherwise the JVM's metaspace and thread stacks trip the cgroup limit and produce a **bogus MLE** on a solution that is well within its heap budget. Semantics: the contestant gets `memory_limit_mb` of *heap*; `--cg-mem` is set to `memoryKB + memoryBonusKB`.

For Java's hardcoded `-Xmx256m` ([runner.go:89](backend/internal/runner/runner.go#L89)), a one-token substitution is enough — no need to turn `runCmd` into a function:

```go
const memPlaceholder = "{mem}" // resolved to the request's heap size in MB
"java": {runCmd: []string{"java", "-XX:+UseSerialGC", "-Xmx" + memPlaceholder + "m", "Main"}, ...}
```

**`execOpts.cpuSeconds` must become a `time.Duration`, not an `int`.** [runner.go:292](backend/internal/runner/runner.go#L292) does `strconv.Itoa(opts.cpuSeconds)`, but a 1000 ms base × 3.0 is fractional and isolate's `--time` takes float seconds. Render with the existing `formatSeconds`.

**Replace `OverallTimeout()` with `Deadline(pool, limits)`** that *includes* queue wait — `MaxWait + CompileTimeout + wall + 5s`. That is the actual fix for bug 2 below: the current 30s budget omits the 15s a request may spend waiting for a slot.

**Verdict model** (`backend/internal/runner/verdict.go`):

```go
type Verdict string

const (
    VerdictAC  Verdict = "AC"
    VerdictWA  Verdict = "WA"
    VerdictTLE Verdict = "TLE"
    VerdictMLE Verdict = "MLE"
    VerdictRE  Verdict = "RE"
    VerdictCE  Verdict = "CE"
    VerdictOLE Verdict = "OLE"
    VerdictIE  Verdict = "IE"
)
```

Mapping from `meta`, as a method `func (m meta) verdict(memLimitKB int64) Verdict` — **order matters**, because a cgroup OOM kill arrives as `status=SG, exitsig=9`, which today's `exitCodeOrSignal` flattens into a plain 137:

1. `cgOOMKilled` → **MLE** (the currently-ignored field earns its keep)
2. `statusTimedOut` → TLE
3. `statusInternal` → IE
4. `statusSignalled` + `exitsig == 25` (SIGXFSZ, hit `--fsize`) → OLE
5. `statusSignalled` or `statusRuntimeError` → **check for a graceful OOM first**: Python's `MemoryError` and Java's `OutOfMemoryError` exit non-zero *without* a cgroup kill, so a peak `cg-mem` at ≥95% of the limit means MLE, not RE. Without this, every out-of-memory Python solution is reported as a mysterious runtime error.
6. otherwise → AC (ran to completion, exit 0 — says nothing about correctness; WA is the judge's call)

Add a ninth value `VerdictSkipped "SK"` for tests not executed because the per-submission CPU budget was exhausted.

**`parseMeta` must also read two keys it currently ignores** ([meta.go:56-69](backend/internal/runner/meta.go#L56-L69) handles only `status`, `message`, `exitcode`, `exitsig`, `time-wall`, `cg-oom-killed`):

- **`time`** — CPU seconds. The judged and displayed time should be **CPU** time, because `--time` is what the limit enforces. Today `TimeMs` comes from `time-wall` ([runner.go:236](backend/internal/runner/runner.go#L236)), so a program that blocks on I/O displays a large time it was never charged for, and two runs of the same code differ by scheduler noise. Report CPU time as the graded number and keep wall as a separate field for the TLE-by-wall-backstop case.
- **`cg-mem`** — peak cgroup memory, needed for MLE reporting and the per-test memory column.

**Also reconsider `--extra-time=1`** ([runner.go:293](backend/internal/runner/runner.go#L293)). On a 4s limit, the grace second means a full-TLE submission actually burns 10 × 5 = 50 CPU-s, not 40 — a 25% larger tail than the capacity math above assumes. Dropping it to `0.5` recovers most of that at no fairness cost.

**Session API for grading** — compile once, execute many:

```go
func (r *Runner) NewSession(ctx context.Context, req Request, kind Kind) (*Session, CompileResult, error)
func (s *Session) Exec(ctx context.Context, stdin []byte) (ExecResult, error)
func (s *Session) Close()
```

`kind` selects `acquireRun` vs `acquireSubmit`. `Run()` stays as-is for the interactive path.

**Output checker** (`backend/internal/judge/checker.go`) — token comparison, whitespace- and trailing-newline-tolerant, streaming from the output file against the expected `[]byte`.

> ⚠️ Do **not** use `readCapped` for grading. Its 128 KB cap would silently false-WA any problem with larger output. That function is for showing output to a human; grading needs a full streaming compare.

### API changes — `backend/internal/api/`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/problems` | user | Published only; never joins `problem_tests` |
| GET | `/api/v1/problems/:slug` | user | Statement + samples only |
| POST | `/api/v1/run` | user | Existing; add `problemId` to derive limits, add `verdict` + `memoryKb` to the response |
| POST | `/api/v1/problems/:slug/submissions` | user | → `202 {id}` |
| GET | `/api/v1/submissions/:id` | user + **owner or admin** | state, verdict, score, `testsDone/testsTotal`, per-test rows, `queuePosition` |
| GET | `/api/v1/submissions` | user | Own history, `?problemId=` filter |
| GET | `/api/v1/leaderboard` | user | Ranked totals |
| POST/PATCH | `/api/v1/admin/problems` | admin | |
| PUT | `/api/v1/admin/problems/:slug/tests` | admin | |

Two details:

- `GET /submissions/:id` for someone else's submission returns **404, not 403**, so submission IDs aren't enumerable.
- **Throttle in SQL, not middleware.** Reject with 429 when `SELECT COUNT(*) FROM submissions WHERE user_id=$1 AND state IN ('queued','running') >= 1`, plus a ~5–10 s cooldown since the user's last submission. This is better than an in-process token bucket because it is correct across multiple nodes and it directly prevents one user queueing 50 jobs during the deadline rush — the actual failure mode. Keep a 2 MB `http.MaxBytesReader` middleware as well, since `ShouldBindJSON` buffers the entire body *before* [run.go:33](backend/internal/api/run.go#L33) checks lengths.

### Problem authoring — `backend/cmd/problemtool`

Follow the existing [cmd/usertool](backend/cmd/usertool/main.go) pattern rather than building an authoring UI now:

```
problems/range-sum/
  problem.yaml     # slug, title, difficulty, timeLimitMs, memoryLimitMb
  statement.md
  samples/1.in 1.out
  tests/01.in 01.out … 10.in 10.out    # order smallest-first
```

Upsert keyed by `slug`; tests replaced `DELETE`+`INSERT` in **one transaction** so a problem is never half-imported. Git-reviewable, deterministic, no UI to build.

```
problemtool -dir problems/range-sum          # idempotent upsert
problemtool -dir problems -all
problemtool -dir problems/range-sum -publish
problemtool -list                            # slug, tests, published, submission count
problemtool -rejudge range-sum               # requeue every submission — for a bad test found mid-contest
```

`-rejudge` matters: with 500 users you *will* discover a wrong expected output during the contest, and re-grading has to be one command, not a manual `UPDATE`. Guard test replacement behind `-force` once a problem has submissions, and print each test's sha256 + byte count so organizers can diff what's live against the repo. YAML via `github.com/goccy/go-yaml`, already in the module graph as an indirect dep of gin — `go mod tidy` just promotes it, no new download.

Seed the three problems currently hardcoded in [frontend/src/lib/problems.ts](frontend/src/lib/problems.ts) as the first `problems/` entries; that's also the migration path for deleting that file.

### Frontend — `frontend/`

> First read the relevant guide under `node_modules/next/dist/docs/` — [frontend/AGENTS.md](frontend/AGENTS.md) warns this Next.js 16 differs from training data.

- **`src/types/code.ts`** — replace `SubtaskResult`/`SubmitResult` (subtask-shaped) with per-test shapes matching 1-point-per-test:

```ts
export type Verdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "OLE" | "IE";

export type TestResult = {
  ordinal: number; verdict: Verdict; timeMs: number; memoryKb: number; points: number;
};

export type Submission = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  verdict?: Verdict;
  score: number; maxScore: number;
  testsDone: number; testsTotal: number;
  compileError?: string;
  tests: TestResult[];
  queuePosition?: number;
};
```

- **`src/actions/code.ts`** — delete the mocked `submitCode()` and its `codeQuality()` hash heuristic; POST and return the id.
- **Polling, not SSE.** Add a client-callable route handler (`src/app/api/submissions/[id]/route.ts`) that proxies with the session cookie; poll ~1 s while `state` is `queued`/`running`, backing off to 2 s after 15 s. At 200 concurrent that's ~200 rps of single-row indexed reads — trivial for Postgres, and it avoids holding long-lived connections through the Next.js BFF. Revisit only if metrics say so.
- Show live progress from `testsDone` ("running test 4/10") and `queuePosition` while queued — important UX, since a full-TLE submission legitimately takes ~45 s.
- Replace hardcoded `src/lib/problems.ts` and mocked `src/lib/challenges.ts` progress with API data; drop the `localStorage` best-score in `code-workspace.tsx` in favour of `problem_scores`.
- Implement the `/submissions` and `/leaderboard` pages (currently literal "not implemented yet" placeholders).

### Bugs to fix along the way

| # | Issue | Location |
|---|---|---|
| 1 | `/submissions` unauthenticated, no ownership check | [router.go](backend/internal/api/router.go) |
| 2 | Handler ctx (30 s) minus `MaxWait` (15 s) < compile(10)+run(11) → generic 500 instead of a verdict. Acquire the slot on a separate context, then derive the execution deadline | [run.go](backend/internal/api/run.go), [runner.go:161](backend/internal/runner/runner.go#L161) |
| 3 | `MaxWait=0` → `context.WithTimeout(ctx, 0)` is already expired → every queued request instantly `ErrBusy` | [limiter.go](backend/internal/runner/limiter.go) |
| 4 | `cgOOMKilled` parsed but never used → MLE looks like exit 137 | [meta.go](backend/internal/runner/meta.go) |
| 5 | Compile shares the run's 256 MB `--cg-mem` → heavy compiles OOM | [runner.go:284](backend/internal/runner/runner.go#L284) |
| 6 | `-Xmx256m` hardcoded, diverges from the configurable memory limit | [runner.go:89](backend/internal/runner/runner.go#L89) |
| 7 | `CheckHost` inits box `MaxConcurrent-1`; a box left dirty by a crash blocks boot | [runner.go:150](backend/internal/runner/runner.go#L150) |
| 8 | `DeleteExpiredSessions` exists but is never called; the table grows with 500 users × 7-day TTL | [session.go](backend/internal/session/session.go) |
| 9 | Compile stdout discarded (only `compile.err` read); compile failures report `TimeMs: 0` | [runner.go:221](backend/internal/runner/runner.go#L221) |
| 10 | `.env.example` documents the removed `RUN_DOCKER_RUNTIME`; README API table omits auth/admin/`/run` | `backend/.env.example`, `README.md` |
| 11 | `backend/docker/judge/{cpp,java,python}` are dead rollback artifacts | delete once isolate is validated |
| 12 | `go j.Start(ctx)` is never joined → SIGTERM exits mid-grade, leaving a claim to time out | [main.go:52](backend/cmd/server/main.go#L52) |
| 13 | `entrypoint.sh` derives `NUM_BOXES` from `RUN_MAX_CONCURRENT` alone — must become the sum of both pools | [backend/entrypoint.sh](backend/entrypoint.sh) |
| 14 | A 503 "server busy" is rewritten into a fake failed run (`exitCode: 1`) instead of prompting a retry — the user is told their code failed when the judge was merely full | [actions/code.ts:50-58](frontend/src/actions/code.ts#L50-L58) |
| 15 | Stale comment says runs execute "in a sandboxed Docker container"; it's isolate now | [actions/code.ts:7-9](frontend/src/actions/code.ts#L7-L9) |

---

## Part 6 — Phases

Each phase is independently shippable and verifiable.

| Phase | Work | Verify |
|---|---|---|
| **0. Land the sandbox** | Commit the isolate work (you commit). Provision a Linux host with [provision-isolate.sh](backend/deploy/provision-isolate.sh). | `isolate --cg --box-id=0 --init`; `make judgetest` passes all 9 abuse cases |
| **1. Fair, tiered runner** | Host tuning (Part 3), slot pinning, two-tier pool, per-request `Limits`, language factors, verdict model, separate compile memory. Bugs 2–7. | New `judgetest` fairness case: same submission at 1× vs full concurrency, p95 time variance < 15% |
| **2. Problems in the DB** | `0002_judge.sql`, sqlc queries, `cmd/problemtool`, problems API, frontend reads problems from the API. | Import a problem, see it in `/challenges`; confirm no endpoint leaks `problem_tests` |
| **3. Real grading** | Postgres queue + lease/reaper, judge worker using `Session`, checker, submissions API, frontend polling + per-test table. Bugs 1, 9. | Submit AC/WA/TLE/MLE/CE/RE solutions, confirm each verdict and the score; `kill -9` a worker mid-submission and confirm the reaper requeues it |
| **4. Scoring & ops** | `problem_scores` maintenance, leaderboard, submission history page, rate limits, session sweep, per-submission CPU budget. Bug 8. | Leaderboard matches hand-computed totals; rate limit returns 429 |
| **5. Load validation** | 500-simulated-user load test; tune slot split, `MaxQueue`, budgets. | Thresholds below |

### Verification thresholds (extend `backend/cmd/judgetest/main.go`)

The harness already does 9 abuse cases plus a burst, with a clean `report.check(name, ok, detail)` pattern that's easy to extend. Three things it needs first:

1. **Two existing assertions break when `TimeMs` becomes CPU time.** Case 2 ([judgetest/main.go:100](backend/cmd/judgetest/main.go#L100)) asserts `ExitCode == -1 && TimeMs < 9000 && stderr contains "time limit"`, and case 3 ([:105](backend/cmd/judgetest/main.go#L105)) asserts `TimeMs >= 9000` for `time.sleep(60)` — which burns ~0 CPU. Both must move to asserting `verdict == "TLE"` plus the new separate wall field.
2. **`runLoadTest` fires one instantaneous burst of `n` goroutines** ([:150-181](backend/cmd/judgetest/main.go#L150-L181)) and reports only counts and total elapsed. Validating the Part 2 math needs a **sustained arrival rate** (Poisson at the derived runs/s and submits/s) held for minutes, plus **p50/p95/p99 latency** — not a thundering herd.
3. **It logs in as a single user.** A 500-user simulation needs a pool of sessions (create them with the existing [cmd/usertool](backend/cmd/usertool/main.go) bulk import) so per-user rate limits and per-user queue fairness are actually exercised.

Then add:

| Metric | Threshold |
|---|---|
| **Timing fairness** — same submission, 1× vs full concurrency | p95 wall-time variance **< 15%** (the key contest-fairness metric; if this fails, turbo or HT is still on) |
| Run p95 latency at 200 concurrent | **< 3 s** |
| Submit queue wait at steady state | **< 10 s** |
| Submit queue drain after a simulated 15-min rush | **< 5 min** |
| Throughput at saturation | ≥ derived core count in Part 2 |
| **Starvation probe** — 100 concurrent 40 s submissions, then 50 interactive runs | every run completes **< 2.5 s** wall and none 503s for lack of a slot. This single number is what proves the two-tier pool works. |
| **State-leak probe** — writes `/sandbox/x` on test 1, prints it on test 2 | must see nothing (proves fresh `--init` per test) |
| **Verdict-forgery probe** — writes fake `status:OK` meta files into `/sandbox`, attempts a write to the read-only `/prog` | real verdict still reported |
| Worker kill mid-submission (`-kill-worker`) | requeued and completed after the lease expires, `attempts == 2`, identical results |
| Fork bomb / 1 GB alloc / network egress / rootfs write | all still contained (existing cases) |
| Mixed burst of 500 | only 200/202/429/503 — never a 500 or a hang; `/healthz` ok afterwards |

Run the full 500-user dry run on the real provisioned host at least a week before the contest — the fairness number is the one that decides whether your time limits mean anything.

### Contest-day operations

**Watch:** submit queue depth and oldest queued age, `/run` 503 rate, slot utilisation per pool, p95 run latency, Postgres connection count, `attempts > 1` count (worker instability), disk/tmpfs free.

**When the submit queue backs up,** in order of preference: lower `JUDGE_SUBMISSION_CPU_BUDGET_SECONDS` (biggest, safest win) → add a judge node (Part 4, no code change) → raise `MaxQueue` so waits queue rather than 503 → last resort, shift `runReserve` down by 1 (costs run latency).

**Failure modes:** judge node dies → lease reaper requeues (≤120 s). Postgres saturates → raise pool size, and polling is the main read load so back off the interval. Memory hog → cgroup OOM-kills it as MLE, with swap off so it can't thrash the host. Disk fills → `problem_tests` and code are small; the risk is tmpfs, bounded by `--fsize` × slots.

**Degradation path:** if the judge is unhealthy, disable submit (queue-only, judge later) while keeping `/run` alive — contestants can still work. `/run` and judging are separately pool-limited, so one can be throttled to zero without touching the other.
