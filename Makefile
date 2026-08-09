.PHONY: install db-up db-down db-logs db-reset migrate user backend backend-shell judgetest proctorsim competitor-frontend competitor-desktop desktop desktop-build frontend admin-frontend dev build test

# No local Go toolchain is needed: every backend command runs in the container
# from backend/Dockerfile, which carries Go, isolate, and the language
# toolchains. GO also starts postgres; GO_OFFLINE skips it for commands that
# never touch the database; GO_LIVE reuses the already-running server container.
GO = docker compose run --rm backend
GO_OFFLINE = docker compose run --rm --no-deps backend
GO_LIVE = docker compose exec backend

install:
	$(GO_OFFLINE) go mod download
	pnpm install


admin-frontend:
	cd admin-frontend && pnpm dev -p 3001

# --- Database (docker-compose.yml lives at repo root) ---

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

# Drops the volume too -- wipes all data, re-applies migrations fresh.
db-reset:
	docker compose down -v
	docker compose up -d postgres

migrate:
	$(GO) go run ./cmd/migrate

# Create/import users, e.g.:
#   make user ARGS='-username alice -role admin'
#   make user ARGS='-file competitors.csv'
user:
	$(GO) go run ./cmd/usertool $(ARGS)

# --- App (run each in its own terminal) ---

# Runs in a Linux container because the /run sandbox needs isolate; see
# backend/Dockerfile. Postgres starts first via depends_on.
backend:
	docker compose up --build backend

# Shell inside the running backend container.
backend-shell:
	$(GO_LIVE) bash

# Abuse + load harness for the /run sandbox. Needs `make backend` up already.
#   make judgetest ARGS='-username alice -password secret -burst 200'
judgetest:
	$(GO_LIVE) go run ./cmd/judgetest $(ARGS)

proctorsim:
	$(GO_LIVE) go run ./cmd/proctorsim -api http://localhost:8080 $(ARGS)

competitor-frontend:
	cd competitor-frontend && pnpm dev

competitor-desktop:
	cd competitor-desktop && pnpm dev

desktop: competitor-desktop

desktop-build:
	cd competitor-desktop && pnpm build
	@echo "Desktop build complete!"

frontend: competitor-frontend

# Runs backend + competitor-frontend together in one terminal (Ctrl-C stops both).
dev:
	$(MAKE) -j2 backend competitor-frontend

build:
	$(GO_OFFLINE) go build -o bin/server ./cmd/server
	cd competitor-frontend && pnpm build

test:
	$(GO_OFFLINE) go test ./...

swagger:
	cd backend && go run github.com/swaggo/swag/cmd/swag@latest init -g cmd/server/main.go -o docs

