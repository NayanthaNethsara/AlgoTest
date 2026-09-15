# Algothon Competitor Portal

The Algothon Competitor Portal is a Next.js web application designed for contest participants. It provides an intuitive coding interface with the Monaco code editor, real-time Server-Sent Events (SSE) submission updates, an interactive leaderboard, and background proctoring telemetry synchronization.

---

## Key Features & User Interface

### 1. Challenge Browser (`/challenges`)
- Displays all published contest problems with point values, difficulty indicators, and participant completion status.
- Real-time synchronization with contest lifecycle states (upcoming, active, frozen, ended).

### 2. Code Solver & Editor (`/challenges/[id]`)
- **Monaco Code Editor**: Full-featured code editor with syntax highlighting, autocomplete, and indentation formatting.
- **Supported Programming Languages**:
  - C++ (GCC 13, C++20)
  - Python (Python 3.12)
  - Java (OpenJDK 21)
  - Rust (Rust 1.78+)
  - Go (Go 1.25+)
  - JavaScript (Node.js 20 LTS)
- **Fast Test Execution (`Run`)**:
  - Executes code against sample cases or custom standard input.
  - Returns stdout, stderr, execution time, and memory usage within seconds.
  - **Always allowed**: Does not require an active proctor agent.
- **Official Submission (`Submit`)**:
  - Atomically enqueues solution into the distributed PostgreSQL judge queue.
  - Evaluated against full private test suites in the Linux `isolate` sandbox.
  - **Proctor-Gated**: Requires an enrolled proctor agent or an administrative web-only fallback grant.

### 3. Real-Time Submissions Feed (`/submissions`)
- Connects directly to the Server-Sent Events (SSE) stream (`/api/v1/submissions/stream`).
- Automatically updates submission status in real time (`queued` -> `running` -> final verdict).
- Displays testcase pass/fail counts, execution time, and memory consumed.

### 4. Contest Scoreboard (`/leaderboard`)
- Dynamic ranking based on solved problems, partial testcase points, and cumulative penalty time.
- **Scoreboard Freeze**: Automatically indicates when the scoreboard has been frozen by contest organizers.

### 5. Participant Documentation (`/docs`)
- Language-specific compiler flags, runtime versions, and standard I/O optimization tips (e.g. `cin.tie(NULL)`, `sys.stdin.read`).

### 6. Public Informational Pages (`/terms`, `/privacy`, `/support`, `/rules`)
- Contest rules, academic honesty policies, privacy disclosures, and technical support FAQs.

---

## Proctoring & Telemetry Integration

The competitor portal integrates with the proctoring engine via [src/components/portal/browser-lockdown.tsx](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/competitor-frontend/src/components/portal/browser-lockdown.tsx) and [src/actions/telemetry.ts](file:///Users/nayanthanethsara/Documents/Github/mini-algothon/competitor-frontend/src/actions/telemetry.ts):

- **Event Monitoring**: Captures browser window focus loss, tab switching, and full-screen state transitions, reporting events to `/api/v1/telemetry/browser-event`.
- **Loopback Attestation**: In desktop mode, probes the local background proctor daemon on `127.0.0.1:47615` to verify daemon health.
- **Submission Gate**: If a contestant attempts an official submission without a verified proctor agent or an administrative override, the API responds with `423 Locked` and displays instructions for remediation.

---

## Environment Configuration

Configure environment variables in `.env.local`:

```ini
# Backend API Base URL
API_URL=http://127.0.0.1:8080

# Platform Mode ('web' or 'desktop')
NEXT_PUBLIC_PLATFORM=web

# Telemetry Event Ingestion
NEXT_PUBLIC_ENABLE_TELEMETRY=true

# Secure Cookies (set true in HTTPS environments)
COOKIE_SECURE=false
```

---

## Development & Build Commands

```sh
# Install dependencies
pnpm install

# Start development server (port 3000)
pnpm dev

# Build production bundle
pnpm build

# Start production server
pnpm start

# Run linter and type-checking
pnpm lint
```
