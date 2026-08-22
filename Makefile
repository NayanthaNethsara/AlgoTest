.PHONY: install db-up db-down db-logs db-reset migrate admin backend backend-shell judgetest proctorsim competitor-frontend competitor-desktop desktop desktop-build desktop-reset frontend admin-frontend dev build test venue venue-tls venue-down venue-logs monitoring-up monitoring-down monitoring-logs monitoring-restart

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

# The server applies migrations on boot; this applies them without starting it.
migrate:
	$(GO) go run ./cmd/migrate

# Bootstraps the first admin. Everything else is managed through the admin UI.
#   make admin ARGS='-username alice -name "Alice"'
admin:
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

# Stops any running client and deletes everything it stores on this machine: the
# server address, the enrollment, buffered heartbeats, and the autostart entry.
# The agent is built to survive being closed, which is right in a contest hall and
# unhelpful on a development laptop.
desktop-reset:
	cd competitor-desktop/src-tauri && cargo run --quiet --bin app -- --reset

frontend: competitor-frontend

# --- Contest LAN ---

# Portal in Docker on this machine, backend wherever API_URL points, served to the
# network on port 80. Builds the image on first run and after any code change.
#   make venue
VENUE = docker compose -f docker-compose.venue.yml
VENUE_TLS = $(VENUE) -f docker-compose.venue-tls.yml

# Only when set: exporting an unset variable passes it as empty, and compose gives
# the shell precedence over .env, so a blanket export would shadow the .env file.
ifdef API_URL
export API_URL
endif

LAN_IP = $$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $$1}')

venue:
	@echo "Contestants: http://$(LAN_IP)"
	$(VENUE) up --build

# Needs ./certs plus PORTAL_SERVER_NAME in .env -- a bare LAN IP cannot be
# certificated, so this wants a hostname contestants actually resolve.
venue-tls:
	$(VENUE_TLS) up --build

venue-down:
	$(VENUE) down

venue-logs:
	$(VENUE) logs -f

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

# --- Observability Stack (Prometheus, Loki, Promtail, Node Exporter, Grafana) ---

MONITORING = docker compose -f monitoring/docker-compose.monitoring.yml

monitoring-up:
	$(MONITORING) up -d
	@echo "Grafana running on http://localhost:3002 (credentials: admin / admin)"

monitoring-down:
	$(MONITORING) down

monitoring-logs:
	$(MONITORING) logs -f

monitoring-restart:
	$(MONITORING) restart


