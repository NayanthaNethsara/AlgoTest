# Rate-Limit Incident Runbook: Shared Egress IP (Firebase App Hosting)

Backup reference for a specific failure mode: legitimate contestants getting
`429`s during a contest because the nginx edge limiter is IP-keyed, and the
competitor frontend's server-to-server calls to the backend no longer come
from a co-located, trusted network.

## Background

`docs/deployment.md` (Security & Audit Controls, item 6) already flags this:

> These guarantees depend on the competitor frontend staying co-located with
> the backend... A standalone/serverless deployment of the frontend would
> need the same real-IP trust chain re-established at that edge — otherwise
> server-to-server traffic from the serverless platform collapses many
> distinct competitors onto one shared egress IP for both rate limiting and
> audit logging.

The competitor frontend now runs on **Firebase App Hosting**, which is built
on Cloud Run and does **not** provide a static/dedicated outbound IP by
default. That warning is no longer hypothetical.

## Symptom

Cloud Run / App Hosting logs show a steady stream of `POST` requests to a
challenge page (e.g. `/challenges/<slug>`) roughly every 1.5s per active
submission — this is expected. It's the `getSubmissionStatusAction` Server
Action poll loop in
[`submissions-provider.tsx`](../competitor-frontend/src/components/portal/submissions-provider.tsx#L255-L278),
a backup to the SSE stream (`/api/v1/submissions/stream`), which stays alive
for as long as a submission is `queued`/`running` — longer for problems with
large test-case counts.

If **many** contestants have long-running submissions active at once (e.g.
everyone hitting a large-test-count problem near a deadline), this traffic —
plus SSE reconnects, `/me`, `/leaderboard`, etc. — funnels through the
frontend's `backendFetch` calls to the nginx-fronted backend VM. If those all
share one Google-managed egress IP, they land in a single bucket at nginx.

Where the limit lives:

- Zone definition: `backend/deploy/api-tls.conf` — `api_general_limit`,
  `rate=100r/s` (see also `nginx.conf`, kept in sync).
- Applied at the location: `backend/deploy/api-locations.conf`, the
  `location /api/` block — `limit_req zone=api_general_limit burst=150
  nodelay;`. This is what `/api/v1/submissions/:id` polling falls under.
- Per-user application-level limiter (`submissionStatusLimiter`,
  `backend/internal/api/middleware.go`) is **not** the bottleneck here — it's
  keyed per authenticated user ID (1 req/s sustained, burst 60), so one
  user's polling can't consume another user's quota. The exposure is only at
  the IP-keyed nginx tier.
- `/api/v1/submissions/stream` (SSE) already bypasses `limit_req` entirely
  (`api-locations.conf` lines 4-6) — only a connection cap applies.

## Immediate mitigation (during a live competition, zero downtime)

`nginx` reads its config from files bind-mounted by `docker-compose.prod.yml`
(read-only volumes into the `nginx` container). Edit on the VM and reload —
no container restart, no backend/frontend redeploy:

```bash
# 1. Edit the rate/burst values (see below)
# 2. Validate syntax before touching the live process
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# 3. Hot-reload — in-flight connections are unaffected
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Values to raise, in `backend/deploy/api-tls.conf`:

```nginx
limit_req_zone $rate_limit_key zone=api_general_limit:10m rate=300r/s;  # was 100r/s
```

and in `backend/deploy/api-locations.conf` (the `/api/` and `/` blocks):

```nginx
limit_req zone=api_general_limit burst=400 nodelay;  # was 150
```

Keep `nginx.conf` in sync with `api-tls.conf`/`api-locations.conf` — it
duplicates the same zone definitions for the non-TLS/dev path.

This buys headroom fast but doesn't fix the root cause: it raises the
ceiling for the entire shared bucket, including whatever anonymous/attack
traffic the limiter also protects against.

## Root-cause fix (not yet implemented — do this before it becomes urgent)

Stop IP-gating traffic that's already authenticated and rate-limited
per-user by the Go backend. Trust it via a shared secret instead of an IP
check, mirroring the existing internal-network exemption
(`geo $remote_addr $is_internal_network` in `api-tls.conf`):

1. Backend defines an env var, e.g. `INTERNAL_API_TOKEN`.
2. Firebase App Hosting's `backendFetch` (`competitor-frontend/src/lib/api/server.ts`)
   sends it as a header, e.g. `X-Internal-Token: <token>`.
3. In `api-tls.conf`, add a `map` on that header so a matching request gets
   `$rate_limit_key = ""` (exempt), the same way the RFC1918 check does today:
   ```nginx
   map $http_x_internal_token $is_trusted_frontend {
       default 0;
       "<token value, or better: validate length/match via if>" 1;
   }
   ```
   (Prefer comparing against an nginx-side copy of the secret, injected via
   the same deploy mechanism as the TLS certs, not hardcoded in the repo.)
4. Public/anonymous traffic keeps the strict 100r/s edge limit untouched —
   only the trusted frontend-to-backend path is exempted.

This removes the shared-IP false-positive risk instead of just widening the
window that a big-enough burst can still re-trigger.

## Longer-term alternative

Confirm whether Firebase App Hosting can be given a static/dedicated
outbound IP (e.g. via Serverless VPC Access + Cloud NAT reserved IP, if
supported for App Hosting backends). If so, add that IP to the trusted
range in `api-tls.conf` instead of / in addition to the shared-secret
approach. Untested against App Hosting specifically as of this writing —
verify support before relying on it.
