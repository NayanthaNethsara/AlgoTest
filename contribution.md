# Contributing to Labyrithm

Thank you for helping improve Labyrithm. This beta release is focused on establishing the platform direction, documenting the architecture, and collecting practical feedback for the next version.

## Before You Start

- Search existing issues before opening a new one.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Keep pull requests focused and avoid unrelated refactors.
- Do not commit credentials, production URLs, database dumps, generated build output, or contestant data.

## Development Setup

Requirements:

- Docker and Docker Compose
- Node.js 20 or newer
- pnpm 10
- Go 1.25 or newer for native backend work
- Rust and Cargo for desktop-client work

```sh
pnpm install
make db-up
```

Copy the example environment files described in [README.md](README.md), then run the service you are working on. The backend judge requires Linux and cgroup v2 support; macOS development uses the provided Docker setup.

## Useful Checks

Run focused checks for the area you changed:

```sh
pnpm --filter competitor-frontend lint
pnpm --filter admin-frontend lint
cd backend && go test ./...
```

For frontend changes, also run the relevant production build:

```sh
pnpm --filter competitor-frontend build
pnpm --filter admin-frontend build
```

## Pull Requests

Use the pull-request template. A good pull request should explain:

- What changed and why.
- Which user or operator workflow it affects.
- How it was tested.
- Any deployment, migration, security, or documentation impact.

Screenshots or short recordings are useful for user-facing changes.

## Code Guidelines

- Follow the existing domain-oriented structure.
- Prefer small, descriptive functions and explicit validation.
- Keep security boundaries visible, especially around authentication, proctoring, and sandbox execution.
- Preserve compatibility-sensitive environment variables and database identifiers unless a migration is included.
- Update documentation when behavior or operational requirements change.

## License

By contributing, you agree that your contributions are provided under the [MIT License](LICENSE).
