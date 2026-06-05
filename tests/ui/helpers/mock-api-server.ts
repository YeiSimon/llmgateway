import { createServer } from "node:http";

const port = 4012;
const now = "2026-06-05T00:00:00.000Z";

const user = {
	id: "user-test",
	name: "Test User",
	email: "test@example.com",
	emailVerified: true,
	image: null,
	onboardingCompleted: true,
	createdAt: now,
	updatedAt: now,
};

const organization = {
	id: "org-test",
	name: "Test Organization",
	slug: "test-organization",
	credits: "25.00",
	plan: "free",
	planExpiresAt: null,
	retentionLevel: "standard",
	billingEmail: "billing@example.com",
	createdAt: now,
	updatedAt: now,
};

const project = {
	id: "project-test",
	name: "Smoke Test Project",
	organizationId: organization.id,
	mode: "hybrid",
	cachingEnabled: true,
	cacheDurationSeconds: 300,
	createdAt: now,
	updatedAt: now,
};

const apiKey = {
	id: "api-key-test",
	description: "Smoke Test Key",
	status: "active",
	projectId: project.id,
	organizationId: organization.id,
	maskedToken: "lgw_****test",
	usageLimit: null,
	usageMode: "unlimited",
	currentUsage: "0",
	currentPeriodResetAt: null,
	createdAt: now,
	updatedAt: now,
};

const providerKey = {
	id: "provider-key-test",
	createdAt: now,
	updatedAt: now,
	provider: "openai",
	name: "Smoke OpenAI",
	baseUrl: null,
	options: null,
	status: "active",
	organizationId: organization.id,
	maskedToken: "sk-****test",
};

const activityDay = {
	date: "2026-06-05",
	requestCount: 0,
	successfulRequests: 0,
	failedRequests: 0,
	errorCount: 0,
	cachedRequests: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	cost: 0,
	inputCost: 0,
	outputCost: 0,
	cachedInputCost: 0,
	dataStorageCost: 0,
	requestCost: 0,
	discountSavings: 0,
	modelBreakdown: [],
	providerBreakdown: [],
	apiKeyBreakdown: [],
};

const model = {
	id: "openai/gpt-4o-mini",
	createdAt: now,
	releasedAt: "2024-07-18T00:00:00.000Z",
	name: "GPT-4o mini",
	aliases: [],
	description: "Smoke-test model",
	family: "openai",
	free: false,
	output: ["text"],
	stability: "stable",
	status: "active",
	mappings: [
		{
			id: "mapping-test",
			createdAt: now,
			modelId: "openai/gpt-4o-mini",
			providerId: "openai",
			modelName: "gpt-4o-mini",
			region: null,
			inputPrice: "0.15",
			outputPrice: "0.60",
			cachedInputPrice: null,
			cacheWriteInputPrice: null,
			cacheWriteInputPrice1h: null,
			imageInputPrice: null,
			imageOutputPrice: null,
			imageInputTokensByResolution: null,
			imageOutputTokensByResolution: null,
			requestPrice: null,
			contextSize: 128000,
			maxOutput: 16384,
			streaming: true,
			vision: true,
			reasoning: false,
			reasoningOutput: null,
			reasoningMaxTokens: null,
			tools: true,
			jsonOutput: true,
			jsonOutputSchema: true,
			webSearch: false,
			webSearchPrice: null,
			supportedVideoSizes: null,
			supportedVideoDurationsSeconds: null,
			supportsVideoAudio: null,
			supportsVideoWithoutAudio: null,
			perSecondPrice: null,
			discount: null,
			stability: "stable",
			supportedParameters: ["temperature", "max_tokens"],
			deprecatedAt: null,
			deactivatedAt: null,
			status: "active",
		},
	],
};

function jsonResponse(body: unknown, status = 200) {
	return {
		status,
		headers: {
			"Access-Control-Allow-Credentials": "true",
			"Access-Control-Allow-Headers": "content-type,authorization",
			"Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
			"Access-Control-Allow-Origin": "http://localhost:3002",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	};
}

function hasSessionCookie(headers: { cookie?: string }) {
	return /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
		headers.cookie ?? "",
	);
}

function responseFor(
	pathname: string,
	headers: { cookie?: string; origin?: string },
) {
	if (pathname === "/") {
		return jsonResponse({ ok: true });
	}

	if (pathname === "/user/me") {
		return hasSessionCookie(headers)
			? jsonResponse({ user })
			: jsonResponse({ error: "Unauthorized" }, 401);
	}

	if (pathname === "/auth/get-session") {
		return hasSessionCookie(headers)
			? jsonResponse({ user, session: { id: "session-test", userId: user.id } })
			: jsonResponse(null);
	}

	if (pathname === "/orgs") {
		return jsonResponse({ organizations: [organization] });
	}

	if (pathname === `/orgs/${organization.id}`) {
		return jsonResponse({ organization });
	}

	if (pathname === `/orgs/${organization.id}/projects`) {
		return jsonResponse({ projects: [project] });
	}

	if (pathname === `/orgs/${organization.id}/credits-runway`) {
		return jsonResponse({ runwayDays: null, avgDailySpend7d: 0 });
	}

	if (pathname === `/orgs/${organization.id}/transactions`) {
		return jsonResponse({ transactions: [] });
	}

	if (pathname === `/orgs/${organization.id}/referral-stats`) {
		return jsonResponse({
			referralCode: "SMOKE",
			referralLink: "http://localhost:3002/referrals?code=SMOKE",
			referrals: 0,
			creditsEarned: 0,
		});
	}

	if (pathname === `/orgs/${organization.id}/discounts`) {
		return jsonResponse({ discounts: [] });
	}

	if (pathname === `/projects/${project.id}`) {
		return jsonResponse({ project });
	}

	if (pathname === "/activity") {
		return jsonResponse({ activity: [activityDay] });
	}

	if (pathname === "/activity/sources") {
		return jsonResponse({ sources: [] });
	}

	if (pathname === "/logs") {
		return jsonResponse({ logs: [], total: 0, hasMore: false });
	}

	if (pathname === "/logs/unique-models") {
		return jsonResponse({ models: [] });
	}

	if (pathname === "/keys/api") {
		return jsonResponse({
			apiKeys: [apiKey],
			planLimits: { plan: "free", currentCount: 1, maxKeys: 5 },
		});
	}

	if (pathname === "/keys/provider") {
		return jsonResponse({ providerKeys: [providerKey] });
	}

	if (pathname === `/team/${organization.id}/members`) {
		return jsonResponse({
			members: [
				{
					id: "member-test",
					role: "owner",
					userId: user.id,
					organizationId: organization.id,
					createdAt: now,
					updatedAt: now,
					user,
				},
			],
		});
	}

	if (pathname === "/subscriptions/status") {
		return jsonResponse({
			subscriptionCancelled: false,
			billingCycle: "monthly",
		});
	}

	if (pathname === "/internal/models") {
		return jsonResponse({ models: [model] });
	}

	if (pathname === "/internal/providers") {
		return jsonResponse({
			providers: [
				{
					id: "openai",
					createdAt: now,
					name: "OpenAI",
					description: "OpenAI provider",
					streaming: true,
					cancellation: true,
					color: "#10a37f",
					website: "https://openai.com",
					announcement: null,
					status: "active",
				},
			],
		});
	}

	if (pathname.startsWith("/public/discounts/model/")) {
		return jsonResponse({ discounts: [] });
	}

	return jsonResponse({});
}

const server = createServer((request, response) => {
	const url = new URL(request.url ?? "/", `http://localhost:${port}`);
	const result =
		request.method === "OPTIONS"
			? jsonResponse(null, 204)
			: responseFor(url.pathname, request.headers);

	response.writeHead(result.status, result.headers);
	response.end(result.body);
});

server.listen(port, "localhost", () => {
	console.log(`Mock API server listening on http://localhost:${port}`);
});
