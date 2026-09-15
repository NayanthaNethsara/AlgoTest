# Deployment Guide

How to run MiniAlgothon on a single Google Compute Engine VM: image built by
GitHub Actions, published to GitHub Container Registry, pulled and run manually
on the host.

---

## Topology

```mermaid
flowchart TD
    Internet["Public Internet"]

    subgraph GCE["Google Compute Engine VM (Ubuntu 24.04, t2d-standard-16)"]
        Nginx["Host Nginx Reverse Proxy (Ports 80 & 443)"]
        BackendContainer["Backend Container (Port 8080: Privileged Isolate Sandbox)"]
        CompetitorFrontend["Competitor Frontend Container (Port 3000)"]
        PostgresContainer[("PostgreSQL 16 Container (Port 5432: Persistent Volume)")]
    end

    Internet -->|":80 / :443 (TLS via Certbot)"| Nginx
    Nginx -->|"/api/ and /api/v1/submissions/stream"| BackendContainer
    Nginx -->|"/ (Portal Root)"| CompetitorFrontend
    BackendContainer -->|"127.0.0.1:5432"| PostgresContainer
```

MiniAlgothon supports both single-VM all-in-one deployments and multi-VM horizontally
scaled worker clusters. Submissions are queued atomically in PostgreSQL using
`FOR UPDATE SKIP LOCKED`, and real-time verdicts are broadcast across instances using
PostgreSQL `LISTEN/NOTIFY`. A single larger VM is ideal for smaller contests, while
separate worker nodes handle high-concurrency burst workloads.

## Why a privileged container, and why not Cloud Run

isolate creates cgroups, switches UIDs and builds mount namespaces. Cloud Run
and GKE Autopilot forbid all of it, and no flag turns it on. That rules them out
for the backend; the **frontends** are ordinary Next.js and run fine on Cloud Run
or Vercel if you would rather not host them here.

isolate's manual advises against containers at all, because cgroup delegation
becomes the runtime's problem and a shared machine skews timing. On a dedicated
VM running one privileged container the practical difference is small, and the
`entrypoint.sh` in this image hand-builds the cgroup arrangement systemd would
otherwise provide. If you want to remove the container entirely, use
`deploy/provision-isolate.sh` and run the binary under systemd instead.

---

## Step 1: Create the VM

T2D gives one **physical core** per vCPU with no hyperthreading, so two judged
programs never share execution units. That matters more than raw clock speed
when TLE decides a verdict. Avoid E2 (shared-core, oversubscribed).

```sh
gcloud compute instances create algothon-judge \
  --zone=us-central1-a \
  --machine-type=t2d-standard-16 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-balanced \
  --tags=algothon-web
```

`t2d-standard-8` is the cheaper pick and still judges a 10-team burst in about a
second.

## Step 2: Open only the web ports

The backend must **not** be reachable directly: it is served through nginx, and
`TRUSTED_PROXIES` below assumes every request arrives from localhost.

```sh
gcloud compute firewall-rules create algothon-web \
  --allow=tcp:80,tcp:443 \
  --target-tags=algothon-web \
  --description="Public HTTP/HTTPS for the contest portal"
```

Do not add 8080 or 5432.

## Step 3: Prepare the host

```sh
gcloud compute ssh algothon-judge --zone=us-central1-a
```

```sh
sudo apt-get update && sudo apt-get install -y docker.io nginx
sudo usermod -aG docker "$USER" && newgrp docker

# isolate 2.x requires the cgroup v2 unified hierarchy; Ubuntu 24.04 is fine.
test -f /sys/fs/cgroup/cgroup.controllers && echo "cgroup v2 ok"
```

## Step 4: Start Postgres

```sh
docker volume create algothon-pgdata

docker run -d --name algothon-postgres --restart=always \
  -e POSTGRES_USER=algothon \
  -e POSTGRES_PASSWORD='<strong-password>' \
  -e POSTGRES_DB=algothon \
  -v algothon-pgdata:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

Published on loopback only, so nothing outside the VM can reach it. For managed
backups and failover use Cloud SQL instead and point `DATABASE_URL` at it.

Schedule a dump somewhere off the box:

```sh
docker exec algothon-postgres pg_dump -U algothon algothon | gzip > algothon-$(date +%F).sql.gz
```

## Step 5: Publish the images

Two workflows publish to GitHub Container Registry on every push to `main` and
every `v*` tag:

| Workflow | Image |
| --- | --- |
| `build-backend.yml` | `ghcr.io/<owner>/<repo>/backend` |
| `build-frontend.yml` | `ghcr.io/<owner>/<repo>/competitor-frontend` |

The backend workflow runs `go test` first, so a failing test blocks the image.
Tag a release:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

Both images are private by default. Either make the packages public in the
repo's Packages settings, or log in on the VM with a classic PAT carrying
`read:packages`:

```sh
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

## Step 6: Configure and run the backend

Write `/opt/algothon/backend.env` (`chmod 600` — it holds the database password):

```ini
ENV=production
PORT=8080
DATABASE_URL=postgres://algothon:<strong-password>@127.0.0.1:5432/algothon?sslmode=disable
ALLOWED_ORIGINS=https://contest.example.com

# nginx runs on the host or in a bridge container. Without trusting the proxy,
# Gin rejects forwarded headers and records the proxy's IP (e.g. 172.18.0.x or
# 127.0.0.1), corrupting audit logs and proctoring IP signals.
TRUSTED_PROXIES=127.0.0.1,172.16.0.0/12

# 12 sandboxes on 16 cores, leaving 4 for the server, nginx and the OS.
# JUDGE_WORKERS is left unset so it tracks RUN_MAX_CONCURRENT - RUN_RESERVE.
RUN_MAX_CONCURRENT=12
RUN_RESERVE=2
RUN_CPU_LIST=4-15

# Sandbox workspaces. The server refuses to start if this is unset.
RUN_WORK_ROOT=/judge-work
```

Run it:

```sh
docker pull ghcr.io/<owner>/<repo>/backend:v1.0.0

docker run -d --name algothon-backend --restart=always \
  --privileged \
  --network host \
  --env-file /opt/algothon/backend.env \
  --tmpfs /judge-work:size=4g,mode=0700 \
  ghcr.io/<owner>/<repo>/backend:v1.0.0
```

- `--privileged` — isolate cannot create cgroups or switch UIDs without it.
- `--network host` — nginx reaches the server on `127.0.0.1:8080` and the peer
  address stays loopback. Sandboxes still get their own network namespace from
  isolate, so submissions have no egress.
- `--tmpfs /judge-work` — a kernel-enforced ceiling on what submissions can
  write. Workspaces are bind-mounted into the sandbox so isolate's `--quota`
  cannot bound them, and `--fsize` caps only one file at a time.

Confirm the boot sequence:

```sh
docker logs algothon-backend | tail -5
# entrypoint: sandbox ready (12 boxes)
# "msg":"migrations applied"
# "msg":"sandbox ready","boxes":12,"judge_workers":10,"run_reserve":2
```

Migrations are embedded in the binary and applied on every start, so there is no
separate migration step.

## Step 7: Create the first admin

The admin API needs an admin to authenticate, so the first one is created
directly. Everyone else is managed in the admin frontend.

```sh
docker exec algothon-backend algothon-usertool -username admin -name "Organizer"
```

The generated password is printed once.

## Step 8: nginx and TLS

`backend/deploy/nginx.conf` is the starting point: it routes `/api/` to the
backend, `/api/v1/submissions/stream` with buffering disabled for SSE, and `/`
to the competitor frontend. It listens on port 80 only, so add TLS:

```sh
sudo cp backend/deploy/nginx.conf /etc/nginx/nginx.conf
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d contest.example.com
```

certbot adds the 443 server block and the redirect. Without it, session cookies
and passwords cross the network in plaintext.

## Step 9: The frontends

The competitor portal has its own image, built by
`.github/workflows/build-frontend.yml` from the repository root (it depends on
the `@mini-algothon/auth` workspace package). Write
`/opt/algothon/frontend.env`:

```ini
API_URL=http://127.0.0.1:8080
COOKIE_SECURE=true
NEXT_PUBLIC_PLATFORM=web
NEXT_PUBLIC_ENABLE_TELEMETRY=true
```

`COOKIE_SECURE` defaults to `false` for local HTTP development. Left that way in
production the session cookie is sent over plain HTTP as well as HTTPS, so
anyone on the network path can lift a competitor's session. Set it once TLS is
in place — and note it fails in the other direction too: `true` on the venue's
plain-HTTP LAN means browsers silently discard the cookie and nobody can sign in.

```sh
docker pull ghcr.io/<owner>/<repo>/competitor-frontend:v1.0.0

docker run -d --name algothon-frontend --restart=always \
  --network host \
  --env-file /opt/algothon/frontend.env \
  ghcr.io/<owner>/<repo>/competitor-frontend:v1.0.0
```

Host networking again, so the portal answers on `127.0.0.1:3000` where
`nginx.conf` already expects it. Deploying to Cloud Run or Vercel instead is
fine — point the `/` location at that URL and drop this container.

The admin console has no image and no location block in `nginx.conf`. Reach it
over an SSH tunnel:

```sh
gcloud compute ssh algothon-judge --zone=us-central1-a -- -L 3001:localhost:3001
```

### Hosting the portals instead

Both front ends deploy as separate projects from this one repo. Each needs its
own **Root Directory** — `competitor-frontend` and `admin-frontend` — so the
platform installs from the workspace root and resolves `@mini-algothon/auth`.
Only the root `pnpm-lock.yaml` is committed; a lockfile inside a package cannot
resolve a `workspace:*` dependency and fails a frozen install.

| | competitor | admin |
| --- | --- | --- |
| `API_URL` | the API's public host | same |
| `COOKIE_SECURE` | `true` | `true` |
| `NEXT_PUBLIC_PLATFORM` | `web` | — |
| `NEXT_PUBLIC_ENABLE_TELEMETRY` | `true` | — |

Two projects on one repo rebuild on every push. Skip the ones that changed
nothing with an ignored-build-step check — including the shared package, which
both depend on:

```sh
git diff --quiet HEAD^ HEAD -- ./ ../packages/auth
```

**Pin the function region next to the API.** The admin console's proctoring
page polls `/api/v1/admin/monitoring` every ten seconds, and every poll is a
round trip from the platform's function to this VM. Vercel defaults new projects
to `iad1` (Washington DC), which for a VM in `asia-southeast1` is most of a
second of network per refresh before a single query runs — far more than the
work the request actually does. `admin-frontend/vercel.json` pins it:

```json
{ "regions": ["sin1"] }
```

Keep it in step with the VM: `sin1` for `asia-southeast1`, `cle1` for
`us-central1`, `iad1` for `us-east1`. The browser-to-function leg is one
request; the function-to-API leg is the one that repeats, so co-locating the
function with the API matters more than co-locating it with the organizer.
Hobby projects are limited to a single region, which is all this needs.

**Put the admin console behind the platform's own access gate.** Publishing it
puts bulk user creation, which returns generated passwords, and the problem
editor, which holds the test cases, on a public URL. Authorization holds up
without it — the dashboard layout validates the session and the `admin` role
server-side, and every `/api/v1/admin/*` route enforces `requireAdmin` again —
but the sign-in page becomes reachable by anyone, throttled only by the
per-username login limit. A gate in front of the whole deployment is what
replaces the SSH tunnel above; a guessable admin username is what defeats it.

The live submission feed is a relative path, so the portal serves it from its own
origin: on the contest LAN nginx owns that path, and off it the route handler at
`src/app/api/v1/submissions/stream/route.ts` proxies it. A hosted function has a
bounded lifetime, and `maxDuration` there is set to the lowest tier's ceiling —
a value above the plan's limit fails the deployment rather than being clamped.
The stream ends when the platform says so, `EventSource` reconnects, and the
poller in `submissions-context` is the backstop.

## Step 10: Observability (Loki, Prometheus)

On the VM, start the collectors. Grafana is **not** part of this -- it sits behind
the `local` Compose profile and runs on your own machine instead:

```sh
docker compose -f monitoring/docker-compose.monitoring.yml up -d
```

Prometheus and Loki bind to `127.0.0.1`, and Node Exporter publishes no host port
at all, so none of them is reachable over the network -- deliberately, since none
of the three has any authentication. Do not open firewall rules for 9090, 3100, or
9100.

To read the data, forward the two ports over IAP and point a local Grafana at them:

```sh
make monitoring-tunnel   # in one shell
make grafana-remote      # in another; Grafana on http://localhost:3002
```

- Pre-provisioned dashboards:
  - **MiniAlgothon - Platform & System Overview**: Live HTTP throughput, P95 latencies, judge workers, runner boxes, database connection pool, and host CPU/RAM.
  - **MiniAlgothon - Logs & Live Diagnostics**: Real-time log streaming with level filtering and error search.
- See [monitoring.md](monitoring.md) for the full local/remote workflow, LogQL/PromQL queries, and the metrics reference.

## Step 11: Verify

```sh
curl -s https://contest.example.com/api/v1/../healthz    # {"status":"ok"}
```

Then run the abuse and load suite from any machine — it is an HTTP client, so it
does not need to be on the VM:

```sh
make judgetest ARGS='-url https://contest.example.com -username <user> -password <pw> -burst 50'
```

It exits non-zero if the CPU limit, wall-clock backstop, fork-bomb containment,
memory cap, network isolation or output truncation fail, so it can gate the
deploy.

---

## Variant: portal on the contest LAN, backend on GCP

For a hall where only one machine has internet. Contestants reach a local box;
it reaches GCP. Everything above still applies to the VM, minus the frontend
container in Step 9.

```mermaid
flowchart LR
    subgraph LAN["Contestant LAN (Air-Gapped / No Internet)"]
        Browser["Contestant Browser / Desktop Client"]
    end

    subgraph VenueHost["Venue Local Machine (Docker Compose)"]
        VenueNginx["Local Nginx Reverse Proxy (Port 80 / 443)"]
        LocalSSR["Competitor Portal Container (Next.js Port 3000)"]
    end

    subgraph CloudGCP["GCP Production VM (Internet Uplink)"]
        CloudBackend["Backend API Container (Port 8080)"]
    end

    Browser -->|"Direct LAN Request"| VenueNginx
    VenueNginx -->|"/ (Serve Local SSR)"| LocalSSR
    VenueNginx -->|"/api/ (Relay to Cloud)"| CloudBackend
    LocalSSR -.->|"Server-side API calls"| CloudBackend
```

This works because every backend call the portal makes runs on the server
(`lib/api/server.ts` and the `"use server"` actions), so the browser never needs
to route to GCP. The two exceptions are handled by the shared origin: the live
submission feed, which the browser opens at the relative path
`/api/v1/submissions/stream`, and the desktop agent's `/api/v1/agent/*` calls.

On the venue machine, `docker-compose.venue.yml` runs the portal and the proxy
together:

```sh
cp .env.example .env        # set API_URL and API_HOST
make venue                  # builds the image, then serves on :80
make venue-logs
make venue-down
```

The proxy config is generated from `backend/deploy/templates/` by the nginx
image's own envsubst pass, so the API hostname and the portal secret come from
`.env` rather than from a committed file. `API_HOST`/`API_PORT`/`API_SCHEME` drive
the relay that carries browser and agent traffic; `API_URL` is the same host, for
the portal's own server-side calls. Keep them in step.

Compose reads `.env` on its own. Anything in the shell or on the make command
line overrides it, so `make venue API_URL=http://other-host` works for a one-off
without editing the file.

Only nginx publishes a port; the portal is reachable through it and nowhere else.
`make venue` prints the LAN address to hand to contestants.

The first build installs dependencies and runs `next build` inside the image, so
expect a few minutes; later runs reuse the layer cache unless the frontend
changed.

### TLS on the LAN

Without it `COOKIE_SECURE` has to stay `false`, and the session token — good for
`SESSION_TTL_HOURS` and accepted as a bearer token, with no IP binding — travels
in cleartext. On WiFi with one shared password that is readable by any contestant
who captures a handshake. Worth avoiding, especially for admin logins.

A private-IP A record is fine: the DNS-01 challenge proves the name over a TXT
record and needs no inbound reachability. Do this while you still have internet.

```sh
mkdir -p secrets certs
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" > secrets/cloudflare.ini
chmod 600 secrets/cloudflare.ini

docker run --rm -it \
  -v "$PWD/letsencrypt:/etc/letsencrypt" -v "$PWD/secrets:/secrets:ro" \
  certbot/dns-cloudflare certonly \
    --dns-cloudflare --dns-cloudflare-credentials /secrets/cloudflare.ini \
    -d contest.example.com --agree-tos -m you@example.com --no-eff-email

cp letsencrypt/live/contest.example.com/{fullchain,privkey}.pem certs/
```

Point `contest.example.com` at the venue machine's LAN IP — either a public A
record (Cloudflare needs proxying off; some registrars reject RFC1918) or a
mapping on the router handed out over DHCP. The router is the more reliable of
the two in a hall with no internet.

Set `PORTAL_SERVER_NAME` in `.env` to the certificate's hostname, then:

```sh
make venue-tls
```

That overlays `docker-compose.venue-tls.yml`, which swaps in the TLS template,
mounts `./certs`, publishes 443, and sets `COOKIE_SECURE=true`.

This secures the contestant-to-venue hop. Venue-to-backend is a separate hop, and
is TLS by default: `API_SCHEME=https` and `API_PORT=443` in `.env.example`, with
`proxy_ssl_server_name` set so SNI reaches the right vhost. It used to default to
port 80, which left agent enrollment tokens and telemetry crossing the internet in
cleartext while the portal's own calls were encrypted — if you override these, keep
them on 443.

Certificates last 90 days and renewing needs internet plus DNS access, so reissue
before the event rather than during it. Avoid self-signed certificates and
mkcert: they mean installing a CA on every contestant machine, and teaching
contestants to click through certificate warnings costs more than it saves.

Build the desktop client against the local box, not GCP, or the loopback agent
answers an Origin no contestant is browsing and attestation fails on every
machine. Scheme and host must match what contestants actually type:

```sh
MINIALGOTHON_SERVER_URL=https://contest.example.com \
MINIALGOTHON_API_URL=https://contest.example.com \
  cargo tauri build
```

On the VM, set `TRUSTED_PROXIES` to the API's own nginx. Every contestant behind the
venue relay reaches the API from one address, so the per-IP login limit is sized for
that rather than for a single machine — the per-username limit is what bounds a
brute-force attempt against one account.

`ALLOWED_ORIGINS` is not an access control here and never was. Every portal call is
server-to-server, so no `Origin` is sent and no preflight happens; restricting it
stops nothing, and anyone can still reach the API directly. What actually gates
access is the session token, enforced per-route.

The uplink is now a contest-wide single point of failure, and every page
navigation is an SSR round trip across it. The whole stack runs under
`docker compose` locally, so keep it staged on the venue machine as a fallback:
recovery is `API_URL` plus the nginx upstream.

---

## Horizontal Scaling: Multi-VM & Multi-Account Workers

When running large competitions (e.g. 100–300+ competitors) or when per-account vCPU quotas require distributing worker compute across multiple cloud accounts, the platform scales by separating API traffic from background code execution workers.

### Distributed Architecture

```mermaid
flowchart TD
    Ingress["Ingress Traffic / Load Balancer (Port 80 / 443)"]
    APIGateway["API Gateway VM: Node 1 (JUDGE_WORKERS=0)"]

    subgraph StorageLayer["Database Layer (Persistent SSD)"]
        PostgresDB[("PostgreSQL 16 Engine: FOR UPDATE SKIP LOCKED & LISTEN/NOTIFY")]
    end

    subgraph WorkerCluster["Distributed Worker Cluster (Multi-Account Scaling)"]
        Worker1["Worker VM 1 (GCP Account A)<br/>cmd/worker (8 Isolate Boxes)"]
        Worker2["Worker VM 2 (GCP Account B)<br/>cmd/worker (8 Isolate Boxes)"]
        Worker3["Worker VM 3 (GCP Account C)<br/>cmd/worker (8 Isolate Boxes)"]
    end

    Ingress --> APIGateway
    APIGateway -->|"Transactions & Event Notifications"| PostgresDB

    PostgresDB -.->|"LISTEN: judge_new_submission"| Worker1
    PostgresDB -.->|"LISTEN: judge_new_submission"| Worker2
    PostgresDB -.->|"LISTEN: judge_new_submission"| Worker3

    Worker1 -->|"Atomic Claim: SKIP LOCKED"| PostgresDB
    Worker2 -->|"Atomic Claim: SKIP LOCKED"| PostgresDB
    Worker3 -->|"Atomic Claim: SKIP LOCKED"| PostgresDB

    Worker1 -.->|"NOTIFY: judge_verdicts"| PostgresDB
    Worker2 -.->|"NOTIFY: judge_verdicts"| PostgresDB
    Worker3 -.->|"NOTIFY: judge_verdicts"| PostgresDB

    PostgresDB -.->|"Broadcast Verdicts"| APIGateway
```

### Worker Claim & Broadcast Mechanics

1. **Atomic Queue Claiming**:
   Worker processes (`./cmd/worker`) query PostgreSQL using:
   ```sql
   SELECT ... FROM submissions s
   WHERE s.state = 'queued'
   ORDER BY ((tc.pending_count - 1) * 10 - EXTRACT(EPOCH FROM (NOW() - s.created_at))) ASC
   FOR UPDATE OF s SKIP LOCKED
   LIMIT 1;
   ```
   Multiple workers running across different VMs claim distinct submissions simultaneously with zero lock contention or duplicate evaluations.
2. **Event-Driven Wakeup (`LISTEN/NOTIFY`)**:
   When a competitor submits, PostgreSQL executes `pg_notify('judge_new_submission', '')`. All workers wake up immediately without waiting for poll intervals (with a 1-second fallback).
3. **Cross-VM Verdict Broadcasting**:
   When any worker completes judging, it broadcasts the verdict over `pg_notify('judge_verdicts', ...)`. The API server listens on this channel and pushes the result via SSE stream to the competitor's browser in real time.
4. **RAM Testcase Pre-warming**:
   Workers pre-warm problem testcases into memory on boot using `testCache` and periodically sync updates, eliminating repetitive testcase queries from the database during high-frequency evaluation.

### Worker Crash Resilience & Lease Reaper

If a worker node crashes, is killed by OOM, or loses network connectivity mid-evaluation:
- The row is **not** locked indefinitely. It holds an application lease (`lease_until = NOW() + 60s`).
- The running worker sends heartbeats every 20 seconds. If the worker dies, heartbeats stop.
- Every 10 seconds, the background lease reaper runs:
  ```sql
  UPDATE submissions
  SET state = 'queued', attempts = attempts + 1,
      claimed_at = NULL, claimed_by = NULL, lease_until = NULL
  WHERE state = 'running' AND lease_until < NOW();
  ```
- The submission is automatically re-queued and claimed by another live worker VM.
- **Poison-Pill Protection**: If faulty or toxic code crashes workers 3 times in a row (`attempts >= 3`), the reaper marks the submission as `failed` with verdict `IE` (Internal Error) instead of retrying forever.

---

## Multi-Account GCP Worker Networking

If quota limits prevent provisioning all worker VMs in a single GCP project, workers can be distributed across multiple GCP accounts without opening the database to the public internet.

### Option 1: Native GCP Firewall with Static External IPs (Recommended)

1. **Reserve Static External IPs**:
   - In each GCP Account (Worker VM 1, 2, 3), navigate to **VPC Network > IP addresses > Reserve External Static IP**.
   - Attach the static IP to the respective worker VM (e.g. `35.200.20.2`, `34.300.30.3`).
2. **Configure Database Firewall (Account 1)**:
   - In the Database GCP project, create a firewall rule allowing TCP 5432 **only** from the specific worker static IPs:
     ```text
     Targets: Tag "postgres-server"
     Source IPv4 ranges: 35.200.20.2/32, 34.300.30.3/32, <api-server-ip>/32
     Protocols and ports: tcp:5432
     ```
   - Never use `0.0.0.0/0`.
3. **Enforce SSL on PostgreSQL**:
   - In `postgresql.conf`, configure `ssl = on`.
   - In `pg_hba.conf`, require `hostssl` with SCRAM-SHA-256 authentication for external worker IPs.
   - On worker VMs, connect using:
     ```bash
     DATABASE_URL=postgres://algothon:password@<DB-STATIC-IP>:5432/algothon?sslmode=require
     ```

### Option 2: Tailscale Mesh VPN (Zero Public Ports)

1. Install Tailscale on the Database VM and all Worker VMs:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
2. Each machine joins a private encrypted WireGuard mesh network and receives a private IP (`100.x.y.z`).
3. Workers connect directly to the database via its Tailscale IP:
   ```bash
   DATABASE_URL=postgres://algothon:password@100.x.y.z:5432/algothon?sslmode=disable
   ```
4. Port 5432 remains completely closed to the external internet.

---

## PostgreSQL Sizing & Connection Limits

| Component | Default Pool | Recommended for Scaling |
| :--- | :--- | :--- |
| **API Server** | `DB_MAX_CONNS=25`, `DB_MIN_CONNS=5` | `DB_MAX_CONNS=25`, `DB_MIN_CONNS=5` |
| **Worker VM (per node)** | `DB_MAX_CONNS=25`, `DB_MIN_CONNS=5` | `DB_MAX_CONNS=8`, `DB_MIN_CONNS=2` |
| **PostgreSQL Engine** | `max_connections=100` | `max_connections=250` (or `300`) |

### Database VM Storage Persistence

- In Google Cloud, VMs use **Persistent Disks (PD)**.
- Data stored in mounted Docker volumes (e.g. `/var/lib/postgresql/data`) is persisted on the physical disk across VM stops, reboots, and starts.
- For disaster recovery, schedule periodic disk snapshots via GCP Console: **Compute Engine > Disks > Create Snapshot**.

---

## Security & Audit Controls

1. **Immutable Audit Logging**:
   - Administrative and security events are logged to the `audit_logs` table via non-blocking asynchronous writes (`RecordAsync`).
   - Monitored events include authentication successes/failures, account lockouts, user and team management, contest timer adjustments, problem changes, submission rejudges, and proctor overrides.
   - Available in the Admin Portal under **Audit Logs** (`/audit`) and via `GET /api/v1/admin/audit-logs`.
2. **Admin Account Protection**:
   - Root administrator accounts cannot be deleted, suspended, demoted, or reset via the web API.
   - Admin UI action buttons are visually disabled for admin rows with informative tooltips.
3. **Brute-Force Lockout**:
   - Failed login attempts are tracked per-username. 5 consecutive failures triggers an automatic 15-minute account lockout.
4. **Session Lifetime Separation**:
   - Administrator sessions expire after 12 hours (`ADMIN_SESSION_TTL_HOURS=12`).
   - Competitor sessions expire after 3 hours (`SESSION_TTL_HOURS=3`).
5. **Search Engine De-indexing**:
   - Internal platform routes are blocked in `robots.ts` and marked with `noindex, nofollow` headers.
   - Public informational pages are served at `/support` (FAQ & contact action), `/privacy` (telemetry disclosures & liability), and `/contact`.

---

## Upgrading

```sh
docker pull ghcr.io/<owner>/<repo>/backend:v1.1.0
docker stop algothon-backend && docker rm algothon-backend
docker run -d --name algothon-backend ...   # same flags, new tag
```

Restarting drops in-flight submissions. The lease reaper requeues them within
about a minute, so deploy between rounds rather than mid-contest.

To roll back, run the previous tag. Migrations are not reversed automatically —
check whether the release added any before rolling back.

## Settings that matter

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://...` | Connection URI for PostgreSQL database. |
| `DB_MAX_CONNS` | `25` | Maximum active connections in pgxpool (tune to 8-10 on worker nodes). |
| `DB_MIN_CONNS` | `5` | Warm idle connections kept open to prevent connection establishment storms. |
| `JUDGE_WORKERS` | `-1` (auto) | Worker threads. Set to `0` on the API server for pure API gateway mode. |
| `RUN_MAX_CONCURRENT` | `4` (dev) / `12` (prod) | Sandboxes provisioned in isolate. Match VM physical cores. |
| `RUN_RESERVE` | `1` | Sandboxes reserved for interactive `/run` calls so test runs don't queue behind batch submissions. |
| `RUN_WORK_ROOT` | `/judge-work` | Path to tmpfs mount for isolated sandbox workspaces. Refuses to start if unset. |
| `RUN_CPU_LIST` | `""` | Pin sandboxes to specific cores (e.g. `4-15`), leaving cores 0-3 for OS and API server. |
| `TRUSTED_PROXIES` | `""` | IP ranges allowed to set forwarded client IP headers (`127.0.0.1` behind reverse proxy). |
| `SESSION_TTL_HOURS` | `168` (dev) / `3` (prod) | Competitor session token validity duration. |
| `ADMIN_SESSION_TTL_HOURS` | `12` | Administrator session token validity duration. |
| `ENV` | `development` | Setting to `production` disables Swagger UI and enforces strict security policies. |
| `ALLOWED_ORIGINS` | `http://localhost:...` | Permitted browser origins for CORS headers. |

