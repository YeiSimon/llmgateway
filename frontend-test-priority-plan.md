# Frontend Test Priority Plan

## Current Status

Last updated: 2026-06-06

Frontend Playwright coverage now exists for the first smoke-test layers:

- Public page smoke tests.
- Auth page smoke tests.
- Desktop and mobile grouped navigation smoke tests.
- Model grouping and comparison page smoke tests.
- Authenticated dashboard smoke tests.
- Enterprise dashboard smoke tests.
- Shallow CRUD surface checks for API keys, provider keys, teams, roles, rate limits, SSO, log forwarders, analytics, provider health, guardrails, and security events.

Current Playwright inventory:

| Scope                         | Count                 |
| ----------------------------- | --------------------- |
| UI Playwright files           | 5 specs + 1 helper    |
| Chromium tests                | 78                    |
| Chromium + mobile listed      | 156                   |
| Enterprise dashboard Chromium | 39                    |
| `apps/ui` page routes         | 90                    |
| Dashboard page routes         | 37                    |

Important note: this is still mostly smoke coverage. It verifies routes, headings, visible controls, empty states, and no obvious Next.js error text. It does not yet prove full product workflows.

## Latest Priority Ladder

### P0 - Keep Smoke Coverage Green

Status: mostly complete.

Run this after frontend route/layout changes:

```bash
pnpm test:web:ui
```

Covered:

- Public pages.
- Auth pages.
- Public navigation.
- Model pages.
- Basic authenticated dashboard pages.
- Enterprise dashboard pages.

Remaining P0 additions:

- Add smoke coverage for dynamic public routes that are not part of the first pass:
  - Blog detail routes.
  - Blog category routes.
  - Changelog routes.
  - Legal pages.
  - Migration guide detail routes.
  - Feature detail routes.
  - Provider detail routes beyond OpenAI.
  - Model detail and model uptime routes.
- Add smoke coverage for dashboard routes not currently checked:
  - `/dashboard/[orgId]/[projectId]/agents`
  - `/dashboard/[orgId]/[projectId]/model-usage`
  - `/dashboard/[orgId]/[projectId]/sessions`
  - `/dashboard/[orgId]/[projectId]/settings`
  - `/dashboard/[orgId]/[projectId]/settings/account`
  - `/dashboard/[orgId]/[projectId]/settings/security`
  - `/dashboard/[orgId]/[projectId]/api-keys/[keyId]/iam`
  - `/dashboard/[orgId]/org/discounts`
  - `/dashboard/[orgId]/org/master-keys`
  - `/dashboard/[orgId]/org/policies`
  - `/dashboard/[orgId]/org/preferences`
  - `/dashboard/[orgId]/org/referrals`
  - `/dashboard/[orgId]/org/transactions`

### P1 - Full Auth And Onboarding Journeys

Status: not complete.

Needed tests:

- Login with valid credentials.
- Login validation errors.
- Logout and session restore.
- Signup happy path with mocked or seeded backend.
- Forgot-password request.
- Reset-password submit with token.
- Onboarding completion to dashboard handoff.
- Setup wizard completion path.

Use seeded API or DB fixtures where possible. Avoid depending on live email or third-party auth providers.

### P2 - Real Dashboard CRUD Workflows

Status: not complete.

The current tests mostly confirm controls exist. Add create/update/delete flows for:

- API keys:
  - Create key.
  - Copy/reveal state if supported.
  - Rotate key.
  - Update metadata or permissions.
  - Revoke/delete key.
- Provider keys:
  - Add provider key with mocked validation.
  - Edit label/config.
  - Delete key.
- Teams and roles:
  - Invite user.
  - Change role.
  - Remove member.
  - Create/edit/delete custom role if supported.
- Rate limits and budgets:
  - Create rule.
  - Edit rule.
  - Disable/delete rule.
- SSO:
  - Save config.
  - Test connection with mocked response.
  - Disable config.
- Log forwarders:
  - Create webhook forwarder.
  - Send test event.
  - Disable/delete forwarder.
- Guardrails:
  - Enable policy.
  - Add rule.
  - Edit/delete rule.

### P3 - Permission And Role Matrix

Status: not complete.

Needed tests:

- Owner can access org settings, billing, roles, SSO, provider keys, and log forwarders.
- Admin can access the expected org management pages.
- Developer can access project workflows but not restricted org controls.
- Viewer can read allowed pages but cannot mutate.
- Unauthorized users redirect to login for protected routes.
- Cross-org or cross-project access returns the correct unauthorized state.

Keep this suite separate from CRUD tests so failures identify permission regressions clearly.

### P4 - Error, Loading, And Empty States

Status: not complete.

Needed tests:

- API failure states on dashboard pages.
- Empty organization/project state.
- Empty logs, analytics, provider health, rate limits, SSO, guardrails, and forwarders.
- Slow API/loading skeleton behavior.
- Form validation errors.
- Retry or refresh actions where available.

Use the mock API server for deterministic frontend behavior.

### P5 - Visual And Responsive Regression

Status: not started.

Add screenshot coverage only for stable, high-value surfaces:

- Public homepage header/nav.
- Dashboard shell.
- API keys table.
- Usage/analytics charts.
- Enterprise org settings.
- Mobile dashboard navigation.
- Empty states.

Keep visual tests separate from functional tests to avoid noisy failures.

## Recommended Next Work

1. Add missing P0 smoke coverage for untested dashboard routes.
2. Add P1 auth journey tests using seeded or mocked auth.
3. Add P2 real CRUD tests for API keys, provider keys, rate limits, SSO, and log forwarders.
4. Add P3 permission matrix coverage once role fixtures are reliable.
5. Add P4 error/empty/loading states using the mock API server.

## Commands

Run from the repository root only.

```bash
pnpm test:web:ui
pnpm test:web:ui:dashboard
pnpm test:web:ui:enterprise
pnpm format
pnpm build
```

Use this when Playwright's bundled Chromium is unavailable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm test:web:ui
```

Do not run the full backend E2E suite for frontend test work unless the task specifically requires it.
