.PHONY: run build test tidy fmt vet db-up db-down db-logs db-reset migrate user

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
