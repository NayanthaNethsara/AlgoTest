# Agent Rules

General rules for working in this repo.

## Code Style

- Keep proper folder structure.
- Code should be self-explanatory (clear names, small functions).
- Do not comment. Only comment when strictly necessary.
- No unused abstractions, no speculative/future-proofing code. Build only what is asked.
- Use semantic color tokens (`bg-success`, `text-destructive`, etc.), not raw colors.
- Keep one color language per visual signal. Don't reuse the same palette for two different meanings in the same view.

## Backend Domain File Structure & Naming Guide (`backend/`)

Every domain follows a standardized vertical layout:

### 1. Domain Package (`backend/internal/<domain>/`)
- `<domain>.go`:
  - Contains domain structs, models, and domain-specific enums/constants.
  - Contains pure business logic and validation functions (e.g. `ValidateSlug`, `ClampLimits`, `ValidateTestPoints`).
  - **Zero database or HTTP transport imports**.
- `repository.go`:
  - Contains the `Repository` struct with `NewRepository(pool *pgxpool.Pool)`.
  - Implements all database queries, mutations, and transactions using native parameterized `pgx/v5` SQL.
  - Specialized domain queries (e.g. `leaderboard.go`, `queue.go`) are separated into focused files with clear descriptive names.
- `<domain>_test.go`:
  - Pure unit tests covering domain validation, algorithms, and point distribution logic.

### 2. Transport & HTTP Layer (`backend/internal/api/`)
- `<domain>.go`: Competitor-facing HTTP handlers (e.g. `problems.go`, `teams.go`, `contest.go`).
- `admin_<domain>.go`: Admin-only HTTP handlers (e.g. `admin_problems.go`, `admin_teams.go`, `admin_contest.go`).
- `router.go`: Registers all routes with appropriate middleware (`requireUser`, `requireAdmin`, `rateLimit`).

---

## Frontend Domain File Structure & Validation Guide

Every domain on the frontend follows a standardized feature-driven layout:

### 1. TypeScript Types (`src/types/<domain>.ts` or `@mini-algothon/*`)
- Declares static TypeScript interfaces, DTOs, and view models.

### 2. Zod Runtime Validation (`src/lib/validation/<domain>.ts`)
- Contains all runtime Zod validation schemas:
  - `<domain>InputSchema` (e.g. `problemInputSchema`, `teamInputSchema`).
  - Sub-entity schemas (e.g. `sampleSchema`, `testCaseInputSchema`).
  - Action-specific schemas (e.g. `replaceTestsSchema`, `changePasswordSchema`).
- Contains `.superRefine(...)` rules for complex cross-field validation.
- Exports inferred TypeScript types: `export type Validated<Domain>Input = z.infer<typeof ...>`.

### 3. Server Actions (`src/lib/actions/<domain>.ts` or `src/actions/<domain>.ts`)
- Server Actions (`"use server"`) for mutations and API calls.
- Every mutation executes `schema.safeParse(input)` before sending requests to the backend.
- Formats and surfaces Zod validation errors immediately back to the UI.

### 4. Components & Pages
- `src/components/<domain>/`: Feature-specific components, tables, modals, and forms.
- `src/app/(dashboard)/<domain>/` or `src/app/(portal)/<domain>/`: Next.js App Router pages.

---

## Git

- Do not commit or push. The user reviews and commits changes themselves.
- Do not add AI as a co-author in commit messages.
- Commit messages should be short and to the point.

## Running the App

- Do not start servers, run `make backend`/`make frontend`/`make dev`, or launch long-running processes. The user runs the app themselves in their own terminals. Read-only checks (e.g. `lsof`, `curl` against an already-running service, log inspection) are fine.
