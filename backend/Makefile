# These targets need a Go toolchain, so they are meant to run *inside* the dev
# container (`make backend-shell` from the repo root) or on a provisioned Linux
# server. From the host, use the root Makefile -- it wraps each of these in
# `docker compose run`.

.PHONY: run build test tidy fmt vet generate db-up db-down db-logs db-reset migrate admin

# Regenerate type-safe query code from internal/db/queries/*.sql.
# Requires sqlc (https://sqlc.dev): brew install sqlc  OR  go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
generate:
	sqlc generate

# --- Postgres (docker-compose.yml lives at repo root; these delegate up) ---

db-up:
	cd .. && $(MAKE) db-up

db-down:
	cd .. && $(MAKE) db-down

db-logs:
	cd .. && $(MAKE) db-logs

db-reset:
	cd .. && $(MAKE) db-reset

# --- App ---

run:
	go run ./cmd/server

# Abuse + load harness for the /run sandbox. Needs a running server and a user.
# e.g.  make judgetest ARGS='-username alice -password secret -burst 500'
judgetest:
	go run ./cmd/judgetest $(ARGS)

build:
	go build -o bin/server ./cmd/server
	go build -o bin/usertool ./cmd/usertool
	go build -o bin/migrate ./cmd/migrate

# The server applies migrations on boot; this applies them without starting it.
migrate:
	go run ./cmd/migrate

# Bootstraps the first admin. Everything else is managed through the admin UI.
#   make admin ARGS='-username alice -name "Alice"'
admin:
	go run ./cmd/usertool $(ARGS)

test:
	go test ./...

tidy:
	go mod tidy

fmt:
	go fmt ./...

vet:
	go vet ./...
