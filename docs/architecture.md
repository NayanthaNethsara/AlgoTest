# System Architecture & Topology

This document describes the technical architecture, distributed data flow, security model, and execution pipeline of Labyrithm.

---

## 1. System Topology

```mermaid
flowchart TD
    subgraph Clients["Clients & Contestants"]
        CompetitorWeb["Competitor Web Portal (Browser)"]
        CompetitorApp["Competitor Desktop Client (Tauri v2)"]
        AdminUser["Contest Administrator (Browser)"]
        DesktopDaemon["Desktop Proctor Daemon (Loopback 127.0.0.1:47615)"]
    end

    subgraph Edge["Network & Routing"]
        Nginx["Reverse Proxy / Ingress (Ports 80 & 443, TLS)"]
    end

    subgraph Frontends["Frontend Applications"]
        CompetitorAppUI["Competitor Portal (Next.js App Router, Port 3000)"]
        AdminAppUI["Admin Management Portal (Next.js 15, Port 3001)"]
    end

    subgraph BackendCore["Backend API Core (Port 8080)"]
        GinServer["Go Backend API (Gin Framework)"]
        ProctorEngine["Proctoring & Risk Engine"]
        AuditSystem["Immutable Audit Logger (Asynchronous)"]
        SSEHub["Server-Sent Events (SSE) Verdict Hub"]
    end

    subgraph Database["PostgreSQL 16 Database"]
        PGQueue[("Submissions Queue (FOR UPDATE SKIP LOCKED)")]
        PGPubSub["PostgreSQL Event Pub/Sub (LISTEN / NOTIFY)"]
        PGAudit[("Audit Log (Append-Only Table)")]
        PGState[("Relational Data: Contests, Problems, Users, Teams")]
    end

    subgraph ExecutionLayer["Distributed Execution Cluster"]
        InProcessWorker["In-Process Judge Worker"]
        StandaloneWorkers["Distributed Worker Cluster (cmd/worker Nodes)"]
        IsolateSandbox["Linux Isolate Sandbox (cgroups v2, tmpfs root, CPU Pinning)"]
    end

    CompetitorWeb -->|":80 / :443"| Nginx
    CompetitorApp -->|":80 / :443"| Nginx
    AdminUser -->|":80 / :443"| Nginx
    DesktopDaemon <-->|"Attestation & Loopback"| CompetitorApp

    Nginx -->|"/ (SSR & Static)"| CompetitorAppUI
    Nginx -->|"/admin (Console)"| AdminAppUI
    Nginx -->|"/api/ (REST & SSE)"| GinServer

    GinServer --- ProctorEngine
    GinServer --- AuditSystem
    GinServer --- SSEHub

    AuditSystem -->|"Async Write"| PGAudit
    GinServer -->|"Enqueue Submissions"| PGQueue
    GinServer -->|"pg_notify: judge_new_submission"| PGPubSub

    PGPubSub -.->|"Wakeup Notification"| InProcessWorker
    PGPubSub -.->|"Wakeup Notification"| StandaloneWorkers

    InProcessWorker -->|"Atomic Claim"| PGQueue
    StandaloneWorkers -->|"Atomic Claim"| PGQueue

    InProcessWorker --> IsolateSandbox
    StandaloneWorkers --> IsolateSandbox

    InProcessWorker -->|"pg_notify: judge_verdicts"| PGPubSub
    StandaloneWorkers -->|"pg_notify: judge_verdicts"| PGPubSub
    PGPubSub -.->|"Broadcast Verdicts"| SSEHub
    SSEHub -->|"Real-time Verdict Stream"| CompetitorWeb
    SSEHub -->|"Real-time Verdict Stream"| CompetitorApp
```

---

## 2. Submission & Evaluation Lifecycle

Labyrithm uses PostgreSQL as a transactional, distributed job queue. This architecture provides ACID guarantees, atomic task claims, and crash recovery without requiring Redis or RabbitMQ brokers.

```mermaid
sequenceDiagram
    autonumber
    participant Competitor as Competitor (Browser / Desktop)
    participant API as Backend API Server (:8080)
    participant DB as PostgreSQL 16
    participant Worker as Judge Worker (In-Process / Standalone)
    participant Sandbox as Linux Isolate Sandbox
    participant SSE as SSE Stream Hub

    Competitor->>API: POST /api/v1/submissions {problem_id, language, code}
    Note over API: 1. Validate Zod/Go bounds (code <= 100KB)<br/>2. Verify proctor gate & active contest state<br/>3. Evaluate paste telemetry for AI bursts
    API->>DB: INSERT INTO submissions (status = 'queued')
    API->>DB: SELECT pg_notify('judge_new_submission', submission_id)
    API-->>Competitor: HTTP 201 {submission_id, status: 'queued'}

    DB-->>Worker: LISTEN notification ('judge_new_submission')
    Worker->>DB: SELECT id FROM submissions WHERE status = 'queued' FOR UPDATE SKIP LOCKED LIMIT 1
    Worker->>DB: UPDATE submissions SET status = 'running', worker_id = $1, lease_until = NOW() + '30s'

    Worker->>Sandbox: Initialize isolated sandbox directory
    Worker->>Sandbox: Compile source code (if C++, Java, Rust, Go)
    loop For each test case in problem
        Worker->>Sandbox: Stage active stdin (stdin.txt) & set execution limits
        Worker->>Sandbox: Execute sandboxed binary (cgroups v2, CPU pinning, tmpfs root)
        Sandbox-->>Worker: Exit code, CPU time, wall time, memory, stdout
        Worker->>Sandbox: Unlink stdin.txt and clean sandbox output
        Worker->>DB: INSERT INTO submission_subtasks (verdict, time_ms, memory_kb, points)
    end
    Worker->>Sandbox: Isolate cleanup & destroy directory

    Worker->>DB: UPDATE submissions SET status = 'done', verdict = $verdict, score = $score
    Worker->>DB: UPDATE problem_scores SET score = MAX(...), finished_at = LEAST(...)
    Worker->>DB: SELECT pg_notify('judge_verdicts', json_payload)

    DB-->>SSE: Event broadcast ('judge_verdicts')
    SSE-->>Competitor: Live verdict push (status, subtasks, total score)
```

---

## 3. Proctoring & Attestation Data Flow

To support integrity workflows without relying solely on intrusive kernel drivers, Labyrithm deploys a split-architecture model: a native background daemon communicates with the portal via local loopback attestation, while the backend continuously computes an anomalous risk score.

```mermaid
sequenceDiagram
    autonumber
    participant Daemon as Desktop Proctor Daemon (Rust)
    participant Web as Contest Portal (Monaco Editor)
    participant API as Backend API Core
    participant DB as PostgreSQL
    participant Admin as Admin Monitoring Console

    Daemon->>API: POST /api/v1/agent/enroll {machine_id, os_version, app_version}
    API-->>Daemon: HTTP 200 {agent_token, nonce_seed}

    loop Every 5-10 Seconds
        Daemon->>Daemon: Inspect active processes, window titles, and network adapters
        Daemon->>API: POST /api/v1/agent/heartbeat {agent_token, process_snapshot, active_window}
        API->>DB: Record agent status & update last_heartbeat
    end

    Web->>Daemon: GET http://127.0.0.1:47615/attest (Local Loopback)
    Daemon-->>Web: HTTP 200 {nonce, signature, timestamp}

    Web->>API: POST /api/v1/telemetry/events {focus_lost, screen_resized, paste_event}
    API->>DB: Ingest telemetry event
    API->>API: Update composite risk score (0-100)

    Web->>API: POST /api/v1/submissions (Header: X-Proctor-Attest: nonce)
    API->>API: Validate nonce against enrolled agent session
    alt Nonce Missing or Proctor Offline
        API-->>Web: HTTP 423 Locked ("GATE_UNAVAILABLE")
    else Nonce Valid
        API->>DB: Enqueue submission
    end

    API->>Admin: Real-time risk table, telemetry timeline, and live violation alerts
```

---

## 4. Key Architectural Guarantees

### Database-Driven Queuing (`SKIP LOCKED`)

- Multiple workers (both in-process and distributed `cmd/worker` instances) poll the same `submissions` table concurrently.
- Using PostgreSQL `FOR UPDATE SKIP LOCKED`, workers atomically acquire queued submissions without locking each other or causing database contention.
- Worker leases (`lease_until`) are refreshed during execution. If a worker node crashes or loses power, a background reaper process resets expired leases back to `queued` for immediate reassignment.

### Linux Isolate Sandbox Isolation

- Code execution runs inside the Linux `isolate` sandboxing framework.
- **CPU Pinning**: Workers bind executions to designated physical CPU cores.
- **Filesystem Isolation**: Code runs inside an isolated root filesystem with a transient `tmpfs` directory. Untrusted processes have no visibility into the host or adjacent sandboxes.
- **Network Isolation**: All loopback and external network sockets are disabled inside the sandbox.
- **Per-Test Staging**: Test case inputs are staged one at a time and unlinked immediately after each run to prevent sandboxed code from inspecting subsequent test inputs.
- **Output Bounds**: The sandbox enforces a hard $4\text{ MB}$ limit (`fsize = 4 MB`) on standard output. Output exceeding this limit terminates with `SIGXFSZ` (Output Limit Exceeded).

### Real-Time Event Fan-Out (PostgreSQL LISTEN / NOTIFY)

- PostgreSQL `pg_notify` broadcasts state transitions (`judge_new_submission`, `judge_verdicts`, `contest_state_changed`).
- API instances subscribe to these channels and stream live updates to connected browsers using persistent Server-Sent Events (SSE).
- This eliminates polling overhead on client browsers and supports high concurrent contestant volumes.

### Asynchronous Immutable Audit Trail

- Administrative actions (timer changes, user suspensions, password resets, manual score adjustments) are emitted to an in-memory channel.
- An asynchronous background worker batches and commits entries to an append-only `audit_logs` table, preventing audit operations from blocking critical request paths.
