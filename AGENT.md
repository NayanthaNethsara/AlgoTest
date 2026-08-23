# Agent Rules

General rules for working in this repo.

## Code Style

- Keep proper folder structure.
- Code should be self-explanatory (clear names, small functions).
- Do not comment. Only comment when strictly necessary.
- No unused abstractions, no speculative/future-proofing code. Build only what is asked.
- Use semantic color tokens (`bg-success`, `text-destructive`, etc.), not raw colors.
- Keep one color language per visual signal. Don't reuse the same palette for two different meanings in the same view.

## Backend Architecture & Practices (`backend/`)

- **Layer Separation**:
  - `internal/api/` is strictly the transport layer. It handles routing, request parsing/validation, middleware, and HTTP responses.
  - Zero direct database queries or raw SQL allowed in `api/`.
- **Package-by-Feature (Vertical Slicing)**:
  - Organize domains vertically (`internal/<domain>/`). Each domain owns its entities, state machines, business logic, and data access.
  - Avoid horizontal layering packages (`controllers/`, `services/`, `models/`, `repositories/`) to eliminate circular dependencies.
- **Data Access & Repositories**:
  - 100% of database operations and transactions must live behind repository layers.
  - Use native parameterized queries with `pgx/v5` (`*pgxpool.Pool`). Do not use ORMs or SQL code generation.
  - Keep domain repository files focused and split by responsibility rather than creating monolithic files.
- **Execution Sandbox**:
  - `internal/runner` executes untrusted code using `isolate` and requires a Linux environment with cgroup v2. It runs inside Docker locally and provisions directly on host in production.

## Frontend Architecture & Practices

- **Feature-Driven Structure**:
  - Group domain types and components by feature area rather than technical role.
  - Component locality: Components scoped to a single feature stay within that feature folder. Only reusable primitives go into shared UI directories.
- **Data Mutations & Server Actions**:
  - Use Next.js Server Actions (`"use server"`) for mutations and API calls.
- **State Synchronization**:
  - Keep timers and contest state synchronized with server timestamps to avoid client clock drift.

## Git

- Do not commit or push. The user reviews and commits changes themselves.
- Do not add AI as a co-author in commit messages.
- Commit messages should be short and to the point.

## Running the App

- Do not start servers, run `make backend`/`make frontend`/`make dev`, or launch long-running processes. The user runs the app themselves in their own terminals. Read-only checks (e.g. `lsof`, `curl` against an already-running service, log inspection) are fine.
