# MiniAlgothon Backend Service

The MiniAlgothon backend is a high-performance Go service powered by the Gin web framework and PostgreSQL 16. It handles the core REST API, real-time Server-Sent Events (SSE) verdict streaming, participant telemetry ingestion, proctoring anomaly evaluation, immutable audit logging, and untrusted code execution using the Linux `isolate` sandbox.

---

## Directory & Package Architecture

The backend codebase adheres to a strict domain-driven vertical layout:

```
backend/
├── cmd/
│   ├── server/             # Primary REST API server & optional in-process worker
│   ├── worker/             # Standalone distributed code execution worker
│   ├── migrate/            # Standalone database migration runner
│   ├── usertool/           # Administrator seeding and credential CLI
│   ├── judgetest/          # Sandbox limits, security, and burst load harness
│   ├── proctorsim/         # Proctoring telemetry generator & violation simulator
│   └── submissionstress/   # Submission ingestion rate and queue stress tester
├── internal/
│   ├── agent/              # Desktop proctor client enrollment, attestation, and heartbeats
│   ├── api/                # HTTP route handlers, Gin middleware, SSE feed, and rate limits
│   ├── audit/              # Immutable audit logging repository and async worker
│   ├── auth/               # Password hashing (Argon2id/bcrypt), sessions, and lockout tracker
│   ├── config/             # Environment configuration parsing and validation
│   ├── contest/            # Contest state machine, timers, and setting repository
│   ├── crypto/             # Token generators, machine ID hashing, and cryptographic utilities
│   ├── db/                 # PostgreSQL pgx/v5 connection pool and SQL migrations
│   │   └── migrations/     # Versioned SQL migration files (0001 to 0019)
│   ├── judge/              # Submission queue, SKIP LOCKED claiming, leases, and reaper
│   ├── metrics/            # Prometheus metrics registry and HTTP collector
│   ├── models/             # Shared data models and DTOs
│   ├── problem/            # Problem definitions, testcases, limits, and sample management
│   ├── proctor/            # Risk scoring, anomaly timeline, and access overrides
│   ├── runner/             # Linux isolate sandbox runner, compilation, and cgroup enforcement
│   ├── session/            # User session repository and TTL enforcement
│   ├── team/               # Team creation, roster management, and invitations
│   ├── telemetry/          # Focus, blur, screen, and window event ingestion
│   └── user/               # User accounts repository, role validation, and status
├── deploy/                 # Production deployment scripts, systemd units, and Nginx configs
└── Dockerfile              # Privileged Docker container with isolate and toolchains
```

---

## Distributed Judge Engine & Queue Mechanics

MiniAlgothon uses an atomic, PostgreSQL-backed submission queue that eliminates the need for external broker dependencies like Redis or RabbitMQ:

```mermaid
sequenceDiagram
    autonumber
    participant Competitor as Competitor Client
    participant API as API Server (:8080)
    participant PG as PostgreSQL 16
    participant Worker as Judge Worker (cmd/worker)
    participant Sandbox as Isolate Sandbox

    Competitor->>API: POST /api/v1/submissions (Source Code)
    API->>PG: INSERT INTO submissions (state = 'queued')
    API->>PG: pg_notify('judge_new_submission', '')
    API-->>Competitor: 201 Created (Submission ID)

    PG-->>Worker: LISTEN judge_new_submission event
    Worker->>PG: SELECT ... FOR UPDATE OF s SKIP LOCKED LIMIT 1
    Worker->>PG: UPDATE submissions SET state = 'running', lease_until = NOW() + 60s
    Note over Worker,PG: Transaction commits immediately (zero row lock held during execution)

    Worker->>Sandbox: Compile & Execute tests in cgroup box
    loop Every 20 Seconds
        Worker->>PG: Heartbeat: UPDATE lease_until = NOW() + 60s
    end
    Sandbox-->>Worker: Execution results & verdicts

    Worker->>PG: UPDATE submissions SET state = 'completed', verdict = 'AC'
    Worker->>PG: pg_notify('judge_verdicts', verdict_payload)
    PG-->>API: LISTEN judge_verdicts event
    API-->>Competitor: Push verdict over SSE stream (/submissions/stream)
```

### 1. Atomic Queue Claiming (`SKIP LOCKED`)

Worker processes ([cmd/worker/](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/backend/cmd/worker) or in-process workers) poll for submissions using:

```sql
SELECT s.id, s.problem_id, s.user_id, s.language, s.source_code, s.created_at
FROM submissions s
WHERE s.state = 'queued'
ORDER BY ((tc.pending_count - 1) * 10 - EXTRACT(EPOCH FROM (NOW() - s.created_at))) ASC
FOR UPDATE OF s SKIP LOCKED
LIMIT 1;
```

- `FOR UPDATE OF s SKIP LOCKED` ensures multiple workers across distinct physical VMs claim non-overlapping submissions simultaneously with zero lock contention.
- The transaction commits immediately upon marking the row as `state = 'running'`, assigning `claimed_by = $worker_id`, and granting a 60-second lease (`lease_until = NOW() + INTERVAL '60 seconds'`).
- The submission row is **never held locked** in a database transaction while code is executing in the sandbox.

### 2. Event-Driven Wakeup (`LISTEN/NOTIFY`)

When a submission is created, the API server executes `pg_notify('judge_new_submission', '')`. Workers listening on this channel wake up immediately, achieving sub-millisecond dispatch times without waiting for polling intervals (a 1-second timer serves as a fallback).

### 3. Cross-VM Verdict Broadcasting

When an evaluation finishes, the worker executes `pg_notify('judge_verdicts', <payload>)`. The API server receives this notification over its dedicated listener connection and immediately pushes the update to the competitor's browser via Server-Sent Events (`/api/v1/submissions/stream`).

### 4. Worker Crash Recovery & Lease Reaper

If a worker node crashes, experiences a kernel panic, or suffers a network partition:
- The running submission's lease expires after 60 seconds (`lease_until < NOW()`).
- The background lease reaper ([reaper.go](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/backend/internal/judge/reaper.go)) runs every 10 seconds:
  ```sql
  UPDATE submissions
  SET state = 'queued',
      attempts = attempts + 1,
      claimed_at = NULL,
      claimed_by = NULL,
      lease_until = NULL
  WHERE state = 'running' AND lease_until < NOW();
  ```
- The orphaned submission is returned to the queue and evaluated by another available worker.
- **Poison-Pill Protection**: If a toxic submission crashes workers 3 times (`attempts >= 3`), the reaper marks it as `failed` with verdict `IE` (Internal Error) rather than causing endless worker crashes.

---

## Untrusted Code Sandbox (`isolate`)

The judge engine evaluates user code within the Linux `isolate` sandbox ([internal/runner/](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/backend/internal/runner)):

- **Kernel cgroups v2**: Strict, hardware-level CPU time limits, wall-clock time limits, and memory limits (RAM + swap).
- **Process Isolation**: Process tree limits (`--processes`) protect against fork bombs.
- **Filesystem Security**: Ephemeral `tmpfs` mounts mounted with `noexec,nosuid,nodev`. Submissions have read-only access to compiler runtimes and standard libraries.
- **Network Isolation**: Dedicated unshared network namespaces with zero loopback or egress connectivity (`--net`).
- **CPU Pinning**: The `RUN_CPU_LIST` setting binds sandbox execution to dedicated physical CPU cores (e.g. `RUN_CPU_LIST=4-15`), leaving cores 0-3 for OS and API routing.

---

## Immutable Audit Logging Domain

All sensitive administrative and authentication operations are logged to the `audit_logs` table via [internal/audit/](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/backend/internal/audit):

### Audit Schema

| Column | Type | Description |
| --- | --- | --- |
| `id` | `UUID` | Unique audit record identifier |
| `actor_id` | `UUID` | User ID of the initiator (NULL for anonymous login attempts) |
| `actor_username` | `VARCHAR(64)` | Username of the initiator |
| `actor_role` | `VARCHAR(32)` | Role at time of action (`admin`, `contestant`, `proctor`, `system`) |
| `action` | `VARCHAR(64)` | Standardized event identifier (e.g. `auth.login.failure`, `contest.pause`) |
| `target_type` | `VARCHAR(32)` | Entity category (`user`, `team`, `contest`, `problem`, `submission`, `proctor`) |
| `target_id` | `VARCHAR(64)` | Identifier of the affected entity |
| `status` | `VARCHAR(16)` | Outcome (`success`, `failure`, `locked`) |
| `ip_address` | `INET` | Client IP address (resolved via `TRUSTED_PROXIES`) |
| `user_agent` | `TEXT` | Client HTTP User-Agent |
| `details` | `JSONB` | Structured contextual metadata |
| `created_at` | `TIMESTAMPTZ` | Timestamp of occurrence |

### Asynchronous Non-Blocking Recording

Audit entries are dispatched via `RecordAsync(entry)`:
```go
go func() {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    _ = r.Record(ctx, entry)
}()
```
This guarantees that database audit writes never delay client HTTP response times.

---

## Security & Authentication Architecture

1. **Separated Session Lifetimes**:
   - Administrator sessions: 12 hours (`ADMIN_SESSION_TTL_HOURS=12`).
   - Competitor sessions: 3 hours (`SESSION_TTL_HOURS=3`).
2. **Brute-Force Account Lockout**:
   - Tracks consecutive failed login attempts per username.
   - 5 consecutive failures triggers an automatic 15-minute account lockout.
   - Successful authentication resets the counter.
3. **Root Administrator Protection**:
   - Accounts with the `admin` role cannot be deleted, suspended, demoted, or have their passwords changed via web API endpoints.
4. **Cookie Security**:
   - `COOKIE_SECURE=true` enforces `Secure; HttpOnly; SameSite=Lax` cookies in production HTTPS environments.

---

## Database Connection Pool Tuning

The backend uses `pgxpool.Pool` for PostgreSQL database connectivity:

```ini
DATABASE_URL=postgres://algothon:secret@127.0.0.1:5432/algothon?sslmode=disable
DB_MAX_CONNS=25
DB_MIN_CONNS=5
```

- **API Server**: Set `DB_MAX_CONNS=25`, `DB_MIN_CONNS=5` to handle concurrent web traffic and telemetry.
- **Worker Nodes**: When running standalone workers across multiple VMs, set `DB_MAX_CONNS=8`, `DB_MIN_CONNS=2` per worker to stay within database connection budgets.
- **Dedicated PostgreSQL**: On a dedicated GCP VM, configure PostgreSQL `max_connections = 250` or higher to support horizontally scaled worker clusters.

---

## CLI Utilities

Build and run utilities directly from the repository root using `make`:

```sh
# Seed the initial root administrator:
make admin ARGS='-username admin -name "Admin" -password adminpass'

# Run the sandbox limit and security benchmark:
make judgetest ARGS='-username competitor1 -password userpass -burst 10'

# Apply database migrations:
make migrate

# Launch a standalone judge worker:
make worker
```

Run tests:
```sh
go test -v -race ./...
```
