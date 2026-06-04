import { redisClient } from "@llmgateway/cache";
import { circuitBreakerState } from "@llmgateway/instrumentation";
import { logger } from "@llmgateway/logger";

export type CircuitState = "closed" | "open" | "half-open";

interface BreakerConfig {
	failureThreshold: number;
	successThreshold: number;
	recoveryMs: number;
	windowMs: number;
}

interface BreakerState {
	state: CircuitState;
	failures: number;
	successes: number;
	openedAt: number | null;
}

const DEFAULT_CONFIG: BreakerConfig = {
	failureThreshold: 5,
	successThreshold: 2,
	recoveryMs: 30_000,
	windowMs: 60_000,
};

function redisKey(key: string): string {
	return `cb:${key}`;
}

function parseState(raw: string | null): BreakerState {
	if (!raw) {
		return { state: "closed", failures: 0, successes: 0, openedAt: null };
	}
	try {
		return JSON.parse(raw) as BreakerState;
	} catch {
		return { state: "closed", failures: 0, successes: 0, openedAt: null };
	}
}

async function getState(key: string): Promise<BreakerState> {
	const raw = await redisClient.get(redisKey(key));
	return parseState(raw);
}

async function setState(key: string, state: BreakerState): Promise<void> {
	// TTL: keep breaker state alive for 2× recovery window so it auto-expires if unused
	const ttlSeconds = Math.ceil((DEFAULT_CONFIG.recoveryMs * 2) / 1000);
	await redisClient.set(redisKey(key), JSON.stringify(state), "EX", ttlSeconds);
}

export async function isBreakerOpen(
	key: string,
	config: Partial<BreakerConfig> = {},
): Promise<boolean> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const s = await getState(key);

	if (s.state === "closed") {
		return false;
	}

	if (s.state === "open") {
		const elapsed = Date.now() - (s.openedAt ?? 0);
		if (elapsed >= cfg.recoveryMs) {
			// Transition to half-open: allow one probe request
			const next: BreakerState = {
				...s,
				state: "half-open",
				successes: 0,
			};
			await setState(key, next);
			const [provider, model] = key.split(":");
			circuitBreakerState.labels(provider ?? key, model ?? "").set(2);
			return false;
		}
		return true;
	}

	// half-open: allow the probe through
	return false;
}

export async function recordBreakerSuccess(
	key: string,
	config: Partial<BreakerConfig> = {},
): Promise<void> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const s = await getState(key);

	if (s.state === "closed") {
		return;
	}

	const successes = s.successes + 1;
	if (successes >= cfg.successThreshold) {
		const next: BreakerState = {
			state: "closed",
			failures: 0,
			successes: 0,
			openedAt: null,
		};
		await setState(key, next);
		const [provider, model] = key.split(":");
		circuitBreakerState.labels(provider ?? key, model ?? "").set(0);
		logger.info("Circuit breaker closed", { key });
	} else {
		await setState(key, { ...s, successes });
	}
}

export async function recordBreakerFailure(
	key: string,
	config: Partial<BreakerConfig> = {},
): Promise<void> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const s = await getState(key);

	if (s.state === "half-open") {
		// Probe failed — reopen immediately
		const next: BreakerState = {
			state: "open",
			failures: s.failures + 1,
			successes: 0,
			openedAt: Date.now(),
		};
		await setState(key, next);
		const [provider, model] = key.split(":");
		circuitBreakerState.labels(provider ?? key, model ?? "").set(1);
		logger.warn("Circuit breaker reopened after failed probe", { key });
		return;
	}

	const failures = s.failures + 1;
	if (failures >= cfg.failureThreshold) {
		const next: BreakerState = {
			state: "open",
			failures,
			successes: 0,
			openedAt: Date.now(),
		};
		await setState(key, next);
		const [provider, model] = key.split(":");
		circuitBreakerState.labels(provider ?? key, model ?? "").set(1);
		logger.warn("Circuit breaker opened", { key, failures });
	} else {
		await setState(key, { ...s, failures });
	}
}

export async function resetBreaker(key: string): Promise<void> {
	const next: BreakerState = {
		state: "closed",
		failures: 0,
		successes: 0,
		openedAt: null,
	};
	await setState(key, next);
	const [provider, model] = key.split(":");
	circuitBreakerState.labels(provider ?? key, model ?? "").set(0);
	logger.info("Circuit breaker manually reset", { key });
}

export function buildBreakerKey(provider: string, model: string): string {
	return `${provider}:${model}`;
}
