# Quick Start Guide

This guide describes how to set up, configure, and run MiniAlgothon locally.

---

## Prerequisites

Before starting, ensure the following software tools are installed on your host system:

- Docker and Docker Compose (version 2.20+ with cgroup v2 support)
- Node.js (version 20+)
- pnpm (version 9+)
- Go (version 1.25+ optional, for running commands natively outside Docker)

---

## Architecture & Service Map

MiniAlgothon consists of four main components running locally:

| Service | Technology | Port / Access | Description |
| --- | --- | --- | --- |
| Database | PostgreSQL 16 | `localhost:5432` | Core database for users, problems, testcases, and submissions |
| Backend API & Judge | Go (Gin) + isolate | `http://localhost:8080` | REST API and in-process code execution judge worker |
| Competitor Frontend | Next.js App Router | `http://localhost:3000` | Web application for contest participants |
| Admin Frontend | Next.js App Router | `http://localhost:3001` | Management interface for administrators and problem authors |

---

## Environment Setup

1. Copy the example environment configuration files:

```sh
cp backend/.env.example backend/.env
cp competitor-frontend/.env.example competitor-frontend/.env.local
```

2. Review default ports and settings in `backend/.env` and `competitor-frontend/.env.local`.

---

## Installation & Launch Steps

### Step 1: Install Dependencies

Run the top-level `install` target to fetch Go modules inside the container environment and install Node packages for both frontend applications:

```sh
make install
```

### Step 2: Start PostgreSQL Database

Start the PostgreSQL database service:

```sh
make db-up
```

### Step 3: Run Database Migrations

Apply database schema migrations:

```sh
make migrate
```

### Step 4: Seed Administrator Account

Create an initial administrator user account:

```sh
make user ARGS='-username admin -name "System Admin" -role admin -password adminpass'
```

Create a competitor user account:

```sh
make user ARGS='-username competitor1 -name "Competitor One" -role competitor -password userpass'
```

### Step 5: Start Applications

#### Option A: Start All Services Together
To launch both the backend container and competitor frontend concurrently:

```sh
make dev
```

To run the Admin Frontend alongside:

```sh
make admin-frontend
```

#### Option B: Start Services Individually
Run each command in a separate terminal session:

```sh
# Terminal 1: Backend API and Judge Worker
make backend

# Terminal 2: Competitor Frontend (port 3000)
make frontend

# Terminal 3: Admin Frontend (port 3001)
make admin-frontend
```

---

## Verification & Testing

Verify that the system services are functioning correctly:

1. **Backend Health Check:**
   ```sh
   curl http://localhost:8080/healthz
   ```
   Response should return `{"status":"ok"}`.

2. **Run Backend Unit Tests:**
   ```sh
   make test
   ```

3. **Run Judge Load & Sandbox Test:**
   ```sh
   make judgetest ARGS='-username competitor1 -password userpass -burst 10'
   ```

---

## Submission Access (who may submit from where)

There are three supported ways for a competitor to sit the contest. **Only the first works out of
the box** — the other two are grants an organizer makes, because each one costs proctoring
visibility:

| Mode | Setup | Default |
| --- | --- | --- |
| Desktop client, proctor running | contest opened inside the desktop app | **allowed** |
| Browser, proctor running | desktop app installed and reporting, contest open in Chrome/Safari | needs a grant |
| Browser, no proctor at all | nothing installed | needs a grant |

Test runs (`Run`) always work in every mode. Only **scored submissions** are gated. A contestant in a
window they may not submit from gets a **full-screen notice** naming the mode they are in and the
modes they hold (dismissible to the editor, since test runs still work), and any submission returns
`423` with `code: "CLIENT_NOT_ALLOWED"`.

**Grant one competitor** — Admin console → Users → *Submission Access*, two independent checkboxes.
Either, both, or neither; the desktop client is always allowed. A reason is required and is recorded
against every submission they make; the grant applies from their next attempt, with no restart:

```sh
curl -X PATCH http://localhost:8080/api/v1/admin/users/<user-id>/access \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <admin-session>' \
  -d '{"webWithAgent":true,"webOnly":false,
       "reason":"desktop shell will not open on this machine","hoursValid":0}'
```

The call carries the **whole grant**, not a delta, so two organizers on the same contestant cannot
interleave into a combination neither chose. Send both flags `false` to revoke (no reason needed).
`hoursValid: 0` keeps the grant for the rest of the contest.

> **One combination to avoid:** `webOnly` **without** `webWithAgent` lets that contestant submit only
> while the proctor client is *stopped* — you have made stopping proctoring the way to unlock
> submissions. It is enforced as configured (occasionally that is what you want), so the API returns a
> `warning`, the console asks you to confirm, and the monitoring row flags it. Tick both unless you
> specifically mean it.

**Open a fallback for everyone** — the right lever when the desktop client itself is the problem,
rather than granting the same accommodation 300 times. Takes effect within 30 seconds:

```sh
docker compose exec postgres psql -U algothon -d algothon -c \
  "UPDATE contest_settings SET value = 'true' WHERE key = 'access.allow_web_with_agent';"
```

The other key is `access.allow_web_only`. Contestants get the **union** of the contest-wide switches
and their personal grant, so opening one for everyone never narrows someone who already holds a grant.

> A **proctor exemption** is a different control: it switches proctoring off entirely for one person
> for a few hours (break-glass). If you only need someone to work in a browser, grant access instead —
> the proctor keeps collecting, and the review timeline records the grant rather than a blind spot.

---

## Helper CLI Tools

### User Management (`usertool`)

Create single users or bulk import accounts from a CSV file:

- **Create single user:**
  ```sh
  make user ARGS='-username alice -name "Alice" -role competitor'
  ```

- **Bulk import users from CSV:**
  ```sh
  make user ARGS='-file competitors.csv'
  ```
  *(CSV format: `username,display_name,password`)*

### Problem Management (`problemtool`)

Import or manage problems stored in directory structures:

- **List problems in database:**
  ```sh
  docker compose run --rm backend go run ./cmd/problemtool -list
  ```

- **Import problem directory:**
  ```sh
  docker compose run --rm backend go run ./cmd/problemtool -dir ./problems/two-sum -publish
  ```

---

## Database Management Commands

| Command | Action |
| --- | --- |
| `make db-up` | Starts the PostgreSQL container |
| `make db-down` | Stops PostgreSQL container |
| `make db-logs` | Streams live logs from PostgreSQL |
| `make db-reset` | Wipes database volume data and re-initializes clean schema |
