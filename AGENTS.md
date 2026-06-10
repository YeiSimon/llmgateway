# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Development Commands

### Setup and Dependencies

- `pnpm install` - Install all dependencies
- `pnpm setup` - Full development environment setup (starts Docker, syncs DB, seeds data)
- `docker compose up -d` - Start PostgreSQL and Valkey services

### Development

NOTE: these commands can only be run in the root directory of the repository, not in individual app directories.

- `pnpm dev` - Start all development servers (UI on :3002, Playground on :3003, Code on :3004, API on :4002, Gateway on :4001, Docs on :3005, Admin on :3006)
- `pnpm build` - Build all applications for production. ALWAYS run this after finishing work on a feature. ALWAYS run a full build to make sure things fork.
- `pnpm clean` - Clean build artifacts and cache directories

### Code Quality

NOTE: these commands can only be run in the root directory of the repository, not in individual app directories.

ALWAYS run `pnpm format` before committing code. Run `pnpm build` if API routes were modified.

- `pnpm format` - Format code and fix linting issues. ALWAYS run this before committing code.
- `pnpm lint` - Check linting and formatting (without fixing)

### Writing code

This is a pure TypeScript project. Never use `any` or `as any` unless absolutely necessary.
This repository always uses tabs for indentation.

When you are done writing code features or bug fixes, ALWAYS commit your changes. If in doubt, commit any changes.

### Testing

NOTE: these commands can only be run in the root directory of the repository, not in individual app directories.

Do not run test files or suites in parallel unless the repository instructions for that exact suite explicitly require it. Some gateway and worker tests share ports, databases, and process state, so parallel test runs can produce false failures.

- `pnpm test:unit` - Run unit tests (\*.spec.ts files)
- `pnpm test:e2e` - Run end-to-end tests (\*.e2e.ts files)

When running curl commands against the local API, you can use `test-token` as authentication.

#### E2E Test Options

- `TEST_MODELS` - Run tests only for specific models (comma-separated list of `provider/model-id` pairs)
  Example: `TEST_MODELS="openai/gpt-4o-mini,anthropic/claude-3-5-sonnet-20241022" pnpm test:e2e`
  This is useful for quick testing as the full e2e suite can take too long with all models.
- `FULL_MODE` - Include free models in tests (default: only paid models)
- `LOG_MODE` - Enable detailed logging of responses

#### E2E Test Structure

E2E tests are organized for optimal performance:

- **Parallel execution**: Tests run up to 16 in parallel using Vitest's thread pool (minimum 8 threads)
- **Split structure**:
  - `apps/gateway/src/api.e2e.ts` - Contains all `.each()` tests that benefit from parallelization
  - `apps/gateway/src/api-individual.e2e.ts` - Contains individual test cases that need isolation
- **Concurrent mode**: The main test suite uses `{ concurrent: true }` to enable parallel execution of `.each()` tests

### Database Operations

NOTE: these commands can only be run in the root directory of the repository, not in individual app directories.

- `pnpm --filter db seed` - Seed database with initial data
- `pnpm run setup` – Fresh dev environment only: drops and recreates the local DB, pushes schema, seeds data. **Never run against any shared or production database.**

#### ⚠️ Migration Workflow — Read Before Changing the Schema

The migration system has two distinct tracking mechanisms that must stay in sync:

| Thing | Location | Purpose |
|---|---|---|
| Migration SQL files | `packages/db/migrations/*.sql` | The actual SQL to apply |
| `_journal.json` | `packages/db/migrations/meta/` | Index of migration files (disk only) |
| `drizzle.__drizzle_migrations` | Production PostgreSQL | Records which migrations have been applied |

**Correct workflow for any schema change:**

1. Edit `packages/db/src/schema.ts`
2. Generate a migration: `pnpm --filter db migrations` — creates a new `.sql` file and updates `_journal.json`
3. Commit **both** the `.sql` file and the updated `_journal.json` in the same commit as the schema change
4. On next `helm upgrade`, the pre-upgrade Job (`infra/helm/llmgateway/templates/migration-job.yaml`) runs automatically and applies the migration before new pods start

**NEVER use `pnpm --filter db push` (or `pnpm run setup`) on production or any shared database.**
`push` directly alters the database schema without creating migration files or recording anything in `drizzle.__drizzle_migrations`. If a new API image is then deployed, its migration runner tries to create already-existing tables and the API pod crash-loops on startup.

**How production migrations work:**

The Helm chart's pre-upgrade Job (`infra/helm/llmgateway/templates/migration-job.yaml`):
- Runs `node dist/migrate-only.js` inside the same API image **before** pods are replaced
- Reads `drizzle.__drizzle_migrations` and skips already-applied migrations
- If it fails, Helm aborts the release — the currently running pods are untouched (zero downtime)
- API pods start with `RUN_MIGRATIONS=false`; the job is the sole migration authority

**Emergency: journal out of sync on production**

If `drizzle.__drizzle_migrations` is missing entries because schema was applied via `push`, use the recovery script before deploying a new image:

```bash
# Port-forward production postgres
kubectl port-forward -n llmgateway svc/llmgateway-postgresql 15433:5432

# Seed any missing migration records (safe to run multiple times — uses ON CONFLICT DO NOTHING)
DATABASE_URL="postgres://postgres:<password>@localhost:15433/llmgateway" \
  pnpm tsx vitest/seed-migrations.ts
```

`vitest/seed-migrations.ts` computes the SHA-256 hash of each migration file (matching what drizzle stores) and inserts any entries absent from `drizzle.__drizzle_migrations`.

## Architecture Overview

**LLM Gateway** is a monorepo containing a full-stack LLM API gateway with multiple services:

### Core Services

- **Gateway** (`apps/gateway`) - LLM request routing and provider management (Hono + Zod + OpenAPI)
- **API** (`apps/api`) - Backend API for user management, billing, analytics (Hono + Zod + OpenAPI)
- **UI** (`apps/ui`) - Frontend dashboard (Next.js App Router)
- **Playground** (`apps/playground`) - Interactive LLM testing environment (Next.js App Router)
- **Code** (`apps/code`) - Dev plans + coding tools landing & dashboard (Next.js App Router)
- **Docs** (`apps/docs`) - Documentation site (Next.js + Fumadocs)

### Shared Packages

- **@llmgateway/db** - Database schema, migrations, and utilities (Drizzle ORM)
- **@llmgateway/models** - LLM provider definitions and model configurations
- **@llmgateway/auth** - Authentication utilities and session management

## Technology Stack

### Backend

- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Caching**: Valkey
- **Authentication**: Better Auth with passkey support
- **Validation**: Zod schemas
- **API Documentation**: OpenAPI/Swagger

### Frontend

- **Framework**: Next.js App Router (React Server Components)
- **State Management**: TanStack Query
- **UI Components**: Radix UI with Tailwind CSS
- **Build Tool**: Next.js (Turbopack during dev; Node/Edge runtime)
- **Navigation**: Use `next/link` for links and `next/navigation`'s router for programmatic navigation

### Development Tools

- **Monorepo**: Turbo with pnpm workspaces
- **TypeScript**: Strict mode enabled
- **Testing**: Vitest for unit and E2E tests
- **Linting**: ESLint with custom configuration
- **Formatting**: Prettier

## Development Guidelines

### Database Operations

- Use Drizzle ORM with latest object syntax
- The schema uses camelCase in TypeScript but the actual database columns are snake_case (configured via Drizzle's `casing: "snake_case"`). When writing raw SQL, always use snake_case column names (e.g. `user_id`, not `userId`).
- For reads: Use `db().query.<table>.findMany()` or `db().query.<table>.findFirst()`
- For schema changes: edit `packages/db/src/schema.ts`, then run `pnpm --filter db migrations` to generate the migration file. Commit both the `.sql` file and the updated `_journal.json`. See the Migration Workflow section above for the full procedure.
- **NEVER use `pnpm --filter db push` or `pnpm run setup` on production or any shared database** — these bypass the migration runner and corrupt `drizzle.__drizzle_migrations`, causing crash-loops on the next deploy.
- `pnpm run setup` is only for wiping and recreating a local dev database from scratch.
- Never write migration SQL manually; only edit generated files if specifically asked.
- **NEVER resolve merge conflicts in migration files, journal files, or snapshot files manually.** When merging with main and migration conflicts occur, ALWAYS follow this exact procedure:
  1. **Before merging**, reset migrations: `git restore --source=origin/main packages/db/migrations/`
  2. **After merging**, regenerate migrations: `pnpm migrations`
  3. Do NOT attempt to manually edit or resolve conflicts in any file under `packages/db/migrations/`

### Creating New Packages

When creating a new package in `packages/`, include these config files. Copy them from an existing package (e.g., `packages/models`) to ensure consistency:

- `package.json` - Package configuration with build scripts
- `tsconfig.json` - TypeScript configuration extending root
- `.prettierignore` - Copy from existing package (ignores `dist` build output)
- `.lintstagedrc.json` - Copy from existing package (lint-staged configuration)
- `eslint.config.mjs` - Copy from existing package (ESLint configuration)

### Code Standards

- Always use the internal api (`apps/api/`) for any backend operations, never use NextJS API routes.
- In frontend apps (`apps/ui`, `apps/playground`, `apps/code`, `ee/admin`), always use the generated typed API client (`useFetchClient()` or `useApi()` from `@/lib/fetch-client`) to call the Hono API. Never use raw `fetch()` for API calls. The client is auto-generated from the OpenAPI spec (`pnpm --filter api generate && pnpm --filter <app> generate`). For non-hook contexts (e.g., utility functions), accept the fetch client as a parameter from the calling component.
- Do not use useEffect for data fetching in the UI; instead, use TanStack Query for all data fetching and state management.
- Always use top-level `import`, never use require or dynamic imports
- Use conventional commit message format and limit the commit message title to max 50 characters
- Do not --amend commits after pushing to remote
- Never force push on main/default branch; force pushing is only acceptable on feature branches
- When resolving conflicts involving `pnpm-lock.yaml`, just run `pnpm install` to automatically resolve them
- When writing pull request titles, use the conventional commit message format and limit to max 50 characters
- Always use pnpm for package management
- Use cookies for user-settings which are not saved in the database to ensure SSR works
- Apply DRY principles for code reuse
- Do not add explicit caching or memoization around `process.env` reads or parsed env-var values unless there is a measured hot-path need
- Exception: in `packages/models`, explicit duplication of model/provider mappings is acceptable and preferred over helper-based expansion. This is the only place in the repo where duplicating model definitions is OK.
- No unnecessary code comments
- Do not use broad try/catch in API handlers unless to check for specific errors; instead, let errors propagate and be handled by the global error handler

### Testing and Quality Assurance

After developing a change, Codex agents must verify it before committing.

Run commands from the repository root only.

1. Run the most specific test first:
   - Backend/shared TypeScript changes: `pnpm test:unit`
   - Gateway/API provider behavior: run the relevant Vitest file or a limited e2e run; do not run the full e2e suite.
   - UI public/auth smoke changes: `pnpm test:web:ui`
   - UI authenticated dashboard smoke changes: `pnpm test:web:ui:dashboard`
2. For frontend changes in `apps/ui`, prefer Playwright smoke tests before broader suites:
   - Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm test:web:ui` when the bundled Playwright browser is unavailable.
   - Do not add authenticated full user journeys unless the task explicitly asks for them; keep first-pass coverage as smoke tests.
3. For gateway e2e tests, never run the full suite by default:
   - Use `TEST_MODELS` to limit models when possible.
   - Example: `TEST_MODELS="openai/gpt-4o-mini" pnpm test:e2e`
4. Always run `pnpm format` after code changes and before committing.
5. Always run `pnpm build` after finishing feature work or any API route/schema/generated-client change.
6. If a required verification cannot run because of sandbox, browser, network, or local service limits, document the exact command and failure in the final response.
7. Commit the finished change with a conventional commit title under 50 characters.

### Service URLs (Development)

- UI: http://localhost:3002
- Playground: http://localhost:3003
- Code: http://localhost:3004
- API: http://localhost:4002
- Gateway: http://localhost:4001
- Docs: http://localhost:3005
- Admin: http://localhost:3006
- PostgreSQL: localhost:5432
- Valkey: localhost:6379

### Deployed Kubernetes Cluster (Production)

Node IP: `10.2.183.64` — single-node bare-metal cluster, no cloud LoadBalancer (NodePort only).

| Service    | URL                          |
| ---------- | ---------------------------- |
| UI         | http://10.2.183.64:32323     |
| API        | http://10.2.183.64:32202     |
| Gateway    | http://10.2.183.64:32675     |
| Playground | http://10.2.183.64:31925     |
| Docs       | http://10.2.183.64:30767     |
| Admin      | http://10.2.183.64:32099     |

Helm release: `llmgateway` in namespace `llmgateway`, chart at `infra/helm/llmgateway/`.

Required `--set` values for every `helm upgrade` on this cluster:

```
auth.authSecret=<secret>
auth.gatewayApiKeyHashSecret=<secret>
auth.cookieDomain=10.2.183.64        # CRITICAL — old image defaults to "localhost", breaks login redirect
postgresql.password=<password>
postgresql.persistence.enabled=false
valkey.enabled=true
valkey.persistence.enabled=false
ui.service.type=NodePort
api.service.type=NodePort
gateway.service.type=NodePort
playground.service.type=NodePort
docs.service.type=NodePort
admin.service.type=NodePort
urls.ui=http://10.2.183.64:32323
urls.api=http://10.2.183.64:32202
urls.gateway=http://10.2.183.64:32675
urls.playground=http://10.2.183.64:31925
urls.docs=http://10.2.183.64:30767
urls.admin=http://10.2.183.64:32099
auth.originUrls=http://10.2.183.64:32323\,http://10.2.183.64:31925\,http://10.2.183.64:32099
```

UI image: locally built as `docker.io/library/llmgateway-ui:fix` (contains `crypto.randomUUID` HTTP fix). To rebuild after UI changes:

```bash
docker build -f infra/split.dockerfile --target ui -t llmgateway-ui:fix .
docker save llmgateway-ui:fix | sudo ctr -n k8s.io images import -
# then add to helm upgrade: --set ui.image.registry=docker.io --set ui.image.repository=library/llmgateway-ui --set ui.image.tag=fix --set ui.image.pullPolicy=Never
```

Seed credentials: `admin@example.com` / `Admin1234!`

Schema migrations: the deployed API image was built before new migrations were added. Apply missing ones via port-forward:

```bash
kubectl port-forward -n llmgateway svc/llmgateway-postgresql 15432:5432 &
DATABASE_URL="postgres://postgres:<password>@localhost:15432/llmgateway" pnpm --filter db push
DATABASE_URL="postgres://postgres:<password>@localhost:15432/llmgateway" pnpm --filter db seed
```

Known gotchas:
- `COOKIE_DOMAIN` must equal the node IP. The old pre-built image has `cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost"` — if unset, all session cookies get `Domain=localhost` and the browser silently drops them on login redirect.
- No cloud LoadBalancer: `LoadBalancer` services stay `<pending>` forever on this cluster. NodePort is the only external access method.
- UI pod memory limit is 768Mi (raised from 256Mi to prevent OOMKill from the 3MB+ `/internal/models` response).

## Folder Structure

- `apps/ui`: Next.js frontend
- `apps/playground`: Interactive LLM testing environment
- `apps/code`: Dev plans + coding tools landing & dashboard
- `apps/api`: Hono backend
- `apps/gateway`: API gateway for routing LLM requests
- `apps/docs`: Documentation site
- `ee/admin`: Internal Admin Dashboard (Enterprise License)
- `packages/db`: Drizzle ORM schema and migrations
- `packages/models`: Model and provider definitions
- `packages/shared`: Shared types and utilities

## Key Features

### LLM Gateway

- Multi-provider support (OpenAI, Anthropic, Google Vertex AI, etc.)
- OpenAI-compatible API interface
- Request routing and load balancing
- Response caching with Valkey
- Usage tracking and cost analytics

### Management Platform

- User authentication with passkey support
- API key management
- Project and organization management
- Billing integration with Stripe
- Real-time usage monitoring
- Provider key management

### Database Schema

- Users, organizations, and projects
- API keys and provider configurations
- Usage tracking and billing records
- Analytics and performance metrics

## License

LLM Gateway is available under a dual license:

- **Open Source**: Core functionality is licensed under AGPLv3 - see the [LICENSE](LICENSE) file for details.
- **Enterprise**: Commercial features in the `ee/` directory require an Enterprise license - see [ee/LICENSE](ee/LICENSE) for details.

### Enterprise features include:

- Advanced billing and subscription management
- Extended data retention (90 days vs 3 days)
- Provider API key management
- Team and organization management
- Priority support
- And more to be defined

For enterprise licensing, please contact us at contact@llmgateway.io
