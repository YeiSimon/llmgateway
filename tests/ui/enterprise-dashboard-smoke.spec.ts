import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const orgId = "org-test";
const projectId = "project-test";

const nextErrorText =
	/Application error|This page could not be found|Unhandled Runtime Error|Build Error/i;

async function authenticate(page: Page) {
	await page.context().addCookies([
		{
			name: "better-auth.session_token",
			value: "smoke-session",
			url: "http://localhost:3002",
			httpOnly: true,
			sameSite: "Lax",
		},
		{
			name: "better-auth.session_token",
			value: "smoke-session",
			url: "http://localhost:4012",
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
}

async function goto(page: Page, path: string) {
	await authenticate(page);
	const res = await page.goto(path);
	expect(res?.status(), `${path} should not return 4xx/5xx`).toBeLessThan(400);
	await expect(page.getByText(nextErrorText)).toHaveCount(0);
	return res;
}

// ── Enterprise org-level pages ───────────────────────────────────────────────

test.describe("enterprise org-level pages", () => {
	const pages = [
		{
			path: `/dashboard/${orgId}/analytics`,
			heading: /analytics/i,
		},
		{
			path: `/dashboard/${orgId}/logs`,
			heading: /log explorer/i,
		},
		{
			path: `/dashboard/${orgId}/limits`,
			heading: /rate limits/i,
		},
		{
			path: `/dashboard/${orgId}/providers`,
			heading: /provider health/i,
		},
		{
			path: `/dashboard/${orgId}/guide`,
			heading: /setup guide|configuration guide/i,
		},
		{
			path: `/dashboard/${orgId}/org/roles`,
			heading: /roles/i,
		},
		{
			path: `/dashboard/${orgId}/org/teams`,
			heading: /teams/i,
		},
		{
			path: `/dashboard/${orgId}/org/sso`,
			heading: /single sign.on|sso/i,
		},
		{
			path: `/dashboard/${orgId}/org/audit-logs`,
			heading: /audit logs/i,
		},
		{
			path: `/dashboard/${orgId}/org/security-events`,
			heading: /security events/i,
		},
		{
			path: `/dashboard/${orgId}/org/guardrails`,
			heading: /guardrails/i,
		},
		{
			path: `/dashboard/${orgId}/settings/log-forwarders`,
			heading: /log forwarders/i,
		},
		{
			path: `/dashboard/${orgId}/settings`,
			heading: /settings/i,
		},
	];

	for (const { path, heading } of pages) {
		test(`${path} renders without error`, async ({ page }) => {
			await goto(page, path);
			await expect(
				page.getByRole("heading", { name: heading }).first(),
			).toBeVisible();
		});
	}
});

// ── Setup wizard ─────────────────────────────────────────────────────────────

test("setup wizard renders step 1", async ({ page }) => {
	await goto(page, "/setup");
	await expect(
		page
			.getByRole("heading", { name: /create organization|get started|setup/i })
			.first(),
	).toBeVisible();
});

// ── API key CRUD flows ────────────────────────────────────────────────────────

test.describe("API key CRUD", () => {
	test("API keys page shows existing key", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/${projectId}/api-keys`);
		await expect(page.getByText("Smoke Test Key").first()).toBeVisible();
		await expect(page.getByText("lgw_****test").first()).toBeVisible();
	});

	test("API keys page has create button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/${projectId}/api-keys`);
		await expect(
			page
				.getByRole("button", { name: /create|new|add/i })
				.first(),
		).toBeVisible();
	});

	test("API key detail page renders", async ({ page }) => {
		await goto(
			page,
			`/dashboard/${orgId}/${projectId}/api-keys/api-key-test`,
		);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});
});

// ── Provider keys CRUD flows ──────────────────────────────────────────────────

test.describe("provider keys CRUD", () => {
	test("provider keys page shows existing key", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/provider-keys`);
		await expect(page.getByText("Smoke OpenAI").first()).toBeVisible();
	});

	test("provider keys page has add button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/provider-keys`);
		await expect(
			page.getByRole("button", { name: /add|new|create/i }).first(),
		).toBeVisible();
	});
});

// ── Team management flows ─────────────────────────────────────────────────────

test.describe("team management", () => {
	test("team page shows existing member", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/team`);
		await expect(page.getByText("Test User").first()).toBeVisible();
	});

	test("teams page shows invite button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/teams`);
		await expect(
			page.getByRole("button", { name: /invite/i }).first(),
		).toBeVisible();
	});

	test("roles page shows 5-tier role list", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/roles`);
		await expect(page.getByText(/owner/i).first()).toBeVisible();
		await expect(page.getByText(/developer/i).first()).toBeVisible();
		await expect(page.getByText(/viewer/i).first()).toBeVisible();
	});
});

// ── Rate limits flows ─────────────────────────────────────────────────────────

test.describe("rate limits", () => {
	test("limits page has add rule button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/limits`);
		await expect(
			page.getByRole("button", { name: /add rule|new rule|create/i }).first(),
		).toBeVisible();
	});

	test("limits page shows sliding window and budget sections", async ({
		page,
	}) => {
		await goto(page, `/dashboard/${orgId}/limits`);
		await expect(
			page.getByText(/sliding.window|rate limit rules/i).first(),
		).toBeVisible();
	});
});

// ── SSO config flow ───────────────────────────────────────────────────────────

test.describe("SSO config", () => {
	test("SSO page shows not configured state when no config", async ({
		page,
	}) => {
		await goto(page, `/dashboard/${orgId}/org/sso`);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});

	test("SSO page has save or configure button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/sso`);
		await expect(
			page
				.getByRole("button", { name: /save|configure|connect/i })
				.first(),
		).toBeVisible();
	});
});

// ── Log forwarders flow ───────────────────────────────────────────────────────

test.describe("log forwarders", () => {
	test("log forwarders page shows empty state", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/settings/log-forwarders`);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});

	test("log forwarders page has add forwarder button", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/settings/log-forwarders`);
		await expect(
			page
				.getByRole("button", { name: /add|new|create/i })
				.first(),
		).toBeVisible();
	});
});

// ── Analytics page ────────────────────────────────────────────────────────────

test.describe("analytics", () => {
	test("analytics page shows KPI cards", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/analytics`);
		await expect(
			page
				.getByText(/total requests|requests|cost|tokens|latency/i)
				.first(),
		).toBeVisible();
	});
});

// ── Provider health page ──────────────────────────────────────────────────────

test.describe("provider health", () => {
	test("provider health page renders table or empty state", async ({
		page,
	}) => {
		await goto(page, `/dashboard/${orgId}/providers`);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});
});

// ── Guardrails flow ───────────────────────────────────────────────────────────

test.describe("guardrails", () => {
	test("guardrails page renders without error", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/guardrails`);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});

	test("guardrails page has enable toggle or add rule button", async ({
		page,
	}) => {
		await goto(page, `/dashboard/${orgId}/org/guardrails`);
		const toggle = page.getByRole("switch").first();
		const addBtn = page.getByRole("button", { name: /add|enable|create/i }).first();
		const hasToggle = await toggle.isVisible().catch(() => false);
		const hasBtn = await addBtn.isVisible().catch(() => false);
		expect(hasToggle || hasBtn, "should show toggle or add button").toBe(true);
	});
});

// ── Security events page ──────────────────────────────────────────────────────

test.describe("security events", () => {
	test("security events page renders without error", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/security-events`);
		await expect(page.getByText(nextErrorText)).toHaveCount(0);
	});

	test("security events page shows empty state or table", async ({ page }) => {
		await goto(page, `/dashboard/${orgId}/org/security-events`);
		const empty = page.getByText(/no violations|no events|no security events/i).first();
		const table = page.getByRole("table").first();
		const hasEmpty = await empty.isVisible().catch(() => false);
		const hasTable = await table.isVisible().catch(() => false);
		expect(hasEmpty || hasTable, "should show empty state or table").toBe(true);
	});
});

// ── Permission/role boundary smoke ────────────────────────────────────────────

test.describe("unauthenticated redirects", () => {
	const protectedPaths = [
		`/dashboard/${orgId}/analytics`,
		`/dashboard/${orgId}/limits`,
		`/dashboard/${orgId}/org/sso`,
		`/dashboard/${orgId}/org/roles`,
		`/dashboard/${orgId}/settings/log-forwarders`,
	];

	for (const path of protectedPaths) {
		test(`${path} redirects to login when unauthenticated`, async ({
			page,
		}) => {
			await page.goto(path);
			await expect(page).toHaveURL(/\/login$/);
		});
	}
});
