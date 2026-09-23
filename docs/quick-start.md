# Quick Start Guide

This guide describes how to set up, configure, and run Labyrithm in a local development environment.

---

## Prerequisites

Ensure the following tools are installed on your host system:

- **Docker & Docker Compose**: Version 2.20+ with cgroup v2 support.
- **Node.js**: Version 20+ LTS.
- **pnpm**: Version 9+.
- **Go**: Version 1.25+ (optional, for running commands natively outside Docker).
- **Rust & Cargo**: Latest stable (optional, required only for building the desktop app).

---

## Architecture & Service Map

Labyrithm consists of the following core local services:

| Service                 | Technology         | Port / Access           | Description                                                            |
| ----------------------- | ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| **Database**            | PostgreSQL 16      | `localhost:5432`        | Storage for accounts, problems, testcases, submissions, and audit logs |
| **Backend API**         | Go (Gin)           | `http://localhost:8080` | REST API, SSE verdict stream, and in-process judge worker              |
| **Standalone Worker**   | Go + Linux isolate | Background process      | Optional detached execution worker polling queue via `SKIP LOCKED`     |
| **Competitor Frontend** | Next.js App Router | `http://localhost:3000` | Contestant interface with Monaco editor and real-time feed             |
| **Admin Frontend**      | Next.js 15, shadcn | `http://localhost:3001` | Management console for contest timers, problems, users, and audit logs |
| **Desktop Client**      | Tauri v2 + Rust    | `127.0.0.1:47615`       | Proctoring agent daemon and contest shell webview                      |

---

## Environment Setup

1. Copy the example environment configuration files:

```sh
cp backend/.env.example backend/.env
cp competitor-frontend/.env.example competitor-frontend/.env.local
cp admin-frontend/.env.example admin-frontend/.env.local
```

2. Review default ports and settings in `backend/.env`, `competitor-frontend/.env.local`, and `admin-frontend/.env.local`.

---

## Installation & Launch Steps

### Step 1: Install Dependencies

Run the top-level `install` target to download Go modules inside the container environment and install Node packages for both frontend workspaces:

```sh
make install
```

### Step 2: Start PostgreSQL Database

Start the PostgreSQL database container:

```sh
make db-up
```

The database container persists state in Docker volume `labyrithm-pgdata`. To tail logs, run `make db-logs`.

### Step 3: Seed the Root Administrator

The server applies migrations automatically on boot (`make migrate` applies them without starting the server).

The administrator API requires an existing administrator to authenticate. Create the root administrator directly via the CLI:

```sh
make admin ARGS='-username admin -name "System Admin" -password adminpass'
```

Further administrators, problem authors, competitors, and teams are managed within the Admin Portal.

### Step 4: Start Applications

#### Option A: Start Primary Services Concurrently

To launch both the backend container and competitor frontend concurrently:

```sh
make dev
```

To run the Admin Frontend alongside:

```sh
make admin-frontend
```

#### Option B: Start Services Individually

Run each command in a separate terminal session:

```sh
# Terminal 1: Backend API & Judge Worker
make backend

# Terminal 2: Competitor Frontend (port 3000)
make competitor-frontend

# Terminal 3: Admin Frontend (port 3001)
make admin-frontend

# Terminal 4: Optional Standalone Worker
make worker
```

---

## Security & Session Controls

- **Admin Session Lifetime**: Set to 12 hours (`ADMIN_SESSION_TTL_HOURS=12`). Competitor sessions default to 3 hours in contest environments.
- **Brute-Force Lockout**: Automatically locks an account for 15 minutes after 5 consecutive failed login attempts on that username.
- **Admin Account Protection**: Administrators cannot be deleted, suspended, demoted, or have their passwords reset via the web API.
- **Audit Logging**: All security events (logins, lockouts, password changes, proctor overrides, contest actions) are logged immutably in PostgreSQL and inspectable in the Admin Portal under **Audit Logs** (`/audit`).
- **Public Informational Pages**: The platform provides `/support` (FAQ and contact email), `/privacy` (telemetry disclosures and liability terms), and `/contact`. All internal routes are de-indexed from web crawlers.

---

## Verification & Testing CLI Tools

Verify that all system components are functioning correctly:

1. **Backend Health Check:**

   ```sh
   curl http://localhost:8080/healthz
   ```

   Response returns `{"status":"ok"}`.

2. **Run Backend Unit Tests:**

   ```sh
   make test
   ```

3. **Run Judge Load & Sandbox Security Test:**
   Evaluates CPU time limits, wall-clock time limits, memory caps, fork-bomb containment, and network isolation:

   ```sh
   make judgetest ARGS='-username competitor1 -password userpass -burst 10'
   ```

4. **Simulate Proctoring Telemetry & Violations:**
   Simulates desktop agents sending heartbeats, window focus transitions, and violation triggers:

   ```sh
   make proctorsim ARGS='-agents 20 -events 100'
   ```

5. **Submission Ingestion Stress Test:**
   Tests high-throughput concurrent submission queuing:
   ```sh
   make submissionstress ARGS='-rate 30 -duration 30s'
   ```

---

## Submission Access & Fallback Modes

There are three supported ways for a competitor to sit the contest:

| Mode                                | Setup                                                                            | Default                |
| ----------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| **Desktop client, proctor running** | Contest opened inside the desktop app                                            | **Allowed**            |
| **Browser, proctor running**        | Desktop app installed and reporting in background, contest open in Chrome/Safari | Needs a grant          |
| **Browser, no proctor at all**      | Nothing installed (web-only fallback)                                            | Needs a web-only grant |

Test runs (`Run`) always work in every mode. Only **scored submissions** (`Submit`) are gated. Contestants running the proctor agent can submit from both the desktop client and a browser. If an enrolled agent is missing or stopped, submissions return `423 Locked` detailing the required remediation.

### Granting Web-Only Fallback Access

1. In Admin Console -> **Users** -> select user -> **Submission Access**.
2. Alternatively, invoke the API directly:
   ```sh
   curl -X PATCH http://localhost:8080/api/v1/admin/users/<user-id>/access \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer <admin-session>' \
     -d '{"webOnly": true, "reason": "Locked Chromebook cannot run native binaries", "hoursValid": 0}'
   ```
   `hoursValid: 0` keeps the grant active for the remainder of the contest.

### Enabling Contest-Wide Web Fallback

If the desktop client experiences issues across an entire venue:

```sh
docker compose exec postgres psql -U labyrithm -d labyrithm -c \
  "UPDATE contest_settings SET value = 'true' WHERE key = 'access.allow_web_only';"
```

---

## Database Management Commands

| Command         | Action                                                     |
| --------------- | ---------------------------------------------------------- |
| `make db-up`    | Starts the PostgreSQL container in background              |
| `make db-down`  | Stops the PostgreSQL container                             |
| `make db-logs`  | Streams live logs from PostgreSQL                          |
| `make db-reset` | Wipes database volume data and re-initializes clean schema |
| `make migrate`  | Applies pending migrations without starting the server     |

---

## Desktop Client Commands

| Command              | Action                                                     |
| -------------------- | ---------------------------------------------------------- |
| `make desktop`       | Starts competitor desktop client in development mode       |
| `make desktop-build` | Builds production desktop release bundle                   |
| `make desktop-reset` | Clears saved local enrollment tokens and autostart entries |
| `make agent`         | Starts the standalone headless proctor daemon              |
| `make agent-build`   | Builds production agent bundle                             |
| `make agent-reset`   | Resets agent local configuration                           |

---

## Observability Commands

| Command                  | Action                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `make monitoring-up`     | Starts Prometheus, Loki, Promtail, Node Exporter, and Grafana (`http://localhost:3002`) |
| `make monitoring-down`   | Stops the local monitoring stack                                                        |
| `make monitoring-tunnel` | Forwards deployed VM Prometheus (19090) and Loki (13100) via GCP IAP tunnel             |
| `make grafana-remote`    | Starts local Grafana reading live metrics from the remote VM tunnel                     |
