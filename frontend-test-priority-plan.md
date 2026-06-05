# Frontend Test Priority Ladder

## Summary

Add frontend tests in layers. Keep public smoke tests as the baseline, then add authenticated dashboard coverage before deeper full user journeys. The goal is to catch broken pages first, then broken core app flows, then regressions in complex workflows.

## Priority Levels

- **P0: Public smoke tests**
  - Already added for unauthenticated public pages, model grouping pages, auth page rendering, and grouped nav.
  - Purpose: catch broken routes, missing headings, and obvious Next.js errors.
- **P1: Authenticated dashboard smoke tests**
  - Highest next priority.
  - Add a seeded authenticated session fixture.
  - Verify dashboard shell loads, org/project context resolves, sidebar/top nav render, and key pages show usable UI.
  - Cover dashboard home, usage, activity/logs, API keys, settings, billing/provider keys/org team where applicable.
- **P2: Core user journeys**
  - Add full flows for critical product paths: login/session restore, create API key, navigate usage/activity/model usage, provider-key setup with mocked validation, and onboarding to dashboard handoff.
  - Use API setup or DB seed fixtures instead of UI-only setup when possible.
- **P3: Mutating dashboard workflows**
  - Test workflows that change user/org/project state, including project settings, caching toggles, rate-limit rules, team invites, and log forwarders.
  - Run against isolated seeded data to avoid shared-state flakes.
- **P4: Visual and responsive regression**
  - Add screenshots only for stable, high-value surfaces such as dashboard shell, API keys table, usage charts, empty states, and mobile dashboard navigation.
  - Keep this separate from functional tests to avoid noisy failures.

## Implementation Defaults

- Use Playwright for frontend tests.
- Keep `workers: 1` for dashboard/auth tests unless isolated fixtures prove parallel-safe.
- Prefer seeded DB/API setup over slow UI setup.
- Use role/text selectors, not Tailwind classes.
- Mock external payment/provider validation where needed.
- Do not run the full existing backend e2e suite as part of frontend test work.

## Test Plan

- Use the root `test:web:ui:dashboard` script for authenticated dashboard smoke checks.
- Run:
  - `pnpm test:web:ui`
  - `pnpm test:web:ui:dashboard`
  - `pnpm format`
  - `pnpm build`
- Keep public smoke, authenticated smoke, and full journey specs separate so failures clearly show severity.

## Assumptions

- The next best investment is P1 authenticated dashboard smoke tests, not trying to cover every page immediately.
- Full journeys should come after a reliable auth/session fixture exists.
- Authenticated dashboard tests should be DB-seeded or API-prepared, not dependent on live manual accounts.
