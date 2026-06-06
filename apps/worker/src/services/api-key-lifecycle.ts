import {
	and,
	db,
	eq,
	inArray,
	isNotNull,
	lt,
	lte,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

const BATCH_SIZE = Number(process.env.API_KEY_LIFECYCLE_BATCH_SIZE) || 200;

/**
 * Marks API keys as `inactive` when their `expiresAt` timestamp is in the past
 * and their current status is `active`.
 *
 * Also flags keys whose `rotationPeriodDays` has elapsed since `lastRotationAt`
 * (or `createdAt` as a fallback) by setting `disabledReason` to `rotation_due`
 * so operators know a rotation is pending.
 */
export async function runApiKeyLifecycleCheck(): Promise<void> {
	const now = new Date();

	// 1. Expire keys whose expiresAt is in the past and status is still active
	try {
		const expired = await db
			.update(tables.apiKey)
			.set({
				status: "inactive",
				disabledReason: "expired",
				updatedAt: now,
			})
			.where(
				and(
					eq(tables.apiKey.status, "active"),
					isNotNull(tables.apiKey.expiresAt),
					lt(tables.apiKey.expiresAt, now),
				),
			)
			.returning({ id: tables.apiKey.id });

		if (expired.length > 0) {
			logger.info(`Expired ${expired.length} API key(s)`, {
				kind: "api-key-lifecycle",
				action: "expire",
				count: expired.length,
			});
		}
	} catch (error) {
		logger.error(
			"Error expiring API keys",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// 2. Flag keys that are due for rotation but not yet flagged
	//    Condition: rotationPeriodDays is set AND
	//      (lastRotationAt + rotationPeriodDays) <= now  OR
	//      (lastRotationAt IS NULL AND createdAt + rotationPeriodDays <= now)
	//    AND status is active AND disabledReason is not already rotation_due
	try {
		// Fetch candidate keys (those with rotationPeriodDays set and status active)
		// We use a raw fetch-then-filter approach to keep the query simple and avoid
		// per-dialect date-arithmetic raw SQL.
		const candidates = await db.query.apiKey.findMany({
			columns: {
				id: true,
				createdAt: true,
				lastRotationAt: true,
				rotationPeriodDays: true,
				disabledReason: true,
			},
			where: {
				status: { eq: "active" },
				rotationPeriodDays: { isNotNull: true },
			},
			limit: BATCH_SIZE,
		});

		const rotationDueIds: string[] = [];
		for (const key of candidates) {
			if (!key.rotationPeriodDays) {
				continue;
			}
			if (key.disabledReason === "rotation_due") {
				continue;
			}
			const baseline = key.lastRotationAt ?? key.createdAt;
			const periodMs = key.rotationPeriodDays * (24 * 60 * 60 * 1000);
			const dueAt = new Date(baseline.getTime() + periodMs);
			if (dueAt <= now) {
				rotationDueIds.push(key.id);
			}
		}

		if (rotationDueIds.length > 0) {
			await db
				.update(tables.apiKey)
				.set({
					disabledReason: "rotation_due",
					updatedAt: now,
				})
				.where(
					and(
						eq(tables.apiKey.status, "active"),
						inArray(tables.apiKey.id, rotationDueIds),
					),
				);

			logger.info(
				`Flagged ${rotationDueIds.length} API key(s) as rotation due`,
				{
					kind: "api-key-lifecycle",
					action: "rotation_due",
					count: rotationDueIds.length,
				},
			);
		}
	} catch (error) {
		logger.error(
			"Error flagging rotation-due API keys",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// 3. Deactivate keys past their grace period (gracePeriodEndsAt <= now and status active)
	try {
		const graceExpired = await db
			.update(tables.apiKey)
			.set({
				status: "inactive",
				disabledReason: "grace_period_ended",
				updatedAt: now,
			})
			.where(
				and(
					eq(tables.apiKey.status, "active"),
					isNotNull(tables.apiKey.gracePeriodEndsAt),
					lte(tables.apiKey.gracePeriodEndsAt, now),
				),
			)
			.returning({ id: tables.apiKey.id });

		if (graceExpired.length > 0) {
			logger.info(
				`Deactivated ${graceExpired.length} API key(s) whose grace period ended`,
				{
					kind: "api-key-lifecycle",
					action: "grace_period_ended",
					count: graceExpired.length,
				},
			);
		}
	} catch (error) {
		logger.error(
			"Error deactivating grace-period-ended API keys",
			error instanceof Error ? error : new Error(String(error)),
		);
	}
}
