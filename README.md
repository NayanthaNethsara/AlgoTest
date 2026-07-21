# MiniAlgothon

Algorithm challenge platform. Go (Gin) API with an in-process judge worker, and a Next.js frontend.

## Structure

```
backend/           Go API + judge worker
  cmd/server/      entrypoint
  internal/api/    HTTP routes and handlers
  internal/config/ env configuration
  internal/judge/  submission queue, workers, results
frontend/          Next.js app (App Router, Tailwind)
  src/app/         routes
  src/components/  UI components
  src/lib/         API client
```

## Requirements

Go 1.25+, Node 20+, pnpm.

## Setup

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
make install
```

## Run

```sh
make backend    # http://localhost:8080
make frontend   # http://localhost:3000
```

In VS Code, use the `Backend + Frontend` launch configuration.

## API

| Method | Path                      | Description               |
| ------ | ------------------------- | ------------------------- |
| GET    | `/healthz`                | Health check              |
| POST   | `/api/v1/submissions`     | Queue a submission        |
| GET    | `/api/v1/submissions/:id` | Fetch a submission result |
