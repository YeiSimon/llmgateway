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

async function expectDashboardShell(page: Page, expectProject = true) {
	await expect(page.getByText("Test Organization").first()).toBeVisible();
	if (expectProject) {
		await expect(page.getByText("Smoke Test Project").first()).toBeVisible();
	}
	await expect(
		page.getByRole("link", { name: "Dashboard", exact: true }).first(),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Activity", exact: true }).first(),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "API Keys", exact: true }).first(),
	).toBeVisible();
	await expect(page.getByText(nextErrorText)).toHaveCount(0);
}

async function expectDashboardPage(
	page: Page,
	path: string,
	heading: RegExp | undefined,
	expectProject = true,
) {
	await authenticate(page);

	const response = await page.goto(path);

	expect(response?.status(), `${path} status`).toBeLessThan(400);
	if (heading) {
		await expect(
			page.getByRole("heading", { name: heading }).first(),
		).toBeVisible();
	}
	await expectDashboardShell(page, expectProject);
}

test("dashboard root redirects to the seeded project dashboard", async ({
	page,
}) => {
	await authenticate(page);

	const response = await page.goto("/dashboard");

	expect(response?.status(), "/dashboard status").toBeLessThan(400);
	await expect(page).toHaveURL(
		new RegExp(`/dashboard/${orgId}/${projectId}`),
	);
	await expect(
		page.getByRole("heading", { name: /^Dashboard$/i }),
	).toBeVisible();
	await expectDashboardShell(page);
});

test.describe("authenticated dashboard pages", () => {
	const routes: Array<{ path: string; heading?: RegExp; text?: RegExp }> = [
		{
			path: `/dashboard/${orgId}/${projectId}`,
			heading: /^Dashboard$/i,
			text: /Manage API Keys/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/usage`,
			heading: /^Usage & Metrics$/i,
			text: /Request Volume/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/activity`,
			heading: /^Activity Logs$/i,
			text: /Your recent API requests and system events/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/api-keys`,
			heading: /^API Keys$/i,
			text: /Create and manage API keys/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/api-keys/api-key-test/iam`,
			heading: /^IAM Rules$/i,
			text: /Smoke Test Key/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/agents`,
			heading: /^Agents$/i,
			text: /Monitor your AI coding agents/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/model-usage`,
			heading: /^Usage by model$/i,
			text: /Breakdown by model/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/settings/preferences`,
			heading: /^Preferences$/i,
			text: /Project Name/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/settings/account`,
			heading: /^Account$/i,
			text: /Account Information/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/settings/security`,
			heading: /^Security$/i,
			text: /Change Password/i,
		},
		{
			path: `/dashboard/${orgId}/org/billing`,
			heading: /^Billing$/i,
			text: /Available Balance/i,
		},
		{
			path: `/dashboard/${orgId}/org/discounts`,
			text: /Your Discounts/i,
		},
		{
			path: `/dashboard/${orgId}/org/master-keys`,
			heading: /^Master Keys$/i,
			text: /Enterprise Feature|Create Master Key/i,
		},
		{
			path: `/dashboard/${orgId}/org/policies`,
			heading: /^Policies$/i,
			text: /data retention settings/i,
		},
		{
			path: `/dashboard/${orgId}/org/preferences`,
			heading: /^Preferences$/i,
			text: /Organization Name/i,
		},
		{
			path: `/dashboard/${orgId}/org/provider-keys`,
			heading: /^Provider Keys$/i,
			text: /Add Provider Key/i,
		},
		{
			path: `/dashboard/${orgId}/org/referrals`,
			heading: /^Referrals$/i,
			text: /Referral/i,
		},
		{
			path: `/dashboard/${orgId}/org/team`,
			heading: /^Team$/i,
			text: /Team Members/i,
		},
		{
			path: `/dashboard/${orgId}/org/transactions`,
			heading: /^Transactions$/i,
			text: /Transaction History/i,
		},
	];

	for (const route of routes) {
		test(`${route.path} renders`, async ({ page }) => {
			await expectDashboardPage(
				page,
				route.path,
				route.heading,
				route.path.includes(`/${projectId}`),
			);

			if (route.text) {
				await expect(page.getByText(route.text).first()).toBeVisible();
			}
		});
	}
});

test.describe("authenticated dashboard redirects", () => {
	const redirects: Array<{
		path: string;
		target: RegExp;
		heading: RegExp;
	}> = [
		{
			path: `/dashboard/${orgId}/${projectId}/sessions`,
			target: new RegExp(`/dashboard/${orgId}/${projectId}/agents`),
			heading: /^Agents$/i,
		},
		{
			path: `/dashboard/${orgId}/${projectId}/settings`,
			target: new RegExp(
				`/dashboard/${orgId}/${projectId}/settings/preferences`,
			),
			heading: /^Preferences$/i,
		},
	];

	for (const route of redirects) {
		test(`${route.path} redirects`, async ({ page }) => {
			await authenticate(page);

			const response = await page.goto(route.path);

			expect(response?.status(), `${route.path} status`).toBeLessThan(400);
			await expect(page).toHaveURL(route.target);
			await expect(
				page.getByRole("heading", { name: route.heading }).first(),
			).toBeVisible();
			await expectDashboardShell(page);
		});
	}
});

test("dashboard redirects unauthenticated users to login", async ({ page }) => {
	await page.goto(`/dashboard/${orgId}/${projectId}`);

	await expect(page).toHaveURL(/\/login$/);
	await expect(
		page.getByRole("heading", { name: /^Sign in$/i }),
	).toBeVisible();
});
