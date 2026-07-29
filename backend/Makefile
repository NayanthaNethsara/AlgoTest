# These targets need a Go toolchain, so they are meant to run *inside* the dev
# container (`make backend-shell` from the repo root) or on a provisioned Linux
# server. From the host, use the root Makefile -- it wraps each of these in
# `docker compose run`.

.PHONY: run build test tidy fmt vet generate db-up db-down db-logs db-reset migrate user judge-images

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

migrate:
	go run ./cmd/migrate

run:
	go run ./cmd/server

# Rollback artifact only. /run now sandboxes with isolate (see
# deploy/provision-isolate.sh); these images belong to the previous Docker-based
# runner and can be deleted once the isolate path has been validated in staging.
judge-images:
	docker build -t algothon-judge-cpp docker/judge/cpp
	docker build -t algothon-judge-java docker/judge/java
	docker build -t algothon-judge-python docker/judge/python

# Abuse + load harness for the /run sandbox. Needs a running server and a user.
# e.g.  make judgetest ARGS='-username alice -password secret -burst 500'
judgetest:
	go run ./cmd/judgetest $(ARGS)

build:
	go build -o bin/server ./cmd/server
	go build -o bin/usertool ./cmd/usertool
	go build -o bin/migrate ./cmd/migrate

# Create/import users, e.g.:
#   make user ARGS='-username alice -role admin'
#   make user ARGS='-file competitors.csv'
user:
	go run ./cmd/usertool $(ARGS)

test:
	go test ./...

tidy:
	go mod tidy

fmt:
	go fmt ./...

vet:
	go vet ./...
