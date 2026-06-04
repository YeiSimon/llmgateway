import { randomUUID } from "node:crypto";

import { dynamicConfig } from "@/app.js";

import { redisClient } from "@llmgateway/cache";
import { and, db, eq, isNull, or, tables } from "@llmgateway/db";
import { rateLimitedTotal } from "@llmgateway/instrumentation";
import { logger } from "@llmgateway/logger";

import type { RateLimitSubjectKind } from "@llmgateway/db";

interface ActiveRule {
	id: string;
	subjectKind: RateLimitSubjectKind;
	subjectId: string | null;
	windowSeconds: number;
	metric: "requests" | "tokens";
	limit: number;
	provider: string | null;
	model: string | null;
}

// Atomic sliding-window check + increment via Lua.
// Each KEYS[i] is the Redis ZSET key for one (subject, window) pair.
// ARGV[1] = now (ms), ARGV[2] = unique request ID,
// ARGV[3..] = alternating (windowMs, limit) per key.
// Returns: flat list of [allowed(0|1), remaining] pairs per key — one per rule.
const SLIDING_WINDOW_LUA = `
local results = {}
local now = tonumber(ARGV[1])
local req_id = ARGV[2]
local arg_offset = 3

for i = 1, #KEYS do
  local key = KEYS[i]
  local window_ms = tonumber(ARGV[arg_offset])
  local limit = tonumber(ARGV[arg_offset + 1])
  arg_offset = arg_offset + 2

  redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
  local count = redis.call('ZCARD', key)

  if count >= limit then
    results[#results + 1] = 0
    results[#results + 1] = 0
  else
    redis.call('ZADD', key, now, req_id .. ':' .. i)
    redis.call('EXPIRE', key, math.ceil(window_ms / 1000) + 1)
    results[#results + 1] = 1
    results[#results + 1] = limit - count - 1
  end
end
return results
`;

function ruleRedisKey(
	orgId: string,
	subjectKind: string,
	subjectId: string,
	windowSeconds: number,
	provider: string,
	model: string,
): string {
	return `rl2:${orgId}:${subjectKind}:${subjectId}:${windowSeconds}:${provider}:${model}`;
}

async function loadActiveRules(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
): Promise<ActiveRule[]> {
	const rows = await db
		.select()
		.from(tables.rateLimitRule)
		.where(
			and(
				eq(tables.rateLimitRule.enabled, true),
				or(
					isNull(tables.rateLimitRule.organizationId),
					eq(tables.rateLimitRule.organizationId, organizationId),
				),
			),
		);

	return rows.filter((r) => {
		// Subject match
		if (r.subjectKind === "user" && r.subjectId && r.subjectId !== userId) {
			return false;
		}
		if (
			r.subjectKind === "api_key" &&
			r.subjectId &&
			r.subjectId !== apiKeyId &&
			r.subjectId !== apiKeyLineageId
		) {
			return false;
		}
		if (
			r.subjectKind === "organization" &&
			r.subjectId &&
			r.subjectId !== organizationId
		) {
			return false;
		}
		if (
			r.subjectKind === "provider" &&
			r.subjectId &&
			r.subjectId !== providerId
		) {
			return false;
		}
		if (r.subjectKind === "model" && r.subjectId && r.subjectId !== modelId) {
			return false;
		}
		// Provider/model scope filter
		if (r.provider && r.provider !== providerId) {
			return false;
		}
		if (r.model && r.model !== modelId) {
			return false;
		}
		return true;
	}) as ActiveRule[];
}

function resolveSubjectId(
	rule: ActiveRule,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	organizationId: string,
	providerId: string,
	modelId: string,
): string {
	switch (rule.subjectKind) {
		case "user":
			return rule.subjectId ?? userId ?? organizationId;
		case "api_key":
			return rule.subjectId ?? apiKeyLineageId ?? apiKeyId ?? organizationId;
		case "organization":
			return organizationId;
		case "provider":
			return providerId;
		case "model":
			return modelId;
	}
}

export interface RateLimitCheckResult {
	allowed: boolean;
	rejectedBy: string | null;
	retryAfterSeconds: number | null;
}

export async function checkAndIncrementRateLimits(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
	metric: "requests",
): Promise<RateLimitCheckResult> {
	let rules: ActiveRule[];
	try {
		rules = await loadActiveRules(
			organizationId,
			userId,
			apiKeyId,
			apiKeyLineageId,
			providerId,
			modelId,
		);
	} catch (err) {
		logger.error("Rate limit engine: failed to load rules", err as Error);
		const failMode = dynamicConfig.get<string>("rate_limit_fail_mode", "open");
		if (failMode === "closed") {
			return {
				allowed: false,
				rejectedBy: "rate_limit_fail_mode:closed",
				retryAfterSeconds: null,
			};
		}
		return { allowed: true, rejectedBy: null, retryAfterSeconds: null };
	}

	const requestRules = rules.filter((r) => r.metric === metric);
	if (requestRules.length === 0) {
		return { allowed: true, rejectedBy: null, retryAfterSeconds: null };
	}

	const requestId = randomUUID();
	const now = Date.now();

	const keys: string[] = [];
	const argv: (string | number)[] = [now, requestId];

	for (const rule of requestRules) {
		const subjectId = resolveSubjectId(
			rule,
			userId,
			apiKeyId,
			apiKeyLineageId,
			organizationId,
			providerId,
			modelId,
		);
		keys.push(
			ruleRedisKey(
				organizationId,
				rule.subjectKind,
				subjectId,
				rule.windowSeconds,
				rule.provider ?? "__any__",
				rule.model ?? "__any__",
			),
		);
		argv.push(rule.windowSeconds * 1000, rule.limit);
	}

	let raw: unknown;
	try {
		raw = await redisClient.eval(
			SLIDING_WINDOW_LUA,
			keys.length,
			...keys,
			...argv.map(String),
		);
	} catch (err) {
		logger.error("Rate limit engine: Redis eval failed", err as Error);
		const failMode = dynamicConfig.get<string>("rate_limit_fail_mode", "open");
		if (failMode === "closed") {
			return {
				allowed: false,
				rejectedBy: "rate_limit_fail_mode:closed",
				retryAfterSeconds: null,
			};
		}
		return { allowed: true, rejectedBy: null, retryAfterSeconds: null };
	}

	const results = raw as number[];
	for (let i = 0; i < requestRules.length; i++) {
		const allowed = results[i * 2] === 1;
		if (!allowed) {
			const rule = requestRules[i];
			const label = `${rule.subjectKind}:${metric}/${rule.windowSeconds}s`;
			rateLimitedTotal
				.labels(rule.subjectKind, String(rule.windowSeconds))
				.inc();
			return {
				allowed: false,
				rejectedBy: label,
				retryAfterSeconds: rule.windowSeconds,
			};
		}
	}

	return { allowed: true, rejectedBy: null, retryAfterSeconds: null };
}
