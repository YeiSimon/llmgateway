import { createHmac } from "node:crypto";
import * as dgram from "node:dgram";
import * as dns from "node:dns/promises";
import * as net from "node:net";

import { getStopSignal, isStopRequested } from "@/shutdown.js";

import {
	and,
	db,
	eq,
	type InferSelectModel,
	lt,
	lte,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { decryptSecret, parseEncryptionKey } from "@llmgateway/shared";

const MAX_ATTEMPTS = Number(process.env.LOG_FORWARDER_MAX_ATTEMPTS) || 8;
const BATCH_SIZE = Number(process.env.LOG_FORWARDER_BATCH_SIZE) || 100;
const CLAIM_TIMEOUT_MS =
	Number(process.env.LOG_FORWARDER_CLAIM_TIMEOUT_SECONDS) * 1000 || 60_000;
const BASE_RETRY_DELAY_MS =
	Number(process.env.LOG_FORWARDER_BASE_RETRY_SECONDS) * 1000 || 30_000;
const MAX_RETRY_DELAY_MS =
	Number(process.env.LOG_FORWARDER_MAX_RETRY_SECONDS) * 1000 || 60 * 60 * 1000;
const DELIVERY_TIMEOUT_MS =
	Number(process.env.LOG_FORWARDER_DELIVERY_TIMEOUT_SECONDS) * 1000 || 10_000;

type LogForwarder = InferSelectModel<typeof tables.logForwarder>;
type LogForwarderOutboxItem = InferSelectModel<
	typeof tables.logForwarderOutbox
>;
type ForwarderPayload = Record<string, unknown>;

function getEncryptionKey(): Buffer | null {
	const raw = process.env.PROVIDER_KEY_ENCRYPTION_KEY;
	if (!raw) {
		return null;
	}
	try {
		return parseEncryptionKey(raw);
	} catch {
		return null;
	}
}

const PRIVATE_IP_RANGES = [
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^127\./,
	/^169\.254\./,
	/^::1$/,
	/^fc00:/i,
	/^fd[0-9a-f]{2}:/i,
];

const BLOCKED_WEBHOOK_HOSTS = new Set([
	"169.254.169.254",
	"metadata.google.internal",
	"169.254.170.2",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRetryDelayMs(attempt: number): number {
	return Math.min(
		BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(attempt - 1, 0)),
		MAX_RETRY_DELAY_MS,
	);
}

async function isBlockedWebhookUrl(urlString: string): Promise<boolean> {
	let parsed: URL;
	try {
		parsed = new URL(urlString);
	} catch {
		return true;
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return true;
	}

	const host = parsed.hostname.toLowerCase();
	if (BLOCKED_WEBHOOK_HOSTS.has(host)) {
		return true;
	}

	try {
		const addresses = await dns.lookup(host, { all: true });
		return addresses.some((address) =>
			PRIVATE_IP_RANGES.some((range) => range.test(address.address)),
		);
	} catch {
		return true;
	}
}

async function dispatchWebhook(
	forwarder: LogForwarder,
	payload: ForwarderPayload,
): Promise<void> {
	const { url, secretEncrypted, headers } = forwarder.config;
	if (!url) {
		throw new Error("Webhook forwarder missing url");
	}

	if (await isBlockedWebhookUrl(url)) {
		throw new Error(`Webhook URL is blocked by SSRF protection: ${url}`);
	}

	const body = JSON.stringify(payload);
	const requestHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "llmgateway-log-forwarder/1.0",
		...headers,
	};

	if (secretEncrypted) {
		const encryptionKey = getEncryptionKey();
		if (encryptionKey) {
			const secret = decryptSecret(secretEncrypted, encryptionKey);
			requestHeaders["X-Signature-256"] = `sha256=${createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex")}`;
		}
	}

	const response = await fetch(url, {
		method: "POST",
		headers: requestHeaders,
		body,
		signal: AbortSignal.any([
			getStopSignal(),
			AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		]),
	});

	if (!response.ok) {
		throw new Error(`Webhook returned HTTP ${response.status}`);
	}
}

function formatSyslog(payload: ForwarderPayload): string {
	const timestamp =
		typeof payload.timestamp === "string"
			? payload.timestamp
			: new Date().toISOString();
	const message = JSON.stringify(payload).replace(/[\r\n]/g, " ");
	return `<14>1 ${timestamp} llmgateway log-forwarder - - - ${message}`;
}

async function dispatchUdpSyslog(
	forwarder: LogForwarder,
	payload: ForwarderPayload,
): Promise<void> {
	const { host, port } = forwarder.config;
	if (!host || !port) {
		throw new Error("UDP syslog forwarder missing host/port");
	}

	const message = Buffer.from(formatSyslog(payload), "utf8");
	await new Promise<void>((resolve, reject) => {
		const socket = dgram.createSocket("udp4");
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error("UDP syslog delivery timed out"));
		}, DELIVERY_TIMEOUT_MS);

		socket.send(message, port, host, (error) => {
			clearTimeout(timer);
			socket.close();
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

async function dispatchTcpSyslog(
	forwarder: LogForwarder,
	payload: ForwarderPayload,
): Promise<void> {
	const { host, port } = forwarder.config;
	if (!host || !port) {
		throw new Error("TCP syslog forwarder missing host/port");
	}

	const message = `${formatSyslog(payload)}\n`;
	await new Promise<void>((resolve, reject) => {
		const socket = net.createConnection({ host, port });
		let settled = false;

		const settle = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};

		socket.setTimeout(DELIVERY_TIMEOUT_MS, () => {
			settle(new Error("TCP syslog delivery timed out"));
		});
		socket.on("error", settle);
		socket.on("connect", () => {
			socket.write(message, "utf8", (error) => {
				settle(error ?? undefined);
			});
		});
	});
}

async function dispatchKafka(forwarder: LogForwarder): Promise<void> {
	const { brokers, topic } = forwarder.config;
	if (!brokers?.length || !topic) {
		throw new Error("Kafka forwarder missing brokers/topic");
	}
	throw new Error(
		"Kafka forwarder delivery requires a Kafka client dependency that is not installed",
	);
}

async function dispatchToForwarder(
	forwarder: LogForwarder,
	payload: ForwarderPayload,
): Promise<void> {
	switch (forwarder.forwarderType) {
		case "webhook":
			await dispatchWebhook(forwarder, payload);
			return;
		case "udp_syslog":
			await dispatchUdpSyslog(forwarder, payload);
			return;
		case "tcp_syslog":
			await dispatchTcpSyslog(forwarder, payload);
			return;
		case "kafka":
			await dispatchKafka(forwarder);
	}
}

async function claimOutboxItem(
	item: LogForwarderOutboxItem,
	now: Date,
): Promise<LogForwarderOutboxItem | undefined> {
	const [claimed] = await db
		.update(tables.logForwarderOutbox)
		.set({
			nextRetryAt: new Date(Date.now() + CLAIM_TIMEOUT_MS),
		})
		.where(
			and(
				eq(tables.logForwarderOutbox.id, item.id),
				lte(tables.logForwarderOutbox.nextRetryAt, now),
				lt(tables.logForwarderOutbox.attempts, MAX_ATTEMPTS),
			),
		)
		.returning();

	return claimed;
}

async function markDeliverySuccess(
	item: LogForwarderOutboxItem,
	forwarder: LogForwarder,
): Promise<void> {
	await db
		.delete(tables.logForwarderOutbox)
		.where(eq(tables.logForwarderOutbox.id, item.id));

	await db
		.update(tables.logForwarder)
		.set({
			sentCount: sql`${tables.logForwarder.sentCount} + 1`,
			lastSentAt: new Date(),
			lastError: null,
		})
		.where(eq(tables.logForwarder.id, forwarder.id));
}

async function markDeliveryFailure(
	item: LogForwarderOutboxItem,
	forwarder: LogForwarder,
	errorMessage: string,
): Promise<void> {
	const nextAttempt = item.attempts + 1;
	const nextRetryAt = new Date(Date.now() + getRetryDelayMs(nextAttempt));

	await db
		.update(tables.logForwarderOutbox)
		.set({
			attempts: nextAttempt,
			lastError: errorMessage,
			nextRetryAt,
		})
		.where(eq(tables.logForwarderOutbox.id, item.id));

	await db
		.update(tables.logForwarder)
		.set({
			errorCount: sql`${tables.logForwarder.errorCount} + 1`,
			lastError: errorMessage,
		})
		.where(eq(tables.logForwarder.id, forwarder.id));

	if (nextAttempt >= MAX_ATTEMPTS) {
		logger.warn("log-forwarder: delivery exhausted retries", {
			outboxId: item.id,
			forwarderId: forwarder.id,
			attempts: nextAttempt,
			error: errorMessage,
		});
	}
}

async function processOutboxItem(item: LogForwarderOutboxItem): Promise<void> {
	const forwarder = await db.query.logForwarder.findFirst({
		where: {
			id: {
				eq: item.forwarderId,
			},
		},
	});

	if (!forwarder) {
		await db
			.delete(tables.logForwarderOutbox)
			.where(eq(tables.logForwarderOutbox.id, item.id));
		return;
	}

	if (!forwarder.enabled) {
		await db
			.update(tables.logForwarderOutbox)
			.set({
				nextRetryAt: new Date(Date.now() + getRetryDelayMs(item.attempts + 1)),
			})
			.where(eq(tables.logForwarderOutbox.id, item.id));
		return;
	}

	if (!isRecord(item.payload)) {
		await markDeliveryFailure(
			item,
			forwarder,
			"Outbox payload must be an object",
		);
		return;
	}

	try {
		await dispatchToForwarder(forwarder, item.payload);
		await markDeliverySuccess(item, forwarder);
	} catch (error) {
		if (
			isStopRequested() &&
			error instanceof Error &&
			error.name === "AbortError"
		) {
			return;
		}

		await markDeliveryFailure(
			item,
			forwarder,
			error instanceof Error ? error.message : String(error),
		);
	}
}

export async function processPendingLogForwarderDeliveries(): Promise<number> {
	const now = new Date();
	const dueItems = await db.query.logForwarderOutbox.findMany({
		where: {
			attempts: {
				lt: MAX_ATTEMPTS,
			},
			nextRetryAt: {
				lte: now,
			},
		},
		orderBy: (table, { asc }) => [asc(table.nextRetryAt), asc(table.createdAt)],
		limit: BATCH_SIZE,
	});

	let processedCount = 0;
	for (const item of dueItems) {
		if (isStopRequested()) {
			break;
		}

		const claimed = await claimOutboxItem(item, now);
		if (!claimed) {
			continue;
		}

		await processOutboxItem(claimed);
		processedCount++;
	}

	return processedCount;
}
