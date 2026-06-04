import { db, eq, shortid, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

// ─── Step 1: Auto-rotation ─────────────────────────────────────────────────

async function runAutoRotation(): Promise<number> {
	const now = new Date();

	// Find keys that have rotationPeriodDays set and are due for rotation
	const allKeys = await db.query.apiKey.findMany({
		where: {
			status: { ne: "deleted" as const },
		},
		with: {
			project: {
				with: {
					organization: true,
				},
			},
		},
	});

	const dueKeys = allKeys.filter((key) => {
		if (!key.rotationPeriodDays) {
			return false;
		}
		const lastRotation = key.lastRotationAt ?? key.createdAt;
		const rotationOffsetMs = key.rotationPeriodDays * 86_400_000;
		const dueAt = new Date(lastRotation.getTime() + rotationOffsetMs);
		return now >= dueAt;
	});

	let rotatedCount = 0;

	for (const key of dueKeys) {
		try {
			const prefix =
				process.env.NODE_ENV === "development" ? "llmgdev_" : "llmgtwy_";
			const newToken = prefix + shortid(40);
			const gracePeriodDays = 7;
			const gracePeriodOffsetMs = gracePeriodDays * 86_400_000;
			const gracePeriodEndsAt = new Date(now.getTime() + gracePeriodOffsetMs);

			// Create new (rotated) key
			await db.insert(tables.apiKey).values({
				token: newToken,
				projectId: key.projectId,
				description: `${key.description} (rotated)`,
				status: "active",
				usageLimit: key.usageLimit,
				periodUsageLimit: key.periodUsageLimit,
				periodUsageDurationValue: key.periodUsageDurationValue,
				periodUsageDurationUnit: key.periodUsageDurationUnit,
				createdBy: key.createdBy,
				rotatedFromId: key.id,
				lineageId: key.lineageId,
				costCenter: key.costCenter,
				rotationPeriodDays: key.rotationPeriodDays,
				inactivityTimeoutDays: key.inactivityTimeoutDays,
				expiresAt: key.expiresAt,
			});

			// Update old key with grace period and rotation timestamp
			await db
				.update(tables.apiKey)
				.set({
					gracePeriodEndsAt,
					lastRotationAt: now,
				})
				.where(eq(tables.apiKey.id, key.id));

			logger.info("api-key-lifecycle: auto-rotated key", {
				keyId: key.id,
				projectId: key.projectId,
				gracePeriodEndsAt,
			});

			rotatedCount++;
		} catch (err) {
			logger.error("api-key-lifecycle: failed to auto-rotate key", {
				keyId: key.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return rotatedCount;
}

// ─── Step 2: Inactivity disable ───────────────────────────────────────────

async function runInactivityDisable(): Promise<number> {
	const now = new Date();

	const allKeys = await db.query.apiKey.findMany({
		where: {
			status: { eq: "active" as const },
		},
	});

	const inactiveKeys = allKeys.filter((key) => {
		if (!key.inactivityTimeoutDays) {
			return false;
		}
		const lastActivity = key.updatedAt;
		const inactivityOffsetMs = key.inactivityTimeoutDays * 86_400_000;
		const timeoutAt = new Date(lastActivity.getTime() + inactivityOffsetMs);
		return now >= timeoutAt;
	});

	let disabledCount = 0;

	for (const key of inactiveKeys) {
		try {
			await db
				.update(tables.apiKey)
				.set({
					status: "inactive",
					disabledReason: "Disabled due to inactivity",
				})
				.where(eq(tables.apiKey.id, key.id));

			logger.info("api-key-lifecycle: disabled inactive key", {
				keyId: key.id,
				inactivityTimeoutDays: key.inactivityTimeoutDays,
			});

			disabledCount++;
		} catch (err) {
			logger.error("api-key-lifecycle: failed to disable inactive key", {
				keyId: key.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return disabledCount;
}

// ─── Step 3: Expiry warnings ──────────────────────────────────────────────

async function runExpiryWarnings(): Promise<number> {
	const now = new Date();
	const sevenDaysMs = 7 * 86_400_000;
	const sevenDaysFromNow = new Date(now.getTime() + sevenDaysMs);

	// Keys expiring within 7 days that haven't had a warning sent yet
	const allKeys = await db.query.apiKey.findMany({
		where: {
			status: { ne: "deleted" as const },
		},
	});

	const expiringKeys = allKeys.filter((key) => {
		if (!key.expiresAt) {
			return false;
		}
		if (key.lastExpiryWarningSentAt !== null) {
			return false;
		}
		return key.expiresAt <= sevenDaysFromNow && key.expiresAt > now;
	});

	let warnedCount = 0;

	for (const key of expiringKeys) {
		try {
			logger.warn("api-key-lifecycle: API key expiring soon", {
				keyId: key.id,
				expiresAt: key.expiresAt,
				projectId: key.projectId,
				description: key.description,
			});

			await db
				.update(tables.apiKey)
				.set({ lastExpiryWarningSentAt: now })
				.where(eq(tables.apiKey.id, key.id));

			warnedCount++;
		} catch (err) {
			logger.error("api-key-lifecycle: failed to record expiry warning", {
				keyId: key.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return warnedCount;
}

// ─── Step 4: Hard-disable expired keys ───────────────────────────────────

async function runHardDisableExpired(): Promise<number> {
	const now = new Date();

	const allKeys = await db.query.apiKey.findMany({
		where: {
			status: { ne: "deleted" as const },
		},
	});

	const expiredKeys = allKeys.filter(
		(key) =>
			key.expiresAt !== null &&
			key.expiresAt < now &&
			key.status !== "inactive",
	);

	let disabledCount = 0;

	for (const key of expiredKeys) {
		try {
			await db
				.update(tables.apiKey)
				.set({
					status: "inactive",
					disabledReason: "Expired",
				})
				.where(eq(tables.apiKey.id, key.id));

			logger.info("api-key-lifecycle: hard-disabled expired key", {
				keyId: key.id,
				expiresAt: key.expiresAt,
			});

			disabledCount++;
		} catch (err) {
			logger.error("api-key-lifecycle: failed to hard-disable expired key", {
				keyId: key.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return disabledCount;
}

// ─── Main entry point ─────────────────────────────────────────────────────

async function main(): Promise<void> {
	logger.info("api-key-lifecycle: starting daily run");

	const [rotated, disabled, warned, expired] = await Promise.all([
		runAutoRotation(),
		runInactivityDisable(),
		runExpiryWarnings(),
		runHardDisableExpired(),
	]);

	logger.info("api-key-lifecycle: completed", {
		autoRotated: rotated,
		inactivityDisabled: disabled,
		expiryWarnings: warned,
		hardDisabledExpired: expired,
	});
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		logger.error("api-key-lifecycle: fatal error", {
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	});
