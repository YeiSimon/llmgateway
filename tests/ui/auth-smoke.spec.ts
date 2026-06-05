import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const nextErrorText =
	/Application error|This page could not be found|Unhandled Runtime Error|Build Error/i;

async function expectHealthyPage(page: Page, path: string, heading: RegExp) {
	const response = await page.goto(path);

	expect(response?.status(), `${path} status`).toBeLessThan(400);
	await expect(
		page.getByRole("heading", { name: heading }).first(),
	).toBeVisible();
	await expect(page.getByText(nextErrorText)).toHaveCount(0);
}

test("login page renders unauthenticated controls", async ({ page }) => {
	await expectHealthyPage(page, "/login", /^Sign in$/i);
	await expect(page.getByLabel(/^Email$/i)).toBeVisible();
	await expect(page.getByText(/^Password$/i)).toBeVisible();
	await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeVisible();
	await expect(
		page.getByRole("link", { name: /Forgot password/i }),
	).toBeVisible();
});

test("signup page renders unauthenticated controls", async ({ page }) => {
	await expectHealthyPage(page, "/signup", /^Create your free account$/i);
	await expect(page.getByLabel(/^Email$/i)).toBeVisible();
	await expect(page.getByText(/^Password$/i)).toBeVisible();
	await expect(page.getByRole("button", { name: /Start free/i })).toBeVisible();
});

test("forgot password page renders reset request controls", async ({
	page,
}) => {
	await expectHealthyPage(
		page,
		"/forgot-password",
		/^Forgot your password\?$/i,
	);
	await expect(page.getByLabel(/^Email$/i)).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Send reset link/i }),
	).toBeVisible();
});

test("reset password without token renders invalid token state", async ({
	page,
}) => {
	await expectHealthyPage(
		page,
		"/reset-password",
		/^Reset link invalid or expired$/i,
	);
	await expect(
		page.getByRole("link", { name: /Request a new link/i }),
	).toBeVisible();
});

test("reset password with token renders password controls", async ({
	page,
}) => {
	await expectHealthyPage(
		page,
		"/reset-password?token=dummy",
		/^Set a new password$/i,
	);
	await expect(page.getByText(/^New password$/i)).toBeVisible();
	await expect(page.getByText(/^Confirm password$/i)).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Update password/i }),
	).toBeVisible();
});
