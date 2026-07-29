# MiniAlgothon

Algorithm challenge platform. Go (Gin) API with an in-process judge worker and isolate sandbox, Next.js competitor portal, and Next.js admin management console.

---

## Architecture & Directory Structure

```
backend/           Go API + judge worker + isolate sandbox execution
  cmd/             CLI tools (server, migrate, usertool, problemtool, judgetest)
  internal/api/    HTTP routes and handlers (Gin framework)
  internal/auth/   Password hashing and authentication logic
  internal/config/ Environment configuration
  internal/db/     PostgreSQL connection and database migrations
  internal/judge/  Submission queue, worker pool, and result evaluation
  internal/problem/Problem definitions and testcase management
  internal/runner/ Untrusted code execution using isolate sandbox
  internal/user/   User accounts repository
frontend/          Next.js app for competitors (port 3000)
admin-frontend/    Next.js app for administrators (port 3001)
docs/              Documentation and system architecture guides
problems/          Problem definitions and testcase directories
```

---

## Requirements

- Docker & Docker Compose (v2.20+ with cgroup v2 support)
- Node.js 20+
- pnpm 9+
- Go 1.25+ (optional for local non-container development)

---

## Quick Start

For complete setup instructions, administrative operations, and environment customization, refer to the [Quick Start Guide](docs/quick-start.md).

### 1. Configure Environment Files

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 2. Install Dependencies & Start Database

```sh
make install
make db-up
make migrate
```

### 3. Seed Accounts

```sh
make user ARGS='-username admin -role admin -password adminpass'
```

### 4. Run Services

```sh
# Start backend API and competitor frontend concurrently:
make dev

# Start admin frontend (in a separate terminal):
make admin-frontend
```

Service endpoints:
- **Backend API**: `http://localhost:8080`
- **Competitor Portal**: `http://localhost:3000`
- **Admin Management Portal**: `http://localhost:3001`

---

## API Routes Overview

| Category | Method | Path | Description |
| --- | --- | --- | --- |
| Health | GET | `/healthz` | Service health status |
| Auth | POST | `/api/v1/auth/login` | User login session |
| Auth | POST | `/api/v1/auth/logout` | End user session |
| Auth | GET | `/api/v1/me` | Current session user details |
| Problems | GET | `/api/v1/problems` | List published contest problems |
| Problems | GET | `/api/v1/problems/:slug` | Fetch problem by slug |
| Sandbox | POST | `/api/v1/run` | Execute code against user input |
| Submissions | POST | `/api/v1/submissions` | Submit code for official evaluation |
| Submissions | GET | `/api/v1/submissions/:id` | Fetch submission status and verdict |
| Administration | * | `/api/v1/admin/*` | User and problem management endpoints |

---

## License

MIT
