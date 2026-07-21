.PHONY: install backend frontend build test

install:
	cd backend && go mod download
	cd frontend && pnpm install

backend:
	cd backend && make run

frontend:
	cd frontend && pnpm dev

build:
	cd backend && make build
	cd frontend && pnpm build

test:
	cd backend && make test
