import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const nextErrorText =
	/Application error|This page could not be found|Unhandled Runtime Error|Build Error/i;

async function expectNoNextError(page: Page) {
	await expect(page.getByText(nextErrorText)).toHaveCount(0);
}

async function openDesktopGroup(page: Page, name: string) {
	const trigger = page.getByRole("button", { name });

	await trigger.hover();
	await trigger.click();
}

test("desktop grouped navigation exposes representative links", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: /LLM Gateway/i }).first(),
	).toBeVisible();
	const header = page.locator("header");

	await openDesktopGroup(page, "Products");
	await expect(
		header.getByRole("link", { name: /^AI Gateway\b/i }),
	).toBeVisible();

	await openDesktopGroup(page, "Resources");
	for (const link of ["Providers", "Models", "Compare"]) {
		await expect(
			header
				.getByRole("link", { name: new RegExp(`^${link}\\b`, "i") })
				.first(),
		).toBeVisible();
	}

	await openDesktopGroup(page, "AI");
	for (const link of ["MCP Server", "Agents", "Templates"]) {
		await expect(
			header
				.getByRole("link", { name: new RegExp(`^${link}\\b`, "i") })
				.first(),
		).toBeVisible();
	}

	await expectNoNextError(page);
});

test("mobile grouped navigation opens, navigates, and closes", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	const header = page.locator("header");

	await page.getByRole("button", { name: "Open Menu" }).click();
	await page.getByRole("button", { name: "Products" }).click();
	await expect(
		header.getByRole("link", { name: /^AI Gateway\b/i }),
	).toBeVisible();

	await page.getByRole("button", { name: "Resources" }).click();
	for (const link of ["Providers", "Models", "Compare"]) {
		await expect(
			header
				.getByRole("link", { name: new RegExp(`^${link}\\b`, "i") })
				.first(),
		).toBeVisible();
	}

	await page.getByRole("button", { name: "AI" }).click();
	for (const link of ["MCP Server", "Agents", "Templates"]) {
		await expect(
			header
				.getByRole("link", { name: new RegExp(`^${link}\\b`, "i") })
				.first(),
		).toBeVisible();
	}

	await page.getByRole("button", { name: "Close Menu" }).click();
	await expect(page.getByRole("button", { name: "Open Menu" })).toBeVisible();

	await page.getByRole("button", { name: "Open Menu" }).click();
	await page
		.getByRole("link", { name: /^Models$/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/models$/);
	await expect(
		page.getByRole("heading", { name: /^AI Models Directory$/i }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Open Menu" })).toBeVisible();
	await expectNoNextError(page);
});
