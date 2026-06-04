import { db, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export interface AuditEvent {
	organizationId: string;
	logType: "gateway" | "audit" | "access";
	payload: Record<string, unknown>;
	timestamp?: Date;
}

export async function enqueueAuditEvent(event: AuditEvent): Promise<number> {
	const forwarders = await db.query.logForwarder.findMany({
		where: {
			organizationId: {
				eq: event.organizationId,
			},
			enabled: {
				eq: true,
			},
		},
	});

	const matchingForwarders = forwarders.filter(
		(forwarder) =>
			Array.isArray(forwarder.logTypes) &&
			forwarder.logTypes.includes(event.logType),
	);

	if (matchingForwarders.length === 0) {
		return 0;
	}

	const payload = {
		...event.payload,
		organizationId: event.organizationId,
		logType: event.logType,
		timestamp: (event.timestamp ?? new Date()).toISOString(),
	};

	await db.insert(tables.logForwarderOutbox).values(
		matchingForwarders.map((forwarder) => ({
			forwarderId: forwarder.id,
			payload,
			attempts: 0,
			nextRetryAt: new Date(),
		})),
	);

	logger.info("log-forwarder: enqueued event for delivery", {
		organizationId: event.organizationId,
		logType: event.logType,
		forwarderCount: matchingForwarders.length,
	});

	return matchingForwarders.length;
}
