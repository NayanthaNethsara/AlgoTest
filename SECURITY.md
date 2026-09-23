# Security Policy

## Supported Versions

Labyrithm is currently in beta. Only the latest default branch and the latest published beta release are expected to receive security fixes.

## Reporting a Vulnerability

Please do not open a public GitHub issue for a security vulnerability. Report it privately to the maintainer at `nayanthanethsara@gmail.com` with:

- A concise description of the vulnerability.
- The affected component, route, package, or configuration.
- Reproduction steps or a proof of concept.
- The potential impact and any suggested mitigation.

Do not include real credentials, private contestant code, production data, or secrets in the report.

The maintainer will acknowledge the report when possible, investigate it, and coordinate disclosure and a fix. Please allow reasonable time for triage before public disclosure.

## Security-Sensitive Areas

Reports involving these areas are especially valuable:

- Linux `isolate` sandbox escape or resource-limit bypasses.
- Authentication, sessions, authorization, or admin access.
- Proctor-agent enrollment, attestation, or token handling.
- Submission queue ownership and worker leases.
- Secret exposure in logs, CI, Docker images, or configuration.
- Unsafe file uploads, test-case handling, or code execution paths.
