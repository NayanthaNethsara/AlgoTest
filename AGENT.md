# Agent Rules

General rules for working in this repo.

## Code style

- Keep proper folder structure;
- Code should be self-explanatory (clear names, small functions).
- Do not over-comment. Only comment when the "why" isn't obvious from the code itself.
- No unused abstractions, no speculative/future-proofing code. Build only what's asked.
- Use semantic color tokens (`bg-success`, `text-destructive`, etc.), not raw colors.
- Keep one color language per visual signal. Don't reuse the same palette for two
  different meanings in the same view (e.g. difficulty badges and status badges must
  not share colors — pick one dimension to carry color and keep the other neutral).

## Structure

### Backend (`backend/`)

Go + Gin, API and judge worker in one binary.

- `cmd/server` — entrypoint
- `internal/config` — env-based configuration
- `internal/api` — HTTP routes and handlers
- `internal/judge` — submission queue, workers, results
- `internal/runner` — the `/api/v1/run` sandbox. Executes untrusted code with
  isolate, which needs a **Linux host** with cgroup v2 and the language
  toolchains installed, so the server does not start natively on macOS. Locally
  it runs in a privileged Linux container ([backend/Dockerfile](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/backend/Dockerfile), wired up as
  the `backend` service in `docker-compose.yml`); production provisions a real
  host with `backend/deploy/provision-isolate.sh`.

### Frontend (`frontend/`)

Next.js App Router + shadcn.

- `src/types/` — shared domain types, grouped by feature (`problem.ts`, `code.ts`,
  `history.ts`, `challenge.ts`, ...). Types used by a single component stay inline in
  that component instead of moving here.
- `src/actions/` — Next.js server actions (`"use server"`). The Go backend isn't wired
  up for these yet, so they mock their result inline. Keep function signatures
  (params/return types) matching what the real backend will need, so swapping the mock
  body for a real call is the only change required later.
- `src/hooks/` — client-side hooks.
- `src/lib/` — plain data and helper functions, no React.
- `src/components/ui/` — shadcn primitives, added via `pnpm dlx shadcn@latest add
  <name>`. Don't hand-edit generated internals beyond normal wiring.
- `src/components/common/` — components shared across more than one feature.
- `src/components/<feature>/` — components scoped to one feature area (e.g.
  `workspace/`, `problem/`, `challenges/`, `portal/`).
- Routing uses App Router route groups for layout boundaries — e.g. `(portal)` wraps
  authenticated pages in the top nav, while pages like `/login` stay outside it.

## Git

- Do not commit or push. The user reviews and commits changes themselves.
- Do not add Claude/AI as a co-author in commit messages.
- Commit messages should be short and to the point (no long bodies unless necessary).

## Running the app

- Do not start servers, run `make backend`/`make frontend`/`make dev`, or otherwise
  launch long-running processes. The user runs the app themselves in their own
  terminals. Read-only checks (e.g. `lsof`, `curl` against an already-running
  service, log inspection) are fine.
