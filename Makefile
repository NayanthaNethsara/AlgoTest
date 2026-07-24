.PHONY: install db-up db-down db-logs db-reset migrate user backend frontend dev build test

install:
	cd backend && go mod download
	cd frontend && pnpm install

# --- Database (docker-compose.yml lives at repo root) ---

db-up:
	docker compose up -d

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

# Drops the volume too -- wipes all data, re-applies migrations fresh.
db-reset:
	docker compose down -v
	docker compose up -d

migrate:
	cd backend && make migrate

# Create/import users, e.g.:
#   make user ARGS='-username alice -role admin'
#   make user ARGS='-file competitors.csv'
user:
	cd backend && make user ARGS='$(ARGS)'

# --- App (run each in its own terminal) ---

backend:
	cd backend && make run

frontend:
	cd frontend && pnpm dev

# Runs backend + frontend together in one terminal (Ctrl-C stops both).
dev:
	$(MAKE) -j2 backend frontend

build:
	cd backend && make build
	cd frontend && pnpm build

test:
	cd backend && make test
