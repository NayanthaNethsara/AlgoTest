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
in place.

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
over an SSH tunnel rather than publishing it:

```sh
gcloud compute ssh algothon-judge --zone=us-central1-a -- -L 3001:localhost:3001
```

## Step 10: Verify

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
| `ALLOWED_ORIGINS` | Your real domain. |
