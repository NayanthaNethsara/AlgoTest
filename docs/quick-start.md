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
cp frontend/.env.example frontend/.env.local
```

2. Review default ports and settings in `backend/.env` and `frontend/.env.local`.

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
