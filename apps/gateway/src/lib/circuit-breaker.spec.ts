import { describe, expect, it, vi, beforeEach } from "vitest";

import { redisClient } from "@llmgateway/cache";

import {
	buildBreakerKey,
	isBreakerOpen,
	recordBreakerFailure,
	recordBreakerSuccess,
	resetBreaker,
} from "./circuit-breaker.js";

// Mock Redis and logger before importing the module under test
vi.mock("@llmgateway/cache", () => ({
	redisClient: {
		get: vi.fn(),
		set: vi.fn(),
	},
}));

vi.mock("@llmgateway/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@llmgateway/instrumentation", () => ({
	circuitBreakerState: { labels: vi.fn(() => ({ set: vi.fn() })) },
}));

const mockGet = redisClient.get as ReturnType<typeof vi.fn>;
const mockSet = redisClient.set as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	mockSet.mockResolvedValue("OK");
});

describe("isBreakerOpen", () => {
	it("returns false when no state exists (cold start)", async () => {
		mockGet.mockResolvedValue(null);
		expect(await isBreakerOpen("openai:gpt-4o")).toBe(false);
	});

	it("returns false when state is closed", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "closed",
				failures: 0,
				successes: 0,
				openedAt: null,
			}),
		);
		expect(await isBreakerOpen("openai:gpt-4o")).toBe(false);
	});

	it("returns true when state is open and recovery window has NOT elapsed", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "open",
				failures: 5,
				successes: 0,
				openedAt: Date.now() - 1000,
			}),
		);
		expect(await isBreakerOpen("openai:gpt-4o")).toBe(true);
	});

	it("transitions to half-open when recovery window has elapsed", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "open",
				failures: 5,
				successes: 0,
				openedAt: Date.now() - 31_000,
			}),
		);
		const open = await isBreakerOpen("openai:gpt-4o", { recoveryMs: 30_000 });
		expect(open).toBe(false);
		expect(mockSet).toHaveBeenCalledOnce();
		const stored = JSON.parse(mockSet.mock.calls[0][1] as string);
		expect(stored.state).toBe("half-open");
	});
});

describe("recordBreakerFailure", () => {
	it("opens breaker when failures reach threshold", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "closed",
				failures: 4,
				successes: 0,
				openedAt: null,
			}),
		);
		await recordBreakerFailure("openai:gpt-4o", { failureThreshold: 5 });
		const stored = JSON.parse(mockSet.mock.calls[0][1] as string);
		expect(stored.state).toBe("open");
		expect(stored.failures).toBe(5);
	});

	it("increments failures without opening below threshold", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "closed",
				failures: 2,
				successes: 0,
				openedAt: null,
			}),
		);
		await recordBreakerFailure("openai:gpt-4o", { failureThreshold: 5 });
		const stored = JSON.parse(mockSet.mock.calls[0][1] as string);
		expect(stored.state).toBe("closed");
		expect(stored.failures).toBe(3);
	});
});

describe("recordBreakerSuccess", () => {
	it("closes breaker from half-open after enough successes", async () => {
		mockGet.mockResolvedValue(
			JSON.stringify({
				state: "half-open",
				failures: 5,
				successes: 1,
				openedAt: 0,
			}),
		);
		await recordBreakerSuccess("openai:gpt-4o", { successThreshold: 2 });
		const stored = JSON.parse(mockSet.mock.calls[0][1] as string);
		expect(stored.state).toBe("closed");
		expect(stored.failures).toBe(0);
	});
});

describe("resetBreaker", () => {
	it("forces state to closed", async () => {
		mockGet.mockResolvedValue(null);
		await resetBreaker("openai:gpt-4o");
		const stored = JSON.parse(mockSet.mock.calls[0][1] as string);
		expect(stored.state).toBe("closed");
	});
});

describe("buildBreakerKey", () => {
	it("combines provider and model", () => {
		expect(buildBreakerKey("openai", "gpt-4o")).toBe("openai:gpt-4o");
	});
});
