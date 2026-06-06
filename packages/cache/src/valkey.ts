import { Redis } from "ioredis";

import { logger } from "@llmgateway/logger";

export const valkeyClient = new Redis({
	host: process.env.VALKEY_HOST ?? "localhost",
	port: Number(process.env.VALKEY_PORT) || 6379,
	password: process.env.VALKEY_PASSWORD,
});

valkeyClient.on("error", (err) => logger.error("Valkey Client Error", err));

export const LOG_QUEUE = "log_queue_" + process.env.NODE_ENV;

export async function publishToQueue(
	queue: string,
	message: unknown,
): Promise<void> {
	try {
		await valkeyClient.lpush(queue, JSON.stringify(message));
	} catch (error) {
		const msg = message as Record<string, unknown> | undefined;
		const item = msg
			? {
					requestId: msg.requestId,
					organizationId: msg.organizationId,
					projectId: msg.projectId,
					usedModel: msg.usedModel,
					usedProvider: msg.usedProvider,
				}
			: undefined;
		logger.error("Error publishing to queue", error, { queue, item });
		throw error;
	}
}

export async function consumeFromQueue(
	queue: string,
	count = 100,
): Promise<string[] | null> {
	try {
		const result = await valkeyClient.lpop(queue, count);

		if (!result) {
			return null;
		}

		return result;
	} catch (error) {
		logger.error("Error consuming from queue", error);
		throw error;
	}
}

export async function closeValkeyClient(): Promise<void> {
	try {
		await valkeyClient.disconnect();
		logger.info("Valkey client disconnected");
	} catch (error) {
		logger.error("Error disconnecting Valkey client", error);
		throw error;
	}
}
