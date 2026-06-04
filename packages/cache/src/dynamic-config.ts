import { Redis } from "ioredis";

import { logger } from "@llmgateway/logger";

export class DynamicConfig {
	private cache: Map<string, unknown> = new Map();
	private subscriber: Redis;

	constructor(redisUrlOrClient?: string | Redis) {
		if (redisUrlOrClient instanceof Redis) {
			this.subscriber = redisUrlOrClient;
		} else if (typeof redisUrlOrClient === "string") {
			this.subscriber = new Redis(redisUrlOrClient);
		} else {
			this.subscriber = new Redis({
				host: process.env.REDIS_HOST ?? "localhost",
				port: Number(process.env.REDIS_PORT) || 6379,
				password: process.env.REDIS_PASSWORD,
			});
		}

		this.subscriber.on("error", (err) =>
			logger.error("DynamicConfig subscriber error", err),
		);
	}

	async subscribe(): Promise<void> {
		await this.subscriber.subscribe("config:updates");

		this.subscriber.on("message", (_channel: string, message: string) => {
			try {
				const { key, value } = JSON.parse(message) as {
					key: string;
					value: unknown;
				};
				this.cache.set(key, value);
				this.onUpdate(key, value);
			} catch (err) {
				logger.error("DynamicConfig: failed to parse message", err as Error);
			}
		});
	}

	onUpdate(_key: string, _value: unknown): void {
		// no-op by default; override to react to updates
	}

	static async publish(
		redis: Redis,
		key: string,
		value: unknown,
	): Promise<void> {
		await redis.publish("config:updates", JSON.stringify({ key, value }));
	}

	get<T>(key: string, defaultValue: T): T {
		const cached = this.cache.get(key);
		if (cached === undefined) {
			return defaultValue;
		}
		return cached as T;
	}
}
