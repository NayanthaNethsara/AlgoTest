# Observability & Monitoring Guide

MiniAlgothon provides a complete, single-VM observability stack consisting of **Prometheus**, **Loki**, **Promtail**, **Node Exporter**, and **Grafana**. This setup eliminates the need to SSH into the VM to inspect logs or diagnose performance bottlenecks.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Single VM Hosting Environment                                         │
 │                                                                        │
 │   ┌──────────────────────┐        ┌──────────────────────┐             │
 │   │ Algothon Backend     │        │ Host VM / OS         │             │
 │   │  - JSON slog stdout  │        │  - CPU / Memory      │             │
 │   │  - :8080/metrics     │        │  - Disk / Network    │             │
 │   └──────────┬───────────┘        └──────────┬───────────┘             │
 │              │                               │                         │
 │     Metrics  │                      Metrics  │                         │
 │        ┌─────▼───────────────────────────────▼─────┐                   │
 │        │  Prometheus (:9090)                       │                   │
 │        │  - Scrapes backend & node-exporter        │                   │
 │        └─────────────────────┬─────────────────────┘                   │
 │                              │                                         │
 │     Logs                     │                                         │
 │        ┌─────────────────────▼─────────────────────┐                   │
 │        │  Promtail ──► Loki (:3100)                │                   │
 │        │  - Parses JSON slog & container streams   │                   │
 │        └─────────────────────┬─────────────────────┘                   │
 │                              │                                         │
 │        ┌─────────────────────▼─────────────────────┐                   │
 │        │  Grafana (:3002)                          │                   │
 │        │  - Auto-provisioned Dashboards            │                   │
 │        │  - Live Log Explorer                      │                   │
 │        └───────────────────────────────────────────┘                   │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Starting the Stack

From the root of the repository:

```sh
make monitoring-up
```

This starts all five monitoring containers in the background.

- **Grafana URL**: `http://<vm-ip>:3002` (or `http://localhost:3002` in local dev)
- **Default Credentials**: `admin` / `admin` (can be overridden via environment variables)

### Stopping the Stack

```sh
make monitoring-down
```

### Viewing Monitoring Service Logs

```sh
make monitoring-logs
```

---

## Pre-Configured Dashboards

Grafana is provisioned with two dashboards located in the `MiniAlgothon` folder:

### 1. MiniAlgothon - Platform & System Overview (`algothon-overview`)

Provides real-time visibility into all layers of the system:
- **System Health Cards**: API status, HTTP Request Rate (RPS), 5xx error rate %, 4xx error rate %, P95 latency, active DB connections, active judge workers, sandbox boxes in use.
- **HTTP Traffic & Latency**: Requests per second broken down by route and HTTP method, HTTP status code distribution (2xx, 4xx, 5xx), response latency percentiles (P50, P90, P99).
- **Judge Engine & Sandbox Runners**: Submissions evaluated per minute by verdict (AC, WA, TLE, CE, RE, IE), active judge evaluations, runner sandbox box allocation, waiting queue depth.
- **Database & Go Runtime**: PostgreSQL connection pool (Acquired vs Idle vs Max), connection acquisition wait duration, active goroutines, heap memory usage.
- **Host VM & Hardware**: CPU usage %, memory usage %, root disk space available, network throughput.

### 2. MiniAlgothon - Logs & Live Diagnostics (`algothon-logs`)

Provides live log streaming and diagnostic queries without requiring SSH:
- **Log Volume Histogram**: Ingestion rate by log level (`error`, `warn`, `info`, `debug`) over time.
- **Real-Time Log Stream**: Live streaming log viewer with text search filtering and auto-refresh.
- **Error & Warning Stream**: Filtered view isolating 5xx errors, panics, and warning events with structured metadata.
- **HTTP API Access Logs**: Structured access logs containing HTTP method, path, status code, latency in ms, user ID, and client IP.

---

## Log Queries (LogQL) Examples

In Grafana **Explore** (`/explore`), select the **Loki** datasource to run custom queries:

- **Trace a specific request by Request ID**:
  ```logql
  {job="containerlogs"} | json | request_id = "018f4a12-7b2c-4e89-9a10-abcdef123456"
  ```

- **All backend error logs**:
  ```logql
  {job="containerlogs"} | level = "error"
  ```

- **Slow requests (> 500ms)**:
  ```logql
  {job="containerlogs"} | json | duration_ms > 500
  ```

- **Requests for a specific user ID**:
  ```logql
  {job="containerlogs"} | json | user_id = "usr_12345"
  ```

- **Judge worker errors**:
  ```logql
  {job="containerlogs"} |= "judging submission" or |= "failed to complete submission"
  ```

---

## Metrics Reference (PromQL)

The backend exposes the following Prometheus metrics at `GET /metrics`:

| Metric Name | Type | Description |
|---|---|---|
| `algothon_http_requests_total` | Counter | Requests processed partitioned by `method`, `route`, `status`. |
| `algothon_http_request_duration_seconds` | Histogram | Request latency partitioned by `method`, `route`, `status`. |
| `algothon_http_requests_in_flight` | Gauge | Number of HTTP requests currently being handled. |
| `algothon_judge_submissions_total` | Counter | Submissions judged partitioned by `language` and `verdict`. |
| `algothon_judge_submissions_active` | Gauge | Submissions currently undergoing evaluation. |
| `algothon_judge_workers_active` | Gauge | Number of active judge worker goroutines. |
| `algothon_runner_boxes_active` | Gauge | Number of isolate sandbox boxes currently executing. |
| `algothon_runner_boxes_capacity` | Gauge | Total isolate boxes configured. |
| `algothon_runner_queue_depth` | Gauge | Number of submissions waiting for an isolate box. |
| `algothon_db_pool_acquired_connections` | Gauge | Active connections checked out of pgxpool. |
| `algothon_db_pool_idle_connections` | Gauge | Idle connections ready in pgxpool. |
| `algothon_db_pool_max_connections` | Gauge | Max connection capacity of the pool. |

---

## Configuration & Security

To secure Grafana for production deployments, specify custom admin credentials in your environment:

```sh
export GRAFANA_ADMIN_USER=organizer
export GRAFANA_ADMIN_PASSWORD='<strong-password>'
export GRAFANA_PORT=3002
make monitoring-up
```

If routing Grafana through Nginx, add a proxy block to your Nginx configuration:

```nginx
location /grafana/ {
    proxy_pass http://127.0.0.1:3002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
