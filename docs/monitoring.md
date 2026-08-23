# Observability & Monitoring Guide

MiniAlgothon runs a single-VM observability stack of **Prometheus**, **Loki**,
**Promtail**, and **Node Exporter**, read through a **Grafana** that runs on your
own machine rather than on the server. Inspecting logs and diagnosing performance
needs no interactive SSH session on the VM.

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
 │        │  Bound to 127.0.0.1 -- read over an       │                   │
 │        │  IAP tunnel from a local Grafana.         │                   │
 │        │  No Grafana runs on the VM.               │                   │
 │        └───────────────────────────────────────────┘                   │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Running Grafana Locally

### Prerequisites

Docker and Docker Compose. No local Go toolchain is required -- every backend
command runs inside the container from `backend/Dockerfile`.

### 1. Start the backend first

Grafana and its dashboards load with no backend running, but every panel will be
empty because Prometheus has nothing to scrape. Start the app first:

```sh
make backend
```

This brings up Postgres and the backend, publishing port `8080` on the host.

### 2. Start the monitoring stack

```sh
make monitoring-up
```

This starts all five monitoring containers in the background.

### 3. Open Grafana

Browse to **`http://localhost:3002`** and log in with **`admin` / `admin`**
(see [Configuration & Security](#configuration--security) before using these
anywhere but your own machine).

Both datasources are provisioned automatically -- Prometheus at
`http://prometheus:9090` and Loki at `http://loki:3100` -- so there is nothing to
wire up by hand. The two dashboards appear under **Dashboards -> MiniAlgothon**.

### Two DOWN scrape targets is normal locally

Prometheus is configured with three candidate targets for the backend so that one
config file works in every environment:

```
algothon-backend:8080    host.docker.internal:8080    localhost:8080
```

Only one of them can ever win. Locally, `docker-compose.yml` places the backend on
its own default compose network rather than `algothon-net`, so the DNS name
`algothon-backend` does not resolve from the Prometheus container. The scrape
succeeds via `host.docker.internal:8080` instead, because the dev compose file
publishes `8080:8080` on the host. `localhost:8080` refers to the Prometheus
container itself and never resolves.

So on <http://localhost:9090/targets>, **one target UP and two DOWN is the correct
healthy state** in local dev. Only investigate if all three are down -- that means
the backend is not running or not publishing 8080.

In production all services share `algothon-net`, so `algothon-backend:8080` is the
target that succeeds there instead.

### Changing the port

If 3002 is already taken:

```sh
GRAFANA_PORT=3005 make monitoring-up
```

### Stopping the stack

```sh
make monitoring-down
```

### Viewing monitoring service logs

```sh
make monitoring-logs
```

### Resetting all monitoring data

To wipe stored metrics, logs, and any Grafana state:

```sh
docker compose -f monitoring/docker-compose.monitoring.yml down -v
```

This removes the `algothon-prom-data`, `algothon-loki-data`, and
`algothon-grafana-data` volumes. Provisioned dashboards and datasources return on
the next start because they are mounted read-only from the repository, but any
dashboard you created by hand in the UI is lost.

---

## Reading the VM's Data in a Local Grafana

**Grafana does not run on the deployed VM.** It sits behind the `local` Compose
profile, so a plain `docker compose up -d` on the server starts only Prometheus,
Loki, Promtail, and Node Exporter. There is no Grafana login exposed on the VM and
no admin password to leak there.

Prometheus and Loki bind to `127.0.0.1` on the VM, so they are unreachable even
from elsewhere inside the VPC. Node Exporter publishes no host port at all --
Prometheus scrapes it over the `algothon-net` bridge. You read the data by
forwarding the two ports to your own machine.

### 1. Open the tunnel

```sh
make monitoring-tunnel
```

Leave this running in its own shell. It forwards the VM's Prometheus to local
`19090` and Loki to local `13100` over IAP. Those offset ports are deliberate --
they never collide with a local monitoring stack on 9090/3100, so you can run both
at once.

### 2. Point a local Grafana at the tunnel

In a second shell:

```sh
make grafana-remote
```

Grafana comes up on <http://localhost:3002> with both datasources aimed through
the tunnel at the VM. The provisioned dashboards work unchanged.

### 3. Switch back to local data

```sh
make monitoring-up
```

### How the switching works

`datasources.yml` declares its URLs as `${PROMETHEUS_URL}` and `${LOKI_URL}` rather
than hardcoding them. The Compose file defaults both to the in-stack service names:

```yaml
- PROMETHEUS_URL=${PROMETHEUS_URL:-http://prometheus:9090}
- LOKI_URL=${LOKI_URL:-http://loki:3100}
```

Grafana interpolates environment variables in provisioning files at startup, and
`make grafana-remote` overrides them to `http://host.docker.internal:19090` and
`:13100`. Both datasources keep their `uid` (`prometheus` / `loki`) in either mode,
so dashboards resolve identically whichever data you are pointed at.

`grafana-remote` passes `--force-recreate` because environment variables are fixed
when a container is created -- a plain restart would silently keep the old URLs.

Tunnelling requires `roles/iap.tunnelResourceAccessor` and `roles/compute.osLogin`
(or `roles/owner`). See [deployment.md](deployment.md).

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

The security model is that **nothing in this stack is exposed to the network**.
Prometheus and Loki bind to `127.0.0.1` on the VM, Node Exporter publishes no host
port, and Grafana runs only on an operator's own machine behind the `local`
profile. Access is via IAP tunnel, authenticated by your GCP IAM identity. The
GCP firewall admits only 80/443, so none of 3002/9090/3100/9100 answer from the
internet.

This matters because **Prometheus, Loki, and Node Exporter have no authentication
of any kind**. Any port you open to them is an open door -- do not add firewall
rules for them, and do not change their bindings back to `0.0.0.0`.

### Grafana credentials

Grafana defaults to `admin` / `admin` via
`GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}`. Since Grafana runs
only on localhost on your own machine, the default is acceptable for ordinary use.

Set a real password if you ever bind Grafana to anything other than `127.0.0.1`,
or share the machine. Note that `GF_SECURITY_ADMIN_PASSWORD` only applies when
Grafana first initialises its database -- on an existing instance it is ignored,
so setting it alone changes nothing. Do both:

```sh
# 1. reset the running instance
docker exec algothon-grafana grafana-cli admin reset-admin-password '<strong-password>'
```

```sh
# 2. persist it in monitoring/.env so a fresh volume comes up secured
#    (.gitignore already covers it -- never commit it, this repo is public)
GRAFANA_ADMIN_USER=organizer
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

Then `make monitoring-restart`. Step 1 alone is lost whenever the
`algothon-grafana-data` volume is recreated; step 2 alone leaves a running
instance untouched.

### Do not proxy Grafana through nginx

Earlier revisions of this guide suggested a `location /grafana/` block. Do not add
one. It would publish Grafana on 443 -- the one port open to the internet --
which is exactly what the IAP tunnel exists to avoid.

### Changing the Grafana port

```sh
GRAFANA_PORT=3005 make monitoring-up
```
