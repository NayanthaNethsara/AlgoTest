# Production image for the competitor portal.
#
# Build from the repository root, not this directory: the app depends on the
# @mini-algothon/auth workspace package.
#
#   docker build -f competitor-frontend/Dockerfile -t competitor-frontend .

FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/auth/package.json packages/auth/
COPY competitor-frontend/package.json competitor-frontend/
# sharp and unrs-resolver ship build scripts pnpm will not run unattended.
# Nothing here needs them at runtime, so let the install proceed without.
RUN pnpm install --frozen-lockfile --filter competitor-frontend... \
    --config.strictDepBuilds=false

FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

COPY --from=deps /repo ./
COPY packages ./packages
COPY competitor-frontend ./competitor-frontend

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter competitor-frontend build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

# next.config sets output: "standalone", which emits a minimal server.js but
# does not copy public or .next/static into it.
COPY --from=build /repo/competitor-frontend/.next/standalone ./
COPY --from=build /repo/competitor-frontend/.next/static ./competitor-frontend/.next/static
COPY --from=build /repo/competitor-frontend/public ./competitor-frontend/public

USER node
EXPOSE 3000

CMD ["node", "competitor-frontend/server.js"]
