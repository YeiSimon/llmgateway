import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { reportKeyError, resetKeyHealth } from "@/lib/api-key-health.js";
import { resetRoundRobinCounters } from "@/lib/round-robin-env.js";

import { getProviderEnv } from "./get-provider-env.js";

describe("getProviderEnv", () => {
	const originalOpenAIKey = process.env.LLM_OPENAI_API_KEY;

	beforeEach(() => {
		resetRoundRobinCounters();
		resetKeyHealth();
		process.env.LLM_OPENAI_API_KEY = "sk-openai-a,sk-openai-b,sk-openai-c";
	});

	afterEach(() => {
		if (originalOpenAIKey === undefined) {
			delete process.env.LLM_OPENAI_API_KEY;
			return;
		}

		process.env.LLM_OPENAI_API_KEY = originalOpenAIKey;
	});

	it("supports non-mutating lookups for auxiliary requests", () => {
		const completionSelection = getProviderEnv("openai");
		expect(completionSelection.token).toBe("sk-openai-a");
		expect(completionSelection.configIndex).toBe(0);

		const moderationSelection = getProviderEnv("openai", {
			advanceRoundRobin: false,
		});
		expect(moderationSelection.token).toBe("sk-openai-a");
		expect(moderationSelection.configIndex).toBe(0);

		const nextCompletionSelection = getProviderEnv("openai");
		expect(nextCompletionSelection.token).toBe("sk-openai-a");
		expect(nextCompletionSelection.configIndex).toBe(0);
	});

	it("defaults to the primary key while it is healthy", () => {
		expect(getProviderEnv("openai").configIndex).toBe(0);
		expect(getProviderEnv("openai").configIndex).toBe(0);
	});

	it("can exclude failed keys when retrying the same provider", () => {
		const secondKey = getProviderEnv("openai", {
			excludedIndices: new Set([0]),
		});
		expect(secondKey.token).toBe("sk-openai-b");
		expect(secondKey.configIndex).toBe(1);

		const thirdKey = getProviderEnv("openai", {
			excludedIndices: new Set([0, 1]),
		});
		expect(thirdKey.token).toBe("sk-openai-c");
		expect(thirdKey.configIndex).toBe(2);
	});

	it("passes selection scope through to env key health", () => {
		reportKeyError("LLM_OPENAI_API_KEY", 0, 500, undefined, "gpt-4");
		reportKeyError("LLM_OPENAI_API_KEY", 0, 500, undefined, "gpt-4");
		reportKeyError("LLM_OPENAI_API_KEY", 0, 500, undefined, "gpt-4");

		const gpt4Selection = getProviderEnv("openai", {
			selectionScope: "gpt-4",
		});
		const claudeSelection = getProviderEnv("openai", {
			selectionScope: "claude-3-5-sonnet",
		});

		expect(gpt4Selection.configIndex).toBe(1);
		expect(claudeSelection.configIndex).toBe(0);
	});
});

describe("getProviderEnv — llm-d (optional API key)", () => {
	const originalBaseUrl = process.env.LLM_LLM_D_BASE_URL;
	const originalApiKey = process.env.LLM_LLM_D_API_KEY;

	afterEach(() => {
		if (originalBaseUrl === undefined) {
			delete process.env.LLM_LLM_D_BASE_URL;
		} else {
			process.env.LLM_LLM_D_BASE_URL = originalBaseUrl;
		}
		if (originalApiKey === undefined) {
			delete process.env.LLM_LLM_D_API_KEY;
		} else {
			process.env.LLM_LLM_D_API_KEY = originalApiKey;
		}
	});

	it("returns empty token when baseUrl is set but API key is not", () => {
		process.env.LLM_LLM_D_BASE_URL = "http://10.2.183.64:30331";
		delete process.env.LLM_LLM_D_API_KEY;

		const result = getProviderEnv("llm-d");
		expect(result.token).toBe("");
		expect(result.configIndex).toBe(0);
	});

	it("returns the API key token when both baseUrl and API key are set", () => {
		process.env.LLM_LLM_D_BASE_URL = "http://10.2.183.64:30331";
		process.env.LLM_LLM_D_API_KEY = "my-llmd-key";

		const result = getProviderEnv("llm-d");
		expect(result.token).toBe("my-llmd-key");
		expect(result.configIndex).toBe(0);
	});

	it("throws when required baseUrl env var is missing", () => {
		delete process.env.LLM_LLM_D_BASE_URL;
		delete process.env.LLM_LLM_D_API_KEY;

		expect(() => getProviderEnv("llm-d")).toThrow(
			"LLM_LLM_D_BASE_URL environment variable is required for llm-d provider",
		);
	});
});
