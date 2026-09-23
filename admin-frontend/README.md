# Labyrithm Admin Management Portal

The Labyrithm Admin Portal is a specialized Next.js 15 web application for platform operators, educators, assessment authors, and contest organizers. It provides real-time session orchestration, problem authoring, user and team administration, submission review, live proctoring telemetry monitoring, and immutable audit-log exploration.

---

## Design System & UX Principles

- **Framework**: Next.js 15 (App Router) with React 19, TypeScript, and Tailwind CSS.
- **Component System**: Custom zero-radius shadcn/ui components (`rounded-none`) following the zinc / base-lyra aesthetic.
- **Visual Hierarchy**: High-density data tables, monospaced numeric readouts, semantic badge tokens (`bg-success`, `text-destructive`), and clear textual status indicators.
- **Strict Styling Rules**: Purely text-based interface with zero emojis, high contrast, and keyboard-accessible modal dialogs.

---

## Feature Modules & Routes

### 1. Contest Operations & Timer (`/timer`)

- **Lifecycle Transitions**: Start countdown, pause contest, resume contest, extend contest duration, freeze scoreboard, unfreeze scoreboard, reset contest data, and end contest.
- **Real-Time State Sync**: Polls contest status and synchronizes timer across all open administrative sessions.

### 2. Problem Authoring & Testcase Management (`/problems`)

- **Problem Editor** (`/problems/new`, `/problems/[id]/edit`): Markdown statement editor with live preview, input/output specifications, constraints, and sample cases.
- **Testcase Suite** (`/problems/[id]`):
  - View public sample tests and private evaluation tests.
  - Configure individual test point weightings (defaulting to equal splits) or subtask groups.
  - Set execution limits: Time limit (milliseconds) and memory limit (megabytes).
  - Batch upload testcases via ZIP archives.

### 3. User & Team Administration (`/users`, `/teams`)

- **User Management** (`/users`):
  - Search and filter by username, email, full name, role (`admin`, `contestant`, `proctor`), and account status (`active`, `suspended`).
  - Single user creation and bulk CSV import.
  - Password reset generation.
  - Account suspension and restoration.
  - Lockout status indicators (displaying brute-force lockout expiration).
  - **Root Admin Protection**: Administrative rows visually disable deletion, demotion, and suspension actions with contextual tooltips to prevent accidental lockout.
- **Team Management** (`/teams`):
  - Team creation, roster configuration, competitor assignments, and team disbandment.

### 4. Submission Inspection & Rejudging (`/submissions`)

- **Comprehensive Submission Feed**: Filter submissions by contest problem, user, team, language, and evaluation verdict (`AC`, `WA`, `TLE`, `MLE`, `OLE`, `RTE`, `CE`, `IE`).
- **Detailed Submission Modal**:
  - Full syntax-highlighted source code viewer.
  - Per-testcase breakdown: execution time, memory consumed, exit code, diff between actual and expected output, and compiler diagnostic logs.
- **Rejudging Controls**:
  - Rejudge individual submission: Re-queues the submission atomically in PostgreSQL.
  - Problem-wide rejudge: Re-queues all submissions for a selected problem (e.g. after updating flawed testcases or adjusting time limits).
  - Cancel in-flight evaluation.

### 5. Live Proctoring & Anomaly Monitoring (`/monitoring`)

- **Live Participant Grid**:
  - Real-time heartbeat indicators, connection latency, and active desktop window titles.
  - Visual status chips: Active, Inactive, Exemption Granted, or Revoked.
- **Monitoring Sub-Consoles**:
  - `/monitoring/agents`: Enrolled desktop agents, agent versions, and machine IDs.
  - `/monitoring/telemetry`: High-throughput live event stream of window focus, blur, full-screen transitions, and screen configurations.
  - `/monitoring/risk`: Heuristic risk score ranking (0 to 100) identifying high-probability academic integrity violations.
- **Participant Detail & Remediation** (`/monitoring/[userId]`):
  - Complete chronological event timeline.
  - Focus loss duration tracker.
  - Administrative action triggers:
    - **Revoke Submission Access**: Locks participant from submitting solutions (`423 Locked`).
    - **Readmit Participant**: Restores submission privileges.
    - **Grant Temporary Exemption**: Sets a timed exemption window bypassing proctor requirements.
    - **Grant Web-Only Fallback Access**: Allows submission directly from a web browser when the desktop agent cannot run on hardware (e.g. locked Chromebooks).

### 6. Immutable Audit Log Dashboard (`/audit`)

- **Search & Filtering**:
  - Full-text search across actor usernames, target identifiers, and action names.
  - Multi-dimensional filtering by action category (`auth.*`, `user.*`, `team.*`, `contest.*`, `problem.*`, `submission.*`, `proctor.*`).
  - Status filters (`success`, `failure`, `locked`).
- **Audit Table**: Actor username, role, action, target entity, outcome badge, client IP address, and timestamp.
- **Raw JSON Inspection Dialog**: Modal viewer for examining structured context and diffs within the `details` JSONB column.
- **Pagination**: Server-side pagination with customizable page sizes.

### 7. Public Informational Pages (`/support`, `/privacy`, `/contact`)

- Publicly accessible support FAQ, contact forms, and privacy disclosures.
- Excluded from search engine crawlers via `robots.ts` (`noindex, nofollow`).

---

## Security & Access Control

- **Server-Side Authentication**: Protected routes enforce session validation in [src/proxy.ts](file:///Users/nayanthanethsara/Documents/Github/labyrithm/admin-frontend/src/proxy.ts) via the backend `/api/v1/me` endpoint.
- **Role Verification**: Non-admin users attempting to access dashboard routes are redirected to `/login`.
- **Session Lifetime**: Administrator sessions expire after 12 hours (`ADMIN_SESSION_TTL_HOURS=12`).
- **Production Cookie Policy**: Enforces `Secure; HttpOnly; SameSite=Lax` cookies when `COOKIE_SECURE=true`.

---

## Environment Configuration

Configure environment variables in `.env.local`:

```ini
# Backend API Base URL
API_URL=http://127.0.0.1:8080

# Production Cookie Security (set true behind HTTPS)
COOKIE_SECURE=false

# Support Contact Address
NEXT_PUBLIC_SUPPORT_EMAIL=organizer@example.com
```

---

## Development & Build Commands

```sh
# Install dependencies
pnpm install

# Start development server (port 3001)
pnpm dev

# Build production bundle
pnpm build

# Start production server
pnpm start

# Run linter and formatting check
pnpm lint
pnpm format:check
```
