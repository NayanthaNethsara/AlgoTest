# Labyrithm Isolated Load Testing Suite

A standalone, production-grade load testing harness designed to stress test a Labyrithm deployment from an external testing machine without modifying any files in the core codebase.

---

## Key Characteristics

1. **Fully Decoupled**:
   - Resides entirely in `loadtest/` with its own independent `go.mod`.
   - Has zero dependencies on `backend/internal/` or the frontends.
   - Operates as a black-box HTTP client mimicking real contestants and browsers across the public internet.

2. **Single-Device Rate-Limit Handling**:
   - **User-Keyed Isolation**: Business endpoints (`/submissions`, `/run`, `/problems`) are rate-limited per **User ID**, not per IP. Simulating 50 or 100 contestants from a single laptop assigns each contestant their own token bucket.
   - **Login Pacing**: Logins are throttled to a worker pool of 6 concurrent workers with 50ms pacing, preventing exhaustion of Nginx's 20 req/s auth edge limit and Go's 8-concurrency bcrypt semaphore.
   - **Session Caching**: User sessions are saved to `loadtest/sessions/` after authentication. Subsequent test runs reuse cached tokens, bypassing the login endpoint entirely.

---

## Directory Structure

```
loadtest/
├── go.mod                      # Standalone Go module (pure standard library)
├── main.go                     # Unified CLI entrypoint
├── scenarios/
│   ├── types.go               # Shared data structures and latency percentiles calculator
│   ├── session_manager.go     # Paced auth, session caching, and user provisioning
│   ├── submission_stress.go   # Contest simulation (submissions, judge queue, SSE stream, API probe)
│   ├── sandbox_burst.go       # /api/v1/run sandbox burst compilation and execution
│   ├── gateway_read.go        # Read throughput benchmark (/healthz, /contest/state, /problems, /leaderboard)
│   └── cleanup.go             # Admin REST API cleanup of test accounts and teams
├── sessions/                   # Cached session tokens (auto-created)
├── reports/                    # Generated Markdown and JSON test reports
├── run.sh                      # Executable wrapper script
└── README.md                   # Documentation
```

---

## Available Scenarios

| Scenario      | Target                                                        | What It Tests                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submissions` | `POST /api/v1/submissions`                                    | End-to-end judging: submission ingestion rate, Postgres `SKIP LOCKED` worker queue, Isolate sandbox execution, real-time SSE stream delivery, and concurrent background API responsiveness. |
| `burst`       | `POST /api/v1/run`                                            | Code runner sandbox: rapid parallel compilation and execution, CPU and memory caps, worker pool saturation.                                                                                 |
| `read`        | `GET /healthz`, `/contest/state`, `/problems`, `/leaderboard` | Read gateway throughput, connection pooling (`pgxpool`), Nginx reverse proxy concurrency.                                                                                                   |
| `cleanup`     | `DELETE /api/v1/admin/users/:id`, `teams/:id`                 | Purges `stresstest_*` users and `StressTeam_*` teams created during testing.                                                                                                                |

---

## Presets / Profiles

| Profile   | Users | Concurrency | Read Duration |
| --------- | ----- | ----------- | ------------- |
| `smoke`   | 5     | 5           | 5s            |
| `light`   | 20    | 10          | 10s           |
| `medium`  | 50    | 25          | 20s           |
| `heavy`   | 100   | 50          | 30s           |
| `extreme` | 250   | 100         | 60s           |

---

## Usage Examples

All commands run via `./loadtest/run.sh` or directly via `go run .` from the `loadtest` directory. The target URL automatically defaults to `https://labyrithm-api.nayantha.me` (or the `API_URL` set in `.env`).

### 1. Gateway Read Benchmark (Unauthenticated or Authenticated)

```bash
# Public endpoints benchmark (30 seconds, 25 virtual users)
./loadtest/run.sh -scenario read -duration 30s -concurrency 25

# Authenticated read benchmark with users CSV
./loadtest/run.sh -scenario read -duration 30s -concurrency 25 -users-file ../backend/test_contestants.csv
```

### 2. Multi-User Submission Stress Test

```bash
# Using existing contestants CSV
./loadtest/run.sh -scenario submissions -profile light -users-file path/to/contestants.csv -lang cpp

# Auto-provisioning 50 test contestants via admin credentials
./loadtest/run.sh -scenario submissions -profile medium \
  -admin <admin_username> \
  -admin-pass <admin_password> \
  -lang cpp \
  -save-users test_contestants_cloud.csv
```

### 3. Sandbox `/api/v1/run` Burst Test

```bash
./loadtest/run.sh -scenario burst -profile light -users-file path/to/contestants.csv -concurrency 20
```

### 4. Post-Test Account Cleanup

```bash
./loadtest/run.sh -scenario cleanup -admin <admin_username> -admin-pass <admin_password>
```

---

## Visual Dashboards & Results

Two visual options are available to inspect results:

### 1. Interactive Local Web Dashboard (`http://localhost:8088`)

Launch the built-in web dashboard:

```bash
./loadtest/run.sh -ui
```

This opens `http://localhost:8088` in your browser:

- **Visual Test Controller**: Select Scenario, Profile, and Concurrency, and trigger tests with one click.
- **Interactive Charts**: Real-time response latency bar chart (Min, P50, P90, P95, P99, Max) and verdict doughnut chart.
- **Historical Runs Explorer**: Browse and compare all past test runs from the sidebar.
- **Quick Grafana Link**: Direct access to server-side telemetry.

### 2. Standalone HTML Reports

Every test run automatically generates a self-contained HTML dashboard report in `loadtest/reports/`:

```bash
# Open the latest generated report in your default browser
open loadtest/reports/report_*.html
```

---

## Real-Time Observability in Grafana

During a load test, you can monitor cloud system telemetry in real time:

1. Ensure the monitoring tunnel is running in a terminal:
   ```bash
   make monitoring-tunnel
   ```
2. In a separate terminal, start the local Grafana instance:
   ```bash
   make grafana-remote
   ```
3. Open `http://localhost:3002` (credentials: `admin` / `admin`).
4. Select the **Labyrithm - Platform & System Overview** dashboard to monitor:
   - **HTTP Request Rate & 5xx Error Rate**
   - **HTTP Response Latency Percentiles (P95, P99)**
   - **Active Judge Workers & Submission Queue Depth**
   - **PostgreSQL Connection Pool Status (`pgxpool`)**
   - **Host CPU % and Memory Usage**
