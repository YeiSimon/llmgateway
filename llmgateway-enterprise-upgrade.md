# LLM Gateway Enterprise Upgrade Plan

## Current Status After Phase 4 Plus Follow-up Work

> Repo: `/home/user/llmgateway`  
> Branch: `feat/enterprise-gateway`  
> Last updated: 2026-06-06

---

## Progress Tracker

**27 of 30 tasks complete.**

| Phase                           |     Done | Remaining                                       |
| ------------------------------- | -------: | ----------------------------------------------- |
| Phase 1 - Security & Compliance |    4 / 6 | TOTP 2FA, Better Auth SSO wiring                |
| Phase 2 - Reliability           |    5 / 6 | Dynamic config polish                           |
| Phase 3 - Observability         |    4 / 4 | Complete                                        |
| Phase 4 - Frontend              |  12 / 12 | Complete                                        |
| Phase 5 - Infrastructure        |    2 / 2 | Complete                                        |
| IAM upgrade                     | Complete | None                                            |

---

## Latest Completed Work

Commit `f7ae742e` completed the Phase 4 enterprise frontend and supporting API routes.

Follow-up commits completed additional enterprise work after the original Phase 4 handoff:

- Feature 7: ClickHouse-backed analytics completion.
- Feature 8: durable audit/log forwarder worker delivery.
- Session IP binding: soft/audit mode for authenticated API sessions.
- Dual-port isolation for gateway admin routes.
- ClickHouse docker-compose service with auto-init SQL.
- Admin guardrails and security-events organization pages.
- UI Playwright smoke coverage for public pages and authenticated dashboard pages.
- Enterprise dashboard smoke and CRUD flow coverage.
- Helm chart fixes and deployment to the current Kubernetes cluster.

Recent relevant commits:

| Commit     | Work                                             |
| ---------- | ------------------------------------------------ |
| `86adba80` | Helm env value rendering fix                     |
| `3a047cbe` | Enterprise dashboard smoke and CRUD flow tests   |
| `27dffb3b` | Helm chart deployment fixes                      |
| `afecc8b9` | Feature 8 audit/log forwarder worker             |
| `bd938823` | Feature 7 analytics backend                      |
| `4cb4167f` | Session IP binding soft/audit mode               |
| `d482582f` | Dual-port isolation for gateway admin routes     |
| `eeb49a4d` | Admin guardrails and security-events pages       |
| `1c565403` | ClickHouse docker-compose service with auto-init |
| `09292825` | UI public/auth/model/nav smoke tests             |
| `c9bc2b1d` | UI authenticated dashboard smoke tests           |

### Frontend Pages Added

| Area                  | Route                                        |
| --------------------- | -------------------------------------------- |
| Analytics dashboard   | `/dashboard/[orgId]/analytics`               |
| Log Explorer          | `/dashboard/[orgId]/logs`                    |
| Rate Limits & Budgets | `/dashboard/[orgId]/limits`                  |
| Provider Health       | `/dashboard/[orgId]/providers`               |
| RBAC Roles            | `/dashboard/[orgId]/org/roles`               |
| Teams                 | `/dashboard/[orgId]/org/teams`               |
| SSO Config            | `/dashboard/[orgId]/org/sso`                 |
| Log Forwarders        | `/dashboard/[orgId]/settings/log-forwarders` |
| Organization Settings | `/dashboard/[orgId]/settings`                |
| Setup Wizard          | `/setup`                                     |
| Config Guide          | `/dashboard/[orgId]/guide`                   |

### Admin Pages Added

| Area                         | Route                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| Organization guardrails      | `ee/admin/src/app/organizations/[orgId]/guardrails/page.tsx`      |
| Organization security events | `ee/admin/src/app/organizations/[orgId]/security-events/page.tsx` |

### Frontend Components Added

| Feature                      | Files                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| Analytics                    | `apps/ui/src/components/analytics/*`                          |
| Logs                         | `apps/ui/src/components/logs/*`                               |
| Rate limits                  | `apps/ui/src/components/limits/*`                             |
| Log forwarders               | `apps/ui/src/components/log-forwarders/*`                     |
| Organization roles/SSO/teams | `apps/ui/src/components/org/*`                                |
| Provider health              | `apps/ui/src/components/providers/provider-health-client.tsx` |
| Org settings                 | `apps/ui/src/components/settings/org/settings-client.tsx`     |
| Setup wizard                 | `apps/ui/src/components/setup/setup-wizard.tsx`               |
| API key rotation dialog      | `apps/ui/src/components/api-keys/rotate-key-dialog.tsx`       |

### Backend/API Support Added

| Area                                | Files                                |
| ----------------------------------- | ------------------------------------ |
| Rate limit CRUD                     | `apps/api/src/routes/rate-limits.ts` |
| SSO CRUD/test endpoints             | `apps/api/src/routes/sso.ts`         |
| Route wiring                        | `apps/api/src/routes/index.ts`       |
| API key lifecycle response fields   | `apps/api/src/routes/keys-api.ts`    |
| Serialized API key lifecycle typing | `packages/db/src/types.ts`           |
| Generated UI API types              | `apps/ui/src/lib/api/v1.d.ts`        |

### Observability Backend Added

| Area                                         | Files                                       |
| -------------------------------------------- | ------------------------------------------- |
| Analytics summary endpoint                   | `apps/api/src/routes/analytics.ts`          |
| ClickHouse raw-log cost breakdown            | `apps/api/src/routes/analytics.ts`          |
| Organization-scoped provider health endpoint | `apps/api/src/routes/analytics.ts`          |
| Durable log forwarder enqueue                | `apps/api/src/lib/audit-forwarder.ts`       |
| Log forwarder worker delivery/retry service  | `apps/worker/src/services/log-forwarder.ts` |
| Worker loop wiring                           | `apps/worker/src/worker.ts`                 |
| Worker export                                | `apps/worker/src/index.ts`                  |

### Infrastructure Added

| Area                         | File                             |
| ---------------------------- | -------------------------------- |
| Multi-stage production image | `Dockerfile`                     |
| Load-test analysis helper    | `scripts/analyze-load.sql`       |
| ClickHouse service           | `docker-compose.yml`             |
| ClickHouse auto-init SQL     | `packages/db/clickhouse/init.sh` |
| Helm chart deployment fixes  | `infra/helm/llmgateway/*`        |

---

## Fixes Applied During Phase 4 Completion

### API Key Type Mismatch

The handoff had 6 TypeScript errors in `apps/ui/src/components/api-keys/api-keys-list.tsx`.

Root cause: the UI `ApiKey` type inherited lifecycle fields from `SerializedApiKey` as required fields, while generated OpenAPI response types could omit them.

Fix:

- Updated `apps/ui/src/lib/types.ts` to redefine lifecycle fields as optional nullable API-response fields.
- Updated `packages/db/src/types.ts` so serialized lifecycle date fields can be optional.
- Regenerated `apps/ui/src/lib/api/v1.d.ts`.

### pnpm v11 Override Handling

pnpm v11 ignores the `pnpm` block in root `package.json`. That caused `streamdown` and `@streamdown/code` to resolve incompatible `shiki` type versions.

Fix:

- Moved pnpm `overrides` and `packageExtensions` from `package.json` into `pnpm-workspace.yaml`.
- Added a `streamdown` package extension for `shiki: 3.22.0`.
- Refreshed `pnpm-lock.yaml`.

### UI Lint and Build Issues

Fixed Phase 4 UI lint/type errors:

- `provider-distribution-chart.tsx`: split luminance math to satisfy `no-mixed-operators`.
- `rule-dialog.tsx` and `forwarder-dialog.tsx`: replaced loose inequality checks.
- `log-table.tsx`: replaced unkeyed fragment with keyed `Fragment`.
- `log-forwarders-client.tsx`: aligned typed API client calls with generated OpenAPI path metadata.

---

## Feature 7 - ClickHouse Analytics Completion

Status: complete in the current working tree.

Implemented in `apps/api/src/routes/analytics.ts`:

- Added `GET /analytics/summary`.
- Expanded `GET /analytics/cost-breakdown` to use raw ClickHouse `gateway_logs` when available instead of only the hourly rollup.
- Added `GET /analytics/provider-health` for organization-scoped provider request/error/throttle/latency metrics.
- Added ClickHouse-to-Postgres fallback when `CLICKHOUSE_URL` is unset or a ClickHouse query fails.
- Added reasoning token, average latency, and average time-to-first-token metrics to analytics responses.

The ClickHouse path queries `gateway_logs` directly so `source`, latency, reasoning tokens, and provider health are available. The Postgres fallback queries `tables.log` directly so response shape remains consistent.

---

## Feature 8 - Audit/Log Forwarder Worker

Status: complete in the current working tree.

Implemented:

- `apps/api/src/lib/audit-forwarder.ts` now durably enqueues matching forwarder payloads into `log_forwarder_outbox` instead of relying on an API-process in-memory queue.
- `apps/api/src/routes/log-forwarders.ts` test delivery awaits durable enqueue and reports whether a matching forwarder was queued.
- `apps/worker/src/services/log-forwarder.ts` delivers outbox items through:
  - Webhook with SSRF protection and HMAC signature support.
  - UDP syslog.
  - TCP syslog.
- Worker delivery includes:
  - Batch polling.
  - Claim timeout via `nextRetryAt`.
  - Exponential retry backoff.
  - `sentCount`, `errorCount`, `lastSentAt`, and `lastError` updates.
  - Retry exhaustion logging.
- `apps/worker/src/worker.ts` starts the log forwarder loop.
- `apps/worker/src/index.ts` exports `processPendingLogForwarderDeliveries`.

Kafka forwarders currently fail explicitly and retry/dead-letter because no Kafka client dependency is installed.

---

## Session IP Binding - Soft/Audit Mode

Status: complete in the current working tree.

Implemented:

- `apps/api/src/auth/config.ts` adds `auditSessionIpBinding()`.
- Authenticated API middleware initializes missing session `ipAddress` values from trusted proxy headers.
- Later requests compare the current client IP against the stored session IP.
- Mismatches log a warning with `action: "audit"` and never block the request.
- Mismatch logging is throttled in Redis to avoid noisy repeated logs.
- `SESSION_IP_BINDING_MODE=off` disables the check.
- `SESSION_IP_BINDING_AUDIT_TTL_SECONDS` controls mismatch log throttle TTL and defaults to 1 hour.

Wired through:

- `apps/api/src/auth/handler.ts`
- `apps/api/src/routes/index.ts`

---

## Dual-Port Isolation

Status: complete.

Implemented:

- Gateway public API and admin/server routes are separated at app wiring level.
- `apps/gateway/src/app.ts` exposes separate app creation paths for public and admin traffic.
- `apps/gateway/src/serve.ts` starts the admin/server route listener separately from the public gateway listener.
- Admin routes are no longer exposed on the public gateway port.

Implemented by commit `d482582f`.

---

## ClickHouse Docker Compose Auto-init

Status: complete.

Implemented:

- `docker-compose.yml` includes a ClickHouse service for local enterprise analytics development.
- `packages/db/clickhouse/init.sh` initializes the ClickHouse schema automatically.
- This supports the completed analytics backend without requiring manual ClickHouse setup.

Implemented by commit `1c565403`.

---

## Admin Guardrails and Security Events Pages

Status: complete.

Implemented:

- Added admin organization guardrails page.
- Added admin organization security events page.
- Added admin API support and regenerated admin API types.

Implemented by commit `eeb49a4d`.

---

## Verification

Completed successfully:

```bash
pnpm format
pnpm build:core
pnpm --filter ui exec tsc --noEmit
pnpm --filter ui build
pnpm --filter api build
pnpm --filter worker build
```

Notes:

- `pnpm build:core` needed an escalated run in Codex because sandboxed `tsx` could not create its IPC pipe under `/tmp`.
- `pnpm --filter ui build` needed an escalated run because sandboxed Next/Turbopack builds repeatedly hung during optimization.
- The builds themselves passed after those environment constraints were removed.

---

## Remaining Work

### Phase 1 - Security & Compliance

| Item                      | Status      | Notes                                                                                                         |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| B4 TOTP 2FA               | Not started | Wire Better Auth `twoFactor()` in `apps/api/src/auth/config.ts`.                                              |
| B4 Better Auth SSO wiring | Partial     | API CRUD exists for SSO config; actual auth-provider login flow is not wired.                                 |
| B4 Session IP binding     | Complete    | Soft/audit mode logs mismatches and initializes missing session IPs without blocking users.                   |
| B4 Dual-port isolation    | Complete    | Gateway admin/server routes now listen on a separate admin port and are isolated from public gateway traffic. |

### Phase 2 - Reliability

| Item                        | Status  | Notes                                                                                                 |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| B3 Dynamic config polish    | Partial  | Existing config support needs final UI/admin integration review.                                                                                |
| B9 API key lifecycle worker | Complete | Background worker loop added (`apps/worker/src/services/api-key-lifecycle.ts`); expires keys, flags rotation-due, and clears grace periods. |

### Phase 3 - Observability

| Item                       | Status   | Notes                                                                                    |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| ClickHouse analytics       | Complete | Summary, cost breakdown, and provider health use ClickHouse with Postgres fallback.      |
| Audit/log forwarder worker | Complete | Durable outbox enqueue plus worker delivery/retry for webhook and syslog.                |
| Provider health analytics  | Complete | UI now fetches `/analytics/provider-health` and displays request count, error rate, throttle rate, and latency for the four core providers alongside circuit breaker state. |

### Phase 5 - Infrastructure

| Item       | Status   | Notes                                                                                                             |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Dockerfile | Complete | Multi-stage image added for API, gateway, worker, migrate, and UI.                                                |
| Helm chart | Complete | Chart packages, lints, deploys to the current cluster, and exposes the gateway admin port as an internal service. |

Helm deployment notes:

- Packaged chart: `/tmp/llmgateway-0.1.0.tgz`.
- Release: `llmgateway` in namespace `llmgateway`.
- Current deployed revision: `3`.
- Current release status: `deployed`.
- All `llmgateway` pods verified `1/1 Running` after the revision 3 upgrade.
- Current cluster has no default dynamic storage provisioner, so the deployed release uses `postgresql.persistence.enabled=false` and `valkey.persistence.enabled=false`.
- With persistence disabled, bundled PostgreSQL and Redis use `emptyDir`; this is suitable for a smoke deployment, not durable production storage.
- `llmgateway-gateway-admin` exposes the gateway admin listener on port `4003` inside the cluster.
- Commit `27dffb3b` added the deployment fixes. Commit `86adba80` fixed Helm ConfigMap env rendering so large numeric values render as plain integer strings instead of scientific notation.
- Verified rendered ConfigMap values after deployment: `GATEWAY_TIMEOUT_MS=1500000`, `AI_STREAMING_TIMEOUT_MS=1200000`, and `SHUTDOWN_GRACE_PERIOD_MS=1200000`.

---

## Do Not Forget

- Do not commit this markdown handoff unless explicitly requested.
- Do not run the full E2E suite; run targeted tests only.
- Run `pnpm format` and `pnpm build:core` after backend/API changes.
- Run `pnpm --filter ui build` after UI or generated API type changes.
