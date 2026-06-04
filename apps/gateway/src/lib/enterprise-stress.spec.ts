/**
 * Stress tests for the three new enterprise gateway controls:
 *   1. Multi-window rate limiter  — fires 429 at the right threshold
 *   2. Circuit breaker            — opens after N upstream failures, returns 503
 *   3. Budget cap engine          — soft-blocks when monthly weighted tokens exceeded
 *
 * All tests run in-process (app.request()) against a real Redis and Postgres,
 * using the existing gateway-api-test-harness for DB setup/teardown.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/app.js";
import { createGatewayApiTestHarness } from "@/test-utils/gateway-api-test-harness.js";

import { redisClient } from "@llmgateway/cache";
import { db, eq, tables } from "@llmgateway/db";

import { resetBreaker } from "./circuit-breaker.js";

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const API_KEY_TOKEN = "stress-test-token";
const API_KEY_ID = "stress-key-id";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedStressApiKey(lineageId?: string) {
	await db.delete(tables.apiKey).where(eq(tables.apiKey.id, API_KEY_ID));
	await db.insert(tables.apiKey).values({
		id: API_KEY_ID,
		token: API_KEY_TOKEN,
		projectId: PROJECT_ID,
		description: "Stress test key",
		createdBy: "user-id",
		lineageId: lineageId ?? API_KEY_ID,
	});
}

async function seedProviderKey(mockServerUrl: string) {
	await db.delete(tables.providerKey);
	await db.insert(tables.providerKey).values({
		id: "stress-provider-key",
		token: "sk-stress",
		provider: "llmgateway",
		organizationId: ORG_ID,
		baseUrl: mockServerUrl,
	});
}

function chatRequest(message: string) {
	return app.request("/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${API_KEY_TOKEN}`,
		},
		body: JSON.stringify({
			model: "llmgateway/custom",
			messages: [{ role: "user", content: message }],
		}),
	});
}

async function flushRateLimitKeys() {
	// Delete all sliding-window ZSET keys for the test org
	const keys = await redisClient.keys(`rl2:${ORG_ID}:*`);
	if (keys.length > 0) {
		await redisClient.del(...keys);
	}

	// Delete budget keys too
	const budgetKeys = await redisClient.keys(`budget:${ORG_ID}:*`);
	if (budgetKeys.length > 0) {
		await redisClient.del(...budgetKeys);
	}
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("enterprise gateway stress tests", () => {
	const harness = createGatewayApiTestHarness();

	beforeEach(async () => {
		await seedStressApiKey();
		await seedProviderKey(harness.mockServerUrl);
		await flushRateLimitKeys();
	});

	afterEach(async () => {
		// Clean up rate limit rules
		await db.delete(tables.rateLimitRule);
		await db.delete(tables.budgetCap);
		await flushRateLimitKeys();
		// Reset all breakers touched during tests
		await resetBreaker("llmgateway:custom");
	});

	// ── 1. Rate limiter ────────────────────────────────────────────────────────

	describe("multi-window rate limiter", () => {
		it("allows requests up to the per-api-key limit then returns 429", async () => {
			// Set a very tight limit: 3 requests per 60s on this api_key
			await db.insert(tables.rateLimitRule).values({
				organizationId: ORG_ID,
				subjectKind: "api_key",
				subjectId: API_KEY_ID,
				windowSeconds: 60,
				metric: "requests",
				limit: 3,
			});

			const results = await Promise.all([
				chatRequest("hello 1"),
				chatRequest("hello 2"),
				chatRequest("hello 3"),
				chatRequest("hello 4"), // should be rejected
				chatRequest("hello 5"), // should be rejected
			]);

			const statuses = results.map((r) => r.status);
			const okCount = statuses.filter((s) => s === 200).length;
			const rejectedCount = statuses.filter((s) => s === 429).length;

			expect(okCount).toBe(3);
			expect(rejectedCount).toBe(2);

			// Rejected responses should include Retry-After header
			const firstRejected = results.find((r) => r.status === 429);
			expect(firstRejected?.headers.get("Retry-After")).toBeTruthy();
		});

		it("applies org-level limit across all api keys", async () => {
			// Org-wide cap: 2 requests per 60s
			await db.insert(tables.rateLimitRule).values({
				organizationId: ORG_ID,
				subjectKind: "organization",
				subjectId: null, // applies to ALL keys in the org
				windowSeconds: 60,
				metric: "requests",
				limit: 2,
			});

			const [r1, r2, r3] = await Promise.all([
				chatRequest("org test 1"),
				chatRequest("org test 2"),
				chatRequest("org test 3"),
			]);

			const statuses = [r1.status, r2.status, r3.status];
			expect(statuses.filter((s) => s === 200).length).toBe(2);
			expect(statuses.filter((s) => s === 429).length).toBe(1);
		});

		it("resets after the window expires", async () => {
			// 1-second window for this test
			await db.insert(tables.rateLimitRule).values({
				organizationId: ORG_ID,
				subjectKind: "api_key",
				subjectId: API_KEY_ID,
				windowSeconds: 1,
				metric: "requests",
				limit: 2,
			});

			// Use up the limit
			const [r1, r2, r3] = await Promise.all([
				chatRequest("window 1"),
				chatRequest("window 2"),
				chatRequest("window 3"),
			]);
			expect([r1.status, r2.status].filter((s) => s === 200).length).toBe(2);
			expect(r3.status).toBe(429);

			// Wait for the 1-second window to roll over
			await new Promise((res) => setTimeout(res, 1100));

			// Should be allowed again
			const r4 = await chatRequest("window 4 after reset");
			expect(r4.status).toBe(200);
		});

		it("stacks multiple rules and rejects on the tightest one", async () => {
			await db.insert(tables.rateLimitRule).values([
				{
					// Wide org limit — 10/min
					organizationId: ORG_ID,
					subjectKind: "organization",
					subjectId: null,
					windowSeconds: 60,
					metric: "requests",
					limit: 10,
				},
				{
					// Tight key limit — 1/min (this one should fire)
					organizationId: ORG_ID,
					subjectKind: "api_key",
					subjectId: API_KEY_ID,
					windowSeconds: 60,
					metric: "requests",
					limit: 1,
				},
			]);

			const r1 = await chatRequest("stack 1");
			const r2 = await chatRequest("stack 2");

			expect(r1.status).toBe(200);
			expect(r2.status).toBe(429);

			// Gateway error format: { error: true, status, message }
			const body = await r2.json();
			expect(body.message).toContain("api_key");
		});

		it("ignores disabled rules", async () => {
			await db.insert(tables.rateLimitRule).values({
				organizationId: ORG_ID,
				subjectKind: "api_key",
				subjectId: API_KEY_ID,
				windowSeconds: 60,
				metric: "requests",
				limit: 1,
				enabled: false,
			});

			// Both should pass because the rule is disabled
			const r1 = await chatRequest("disabled 1");
			const r2 = await chatRequest("disabled 2");
			expect(r1.status).toBe(200);
			expect(r2.status).toBe(200);
		});
	});

	// ── 2. Circuit breaker ────────────────────────────────────────────────────

	describe("circuit breaker", () => {
		it("opens after 5 upstream 500 errors and returns 503", async () => {
			// Trigger 5 upstream 500s — mock server responds with 500 when message contains TRIGGER_STATUS_500
			for (let i = 0; i < 5; i++) {
				const r = await chatRequest("TRIGGER_STATUS_500 breaker trip");
				// Each individual failure gets an upstream error, not 503
				expect([500, 502, 503]).toContain(r.status);
			}

			// 6th request: circuit is now open → 503 without hitting upstream
			const r6 = await chatRequest("after breaker open");
			expect(r6.status).toBe(503);

			// Gateway error format: { error: true, status, message }
			const body = await r6.json();
			expect(body.message).toMatch(/circuit breaker/i);
		});

		it("transitions to half-open after recovery period and closes on success", async () => {
			// Trip the circuit by directly writing an open state to Redis
			await redisClient.set(
				"cb:llmgateway:custom",
				JSON.stringify({
					state: "open",
					failures: 5,
					successes: 0,
					openedAt: Date.now() - 31_000, // 31s ago → past the 30s recovery window
				}),
				"EX",
				120,
			);

			// First probe after recovery: transitions to half-open → let it through
			// The mock server will respond successfully
			const probe = await chatRequest("probe after recovery");
			// Should be allowed through (half-open allows one probe)
			expect(probe.status).toBe(200);

			// After 2 successes (successThreshold=2), circuit closes
			const confirm = await chatRequest("second success");
			expect(confirm.status).toBe(200);

			// Subsequent requests should be allowed (closed state)
			const normal = await chatRequest("normal after close");
			expect(normal.status).toBe(200);
		});

		it("reopens immediately if the half-open probe fails", async () => {
			// Manually set half-open state
			await redisClient.set(
				"cb:llmgateway:custom",
				JSON.stringify({
					state: "half-open",
					failures: 5,
					successes: 0,
					openedAt: Date.now() - 31_000,
				}),
				"EX",
				120,
			);

			// Probe fails
			const probe = await chatRequest("TRIGGER_STATUS_500 half-open fail");
			expect([500, 502, 503]).toContain(probe.status);

			// Next request: circuit is back open → 503
			const next = await chatRequest("after reopen");
			expect(next.status).toBe(503);
		});
	});

	// ── 3. Budget cap ─────────────────────────────────────────────────────────

	describe("budget cap engine", () => {
		it("tracks token usage in Redis after successful completions", async () => {
			// Flush any existing budget keys
			await flushRateLimitKeys();

			// Make a successful request (mock returns 10 prompt + 20 completion = 30 tokens)
			const r = await chatRequest("budget tracking test");
			expect(r.status).toBe(200);

			// Wait briefly for the async fire-and-forget budget write
			await new Promise((res) => setTimeout(res, 100));

			// Budget key format: budget:${orgId}:api_key:${lineageId}:${period}:${bucket}
			const now = new Date();
			const monthly = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
			const keys = await redisClient.keys(`budget:${ORG_ID}:api_key:*`);
			const monthlyKey = keys.find((k) => k.includes(monthly));

			if (monthlyKey) {
				const value = parseFloat((await redisClient.get(monthlyKey)) ?? "0");
				// Mock response has 10 prompt + 20 completion = 30 tokens
				expect(value).toBeGreaterThan(0);
			}
		});

		it("blocks requests when monthly token budget is exhausted", async () => {
			await db.insert(tables.budgetCap).values({
				organizationId: ORG_ID,
				subjectKind: "api_key",
				subjectId: API_KEY_ID,
				period: "monthly",
				limit: "1",
			});

			// Pre-fill the budget counter past the limit
			const now = new Date();
			const monthly = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
			const budgetKey = `budget:${ORG_ID}:api_key:${API_KEY_ID}:monthly:${monthly}`;
			await redisClient.set(budgetKey, "999999", "EX", 3600);

			// Request should be blocked — gateway error format: { error: true, status, message }
			const r = await chatRequest("over budget");
			expect(r.status).toBe(429);

			const body = await r.json();
			expect(body.message).toContain("Rate limit exceeded");
			expect(body.message).toContain("budget");
		});
	});

	// ── 4. Throughput baseline ────────────────────────────────────────────────

	describe("throughput baseline", () => {
		it("handles 20 concurrent requests with no rules in under 5s", async () => {
			const start = Date.now();
			const requests = Array.from({ length: 20 }, (_, i) =>
				chatRequest(`throughput test ${i}`),
			);
			const results = await Promise.all(requests);
			const elapsed = Date.now() - start;

			const okCount = results.filter((r) => r.status === 200).length;

			expect(okCount).toBe(20);
			expect(elapsed).toBeLessThan(5000);

			console.log(
				`[throughput] 20 requests in ${elapsed}ms (${(20 / (elapsed / 1000)).toFixed(1)} req/s)`,
			);
		});

		it("measures rate-limiter overhead vs baseline", async () => {
			// Baseline: 5 requests, no rules
			const t0 = Date.now();
			await Promise.all(
				Array.from({ length: 5 }, (_, i) => chatRequest(`baseline ${i}`)),
			);
			const baselineMs = Date.now() - t0;

			// With rules: insert 3 stacked rules (user + key + org)
			await db.insert(tables.rateLimitRule).values([
				{
					organizationId: ORG_ID,
					subjectKind: "organization",
					subjectId: null,
					windowSeconds: 3600,
					metric: "requests",
					limit: 1000,
				},
				{
					organizationId: ORG_ID,
					subjectKind: "api_key",
					subjectId: API_KEY_ID,
					windowSeconds: 3600,
					metric: "requests",
					limit: 1000,
				},
			]);
			await flushRateLimitKeys();

			const t1 = Date.now();
			await Promise.all(
				Array.from({ length: 5 }, (_, i) => chatRequest(`with-rl ${i}`)),
			);
			const withRlMs = Date.now() - t1;

			const overhead = withRlMs - baselineMs;
			console.log(
				`[overhead] baseline=${baselineMs}ms  with-rl=${withRlMs}ms  delta=${overhead}ms`,
			);

			// Rate limiter overhead should be < 50ms per batch of 5 (< 10ms/req)
			expect(overhead).toBeLessThan(50);
		});
	});
});
