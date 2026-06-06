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

const publicPages: Array<{ path: string; heading: RegExp }> = [
	{ path: "/", heading: /LLM Gateway/i },
	{ path: "/pricing", heading: /Simple, Transparent Pricing/i },
	{ path: "/providers", heading: /AI Providers/i },
	{ path: "/providers/openai", heading: /OpenAI Provider/i },
	{ path: "/apps", heading: /Apps shipping with\s+LLM Gateway/i },
	{ path: "/agents", heading: /^Agents$/i },
	{ path: "/mcp", heading: /^MCP Server$/i },
	{ path: "/guides", heading: /^Guides$/i },
	{ path: "/blog", heading: /^Blog$/i },
	{
		path: "/token-cost-calculator",
		heading: /Calculate your true LLM token costs/i,
	},
];

const modelPages: Array<{ path: string; heading: RegExp }> = [
	{ path: "/models", heading: /^AI Models Directory$/i },
	{ path: "/models/text", heading: /^Text Generation Models$/i },
	{ path: "/models/reasoning", heading: /^Reasoning Models$/i },
	{ path: "/models/vision", heading: /^Vision Models$/i },
	{ path: "/models/tools", heading: /^Tool-Calling Models$/i },
	{ path: "/models/web-search", heading: /^Web Search Models$/i },
	{ path: "/models/embeddings", heading: /^Embedding Models$/i },
	{ path: "/models/text-to-image", heading: /^Text-to-Image Models$/i },
	{ path: "/models/image-to-image", heading: /^Image-to-Image Models$/i },
	{ path: "/models/video", heading: /^Video Generation Models$/i },
	{ path: "/models/discounted", heading: /^Discounted Models$/i },
];

const dynamicPublicPages: Array<{ path: string; heading: RegExp }> = [
	{
		path: "/blog/openai-compatible-embeddings",
		heading: /^Embeddings on LLM Gateway: One API for Vectors and Chat$/i,
	},
	{ path: "/blog/category/product", heading: /^Blog$/i },
	{
		path: "/changelog/openai-compatible-embeddings",
		heading: /^OpenAI-Compatible Embeddings$/i,
	},
	{ path: "/legal/privacy", heading: /^Privacy Policy$/i },
	{
		path: "/migration/openrouter",
		heading: /^Migrate from OpenRouter$/i,
	},
	{
		path: "/features/multi-provider-support",
		heading: /^Multi-Provider Support$/i,
	},
	{ path: "/providers/anthropic", heading: /^Anthropic Provider$/i },
];

test.describe("public pages", () => {
	for (const route of publicPages) {
		test(`${route.path} renders`, async ({ page }) => {
			await expectHealthyPage(page, route.path, route.heading);
		});
	}
});

test.describe("model grouping pages", () => {
	for (const route of modelPages) {
		test(`${route.path} renders`, async ({ page }) => {
			await expectHealthyPage(page, route.path, route.heading);
			await expect(
				page.getByRole("link", { name: /^Compare$/i }),
			).toBeVisible();
		});
	}
});

test.describe("dynamic public pages", () => {
	for (const route of dynamicPublicPages) {
		test(`${route.path} renders`, async ({ page }) => {
			await expectHealthyPage(page, route.path, route.heading);
		});
	}
});

test("model comparison page renders grouped table sections", async ({
	page,
}) => {
	await expectHealthyPage(
		page,
		"/models/compare",
		/^Compare AI Models Side by Side$/i,
	);
	await expect(page.getByText(/^Compare AI Models$/i)).toBeVisible();

	for (const section of [
		"Overview",
		"Pricing",
		"Context",
		"Capabilities",
		"Parameters",
	]) {
		await expect(
			page.getByRole("cell", { name: section, exact: true }),
		).toBeVisible();
	}
});
