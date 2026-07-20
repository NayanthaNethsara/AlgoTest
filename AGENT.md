# Agent Rules

General rules for working in this repo.

## Code style
- Keep proper folder structure; group by app/feature.
- Code should be self-explanatory (clear names, small functions).
- Do not over-comment. Only comment when the "why" isn't obvious from the code itself.
- No unused abstractions, no speculative/future-proofing code. Build only what's asked.

## Git
- Commit in small, focused commits.
- Do not add Claude/AI as a co-author in commit messages.
- Commit messages should be short and to the point (no long bodies unless necessary).

## Workspace
- pnpm workspace with apps under `apps/*`.
- No database, auth, Docker, or sandboxing until explicitly required — keep proof-of-concept slices minimal.
