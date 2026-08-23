# Deployment Guide

How to run MiniAlgothon on a single Google Compute Engine VM: image built by
GitHub Actions, published to GitHub Container Registry, pulled and run manually
on the host.

---

## Topology

```
                    internet
                       |
                    :80 :443
                       |
   ┌───────────────────────────────────────────────┐
   │ GCE VM (Ubuntu 24.04, t2d-standard-16)        │
   │                                               │
   │  nginx ──► :8080  backend container           │
   │    │              (privileged, isolate,       │
   │    │               g++ / python3 / node)      │
   │    └────► :3000  competitor frontend          │
   │                                               │
   │           :5432  postgres container + volume  │
   └───────────────────────────────────────────────┘
```

Everything is on one VM. The judge queue is safe across several VMs
(`FOR UPDATE SKIP LOCKED` plus leases), but the SSE broadcaster, rate limiters
and the judge's test cache are per-process, so a second VM degrades live
progress and doubles rate limits. One larger VM is the right answer until a
node failing mid-contest is a bigger worry than throughput.

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

# nginx runs on the host and the container shares its network namespace, so
# forwarded headers arrive from loopback. Without this every competitor's
# recorded IP is 127.0.0.1 and the proctor's IP signals are worthless.
TRUSTED_PROXIES=127.0.0.1

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

```
   contestant LAN (no internet)        venue uplink        GCP VM
     browser --> nginx :80 --+-- /api/ ------------------> backend :8080
                             `-- /     --> Next :3000
                                          (local, SSR)
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

| Variable | Why |
| --- | --- |
| `RUN_WORK_ROOT` | Must point at the tmpfs. The server refuses to boot without it, because otherwise a submission can fill the host disk. |
| `TRUSTED_PROXIES` | `127.0.0.1` behind nginx. Unset means every competitor's IP reads as loopback. |
| `RUN_MAX_CONCURRENT` | Sandboxes at once. The entrypoint provisions isolate with a matching `num_boxes`; leave cores for the server and OS. |
| `JUDGE_WORKERS` | Leave unset — it tracks `RUN_MAX_CONCURRENT - RUN_RESERVE`, so a bigger host needs one change, not two. |
| `RUN_RESERVE` | Sandboxes held back from batch judging so interactive Run never queues behind submissions. |
| `RUN_CPU_LIST` | Pins sandboxes to specific cores, keeping them off the ones running the server. |
| `SESSION_TTL_HOURS` | Keep it near the contest length. A token stays valid this long, is accepted as a bearer token, and is readable by its owner out of devtools. |
| `ENV` | `production` also disables the Swagger UI, which maps every route including the admin surface. |
| `ALLOWED_ORIGINS` | Your real domain — but see below: this is not an access control. |

