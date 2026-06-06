import { valkeyClient } from "@llmgateway/cache";
import { and, db, eq, isNull, or, tables } from "@llmgateway/db";
import {
	budgetAlertTotal,
	rateLimitedTotal,
} from "@llmgateway/instrumentation";
import { logger } from "@llmgateway/logger";

import type { RateLimitSubjectKind } from "@llmgateway/db";

const THRESHOLDS = [50, 80, 95, 100] as const;

function periodBucketId(period: "daily" | "weekly" | "monthly"): string {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	switch (period) {
		case "daily":
			return `${y}${m}${d}`;
		case "weekly": {
			// ISO week number
			const jan1 = new Date(Date.UTC(y, 0, 1));
			const daysDiff = (now.getTime() - jan1.getTime()) / 86400000;
			const week = Math.ceil((daysDiff + jan1.getUTCDay() + 1) / 7);
			return `${y}W${String(week).padStart(2, "0")}`;
		}
		case "monthly":
			return `${y}${m}`;
	}
}

function budgetRedisKey(
	orgId: string,
	subjectKind: string,
	subjectId: string,
	period: string,
	bucketId: string,
): string {
	return `budget:${orgId}:${subjectKind}:${subjectId}:${period}:${bucketId}`;
}

function alertFiredKey(budgetKey: string, threshold: number): string {
	return `${budgetKey}:alert:${threshold}`;
}

async function fireAlertIfNeeded(
	budgetKey: string,
	subjectKind: string,
	period: string,
	used: number,
	limit: number,
): Promise<void> {
	const pct = (used / limit) * 100;
	for (const threshold of THRESHOLDS) {
		if (pct >= threshold) {
			const firedKey = alertFiredKey(budgetKey, threshold);
			// SET NX so the alert fires at most once per period bucket per threshold
			const set = await valkeyClient.set(
				firedKey,
				"1",
				"EX",
				32 * 24 * 3600,
				"NX",
			);
			if (set === "OK") {
				budgetAlertTotal.labels(subjectKind, period, String(threshold)).inc();
				logger.warn("Budget threshold crossed", {
					budgetKey,
					threshold,
					used,
					limit,
					pct: pct.toFixed(1),
				});
			}
		}
	}
}

export interface BudgetCheckResult {
	allowed: boolean;
	rejectedBy: string | null;
}

/**
 * Pre-flight: check whether any budget cap is already exhausted.
 * Does NOT increment counters — that happens in incrementBudgets() after
 * token counts are known. Design: "soft cap" — the request that pushes
 * usage over the limit succeeds; subsequent requests in the same period
 * are blocked until the period resets.
 */
export async function checkBudgetsPreflight(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
): Promise<BudgetCheckResult> {
	let caps: Awaited<ReturnType<typeof loadCaps>>;
	try {
		caps = await loadCaps(
			organizationId,
			userId,
			apiKeyId,
			apiKeyLineageId,
			providerId,
			modelId,
		);
	} catch (err) {
		logger.error(
			"Budget engine: failed to load caps for preflight",
			err as Error,
		);
		return { allowed: true, rejectedBy: null };
	}

	for (const cap of caps) {
		const bucketId = periodBucketId(
			cap.period as "daily" | "weekly" | "monthly",
		);
		const key = budgetRedisKey(
			organizationId,
			cap.subjectKind,
			cap.subjectId,
			cap.period,
			bucketId,
		);
		const currentStr = await valkeyClient.get(key);
		const current = currentStr ? parseFloat(currentStr) : 0;
		if (current >= cap.limit) {
			const label = `${cap.subjectKind}:${cap.period}_budget`;
			rateLimitedTotal.labels(cap.subjectKind, cap.period).inc();
			return { allowed: false, rejectedBy: label };
		}
	}
	return { allowed: true, rejectedBy: null };
}

/**
 * Post-flight: increment budget counters and fire threshold alerts.
 * Called fire-and-forget from the insertLog wrapper after token counts are known.
 */
export async function incrementBudgets(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
	weightedTokens: number,
): Promise<void> {
	if (weightedTokens <= 0) {
		return;
	}

	let caps: Awaited<ReturnType<typeof loadCaps>>;
	try {
		caps = await loadCaps(
			organizationId,
			userId,
			apiKeyId,
			apiKeyLineageId,
			providerId,
			modelId,
		);
	} catch (err) {
		logger.error(
			"Budget engine: failed to load caps for increment",
			err as Error,
		);
		return;
	}

	const ttl = 32 * 24 * 3600;
	for (const cap of caps) {
		const bucketId = periodBucketId(
			cap.period as "daily" | "weekly" | "monthly",
		);
		const key = budgetRedisKey(
			organizationId,
			cap.subjectKind,
			cap.subjectId,
			cap.period,
			bucketId,
		);
		const newValue = parseFloat(
			await valkeyClient.incrbyfloat(key, weightedTokens),
		);
		await valkeyClient.expire(key, ttl);
		await fireAlertIfNeeded(
			key,
			cap.subjectKind,
			cap.period,
			newValue,
			cap.limit,
		);
	}
}

/** @deprecated Use checkBudgetsPreflight + incrementBudgets instead */
export async function checkAndIncrementBudgets(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
	weightedTokens: number,
): Promise<BudgetCheckResult> {
	const check = await checkBudgetsPreflight(
		organizationId,
		userId,
		apiKeyId,
		apiKeyLineageId,
		providerId,
		modelId,
	);
	if (!check.allowed) {
		return check;
	}
	await incrementBudgets(
		organizationId,
		userId,
		apiKeyId,
		apiKeyLineageId,
		providerId,
		modelId,
		weightedTokens,
	);
	return { allowed: true, rejectedBy: null };
}

interface ActiveCap {
	subjectKind: RateLimitSubjectKind;
	subjectId: string;
	period: string;
	limit: number;
}

async function loadCaps(
	organizationId: string,
	userId: string | null,
	apiKeyId: string | null,
	apiKeyLineageId: string | null,
	providerId: string,
	modelId: string,
): Promise<ActiveCap[]> {
	const rows = await db
		.select()
		.from(tables.budgetCap)
		.where(
			and(
				eq(tables.budgetCap.enabled, true),
				or(
					isNull(tables.budgetCap.organizationId),
					eq(tables.budgetCap.organizationId, organizationId),
				),
			),
		);

	return rows
		.filter((r) => {
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
			return true;
		})
		.map((r) => {
			let subjectId = r.subjectId ?? organizationId;
			if (r.subjectKind === "user") {
				subjectId = r.subjectId ?? userId ?? organizationId;
			}
			if (r.subjectKind === "api_key") {
				subjectId =
					r.subjectId ?? apiKeyLineageId ?? apiKeyId ?? organizationId;
			}
			return {
				subjectKind: r.subjectKind as RateLimitSubjectKind,
				subjectId,
				period: r.period,
				limit: parseFloat(r.limit),
			};
		});
}
