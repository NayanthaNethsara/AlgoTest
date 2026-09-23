# Changelog

## v1.0.0-beta - 2026-09-23

### Added

- Labyrithm product branding and shared frontend branding configuration.
- Self-hosted Docker Compose environments for local, venue, production, worker, and monitoring deployments.
- Go backend with PostgreSQL-backed submission queue and Linux sandboxed execution.
- Competitor portal with Monaco editor, live verdict streaming, scoreboard, and optional proctoring.
- Administrator console for problems, users, teams, contest operations, judging, monitoring, and audit logs.
- Tauri desktop client with a separate proctor agent and loopback attestation.
- Prometheus, Loki, Promtail, and Grafana monitoring configuration.
- Contribution, support, security, and code-of-conduct documentation.

### Notes

This is the first public beta intended for evaluation, self-hosting experiments, and feedback. Review the deployment and security documentation before using it for a real contest or assessment.

This release establishes Labyrithm as a self-hosted algorithmic problem-solving platform. Contest names, API endpoints, portal origins, and deployment settings are configurable by each operator.
