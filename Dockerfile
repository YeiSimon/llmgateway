# syntax=docker/dockerfile:1

# ============================================================
# Base: Node 24 Alpine + pnpm
# ============================================================
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache python3 make g++ git
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# ============================================================
# Full builder: install deps, build core + UI
# ============================================================
FROM base AS full-builder
COPY . .
RUN pnpm install --frozen-lockfile
# Build all backend packages and services
RUN pnpm build:core
# Build UI (workspace deps already in dist/ from build:core above)
RUN pnpm --filter ui build
# Create slim deploy bundles for each service
RUN pnpm --filter api     deploy --prod /deploy/api     && \
    pnpm --filter gateway deploy --prod /deploy/gateway && \
    pnpm --filter worker  deploy --prod /deploy/worker
# Copy DB migration SQL files for the migrate container
RUN cp -r packages/db/migrations /deploy/migrations

# ============================================================
# API runtime
# ============================================================
FROM node:24-alpine AS api
WORKDIR /app
COPY --from=full-builder /deploy/api ./
ENV NODE_ENV=production
EXPOSE 4002
CMD ["node", "--enable-source-maps", "dist/serve.js"]

# ============================================================
# Gateway runtime
# ============================================================
FROM node:24-alpine AS gateway
WORKDIR /app
COPY --from=full-builder /deploy/gateway ./
ENV NODE_ENV=production
EXPOSE 4001
CMD ["node", "--enable-source-maps", "dist/serve.js"]

# ============================================================
# Worker runtime
# ============================================================
FROM node:24-alpine AS worker
WORKDIR /app
COPY --from=full-builder /deploy/worker ./
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/index.js"]

# ============================================================
# Migrate: runs DB migrations + seed (full builder for drizzle-kit)
# ============================================================
FROM base AS migrate
COPY --from=full-builder /app ./
CMD ["sh", "-c", "pnpm --filter db migrate && pnpm seed"]

# ============================================================
# UI runtime: Next.js standalone
# ============================================================
FROM node:24-alpine AS ui
WORKDIR /app
COPY --from=full-builder /app/apps/ui/.next/standalone ./
COPY --from=full-builder /app/apps/ui/.next/static      ./apps/ui/.next/static
COPY --from=full-builder /app/apps/ui/public             ./apps/ui/public
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
EXPOSE 3002
CMD ["node", "apps/ui/server.js"]
