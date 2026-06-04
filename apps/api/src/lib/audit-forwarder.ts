import { createHmac } from "node:crypto";
import * as dgram from "node:dgram";
import * as dns from "node:dns/promises";
import * as net from "node:net";

import { db, eq, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { decryptSecret, parseEncryptionKey } from "@llmgateway/shared";

export interface AuditEvent {
	organizationId: string;
	logType: "gateway" | "audit" | "access";
	payload: Record<string, unknown>;
	timestamp?: Date;
}

// In-memory event queue (capped at 100_000 to prevent unbounded growth)
const QUEUE_MAX = 100_000;
const eventQueue: AuditEvent[] = [];

const MAX_ATTEMPTS = 5;
const DRAIN_INTERVAL_MS = 2_000;
const RETRY_INTERVAL_MS = 10_000;

export function enqueueAuditEvent(event: AuditEvent): void {
	if (eventQueue.length >= QUEUE_MAX) {
		logger.warn("audit-forwarder: event queue full, dropping event", {
			organizationId: event.organizationId,
			logType: event.logType,
		});
		return;
	}
	eventQueue.push(event);
}

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

// SSRF protection: reject URLs resolving to private IPs
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

const BLOCKED_HOSTS = [
	"169.254.169.254", // AWS/GCP metadata
	"metadata.google.internal",
	"169.254.170.2", // ECS metadata
];

async function isSsrfUrl(urlString: string): Promise<boolean> {
	let parsed: URL;
	try {
		parsed = new URL(urlString);
	} catch {
		return true; // Malformed URL — reject
	}

	const host = parsed.hostname.toLowerCase();

	if (BLOCKED_HOSTS.includes(host)) {
		return true;
	}

	// Resolve hostname to IP and check against private ranges
	try {
		const addresses = await dns.lookup(host, { all: true });
		for (const addr of addresses) {
			const ip = addr.address;
			for (const range of PRIVATE_IP_RANGES) {
				if (range.test(ip)) {
					return true;
				}
			}
		}
	} catch {
		// DNS resolution failed — reject to be safe
		return true;
	}

	return false;
}

async function dispatchWebhook(
	forwarderId: string,
	webhookUrl: string,
	secretEncrypted: string | undefined,
	headers: Record<string, string> | undefined,
	payload: Record<string, unknown>,
): Promise<void> {
	if (await isSsrfUrl(webhookUrl)) {
		throw new Error(`SSRF protection: blocked URL ${webhookUrl}`);
	}

	const body = JSON.stringify(payload);
	const reqHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		...headers,
	};

	if (secretEncrypted) {
		const encKey = getEncryptionKey();
		if (encKey) {
			try {
				const secret = decryptSecret(secretEncrypted, encKey);
				const sig = createHmac("sha256", secret)
					.update(body, "utf8")
					.digest("hex");
				reqHeaders["X-Signature-256"] = `sha256=${sig}`;
			} catch {
				logger.warn("audit-forwarder: failed to decrypt webhook secret", {
					forwarderId,
				});
			}
		}
	}

	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: reqHeaders,
		body,
		signal: AbortSignal.timeout(10_000),
	});

	if (!res.ok) {
		throw new Error(`Webhook returned HTTP ${res.status}`);
	}
}

function formatRfc5424(payload: Record<string, unknown>): string {
	const now = new Date().toISOString();
	const msg = JSON.stringify(payload).replace(/[\r\n]/g, " ");
	// PRI = facility 1 (user-level) severity 6 (info) → 14
	return `<14>1 ${now} llmgateway audit - - - ${msg}`;
}

async function dispatchUdpSyslog(
	host: string,
	port: number,
	payload: Record<string, unknown>,
): Promise<void> {
	const msg = formatRfc5424(payload);
	const buf = Buffer.from(msg, "utf8");

	await new Promise<void>((resolve, reject) => {
		const sock = dgram.createSocket("udp4");
		sock.send(buf, port, host, (err) => {
			sock.close();
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

async function dispatchTcpSyslog(
	host: string,
	port: number,
	payload: Record<string, unknown>,
): Promise<void> {
	const msg = formatRfc5424(payload) + "\n";

	await new Promise<void>((resolve, reject) => {
		const sock = net.createConnection({ host, port }, () => {
			sock.write(msg, "utf8", (err) => {
				sock.destroy();
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
		sock.on("error", reject);
		sock.setTimeout(10_000, () => {
			sock.destroy();
			reject(new Error("TCP syslog connection timed out"));
		});
	});
}

async function dispatchToForwarder(
	forwarder: {
		id: string;
		forwarderType: string;
		config: {
			host?: string;
			port?: number;
			brokers?: string[];
			topic?: string;
			url?: string;
			secretEncrypted?: string;
			headers?: Record<string, string>;
		};
	},
	payload: Record<string, unknown>,
): Promise<void> {
	switch (forwarder.forwarderType) {
		case "webhook": {
			const { url, secretEncrypted, headers } = forwarder.config;
			if (!url) {
				throw new Error("Webhook forwarder missing url");
			}
			await dispatchWebhook(
				forwarder.id,
				url,
				secretEncrypted,
				headers,
				payload,
			);
			break;
		}
		case "udp_syslog": {
			const { host, port } = forwarder.config;
			if (!host || !port) {
				throw new Error("UDP syslog forwarder missing host/port");
			}
			await dispatchUdpSyslog(host, port, payload);
			break;
		}
		case "tcp_syslog": {
			const { host, port } = forwarder.config;
			if (!host || !port) {
				throw new Error("TCP syslog forwarder missing host/port");
			}
			await dispatchTcpSyslog(host, port, payload);
			break;
		}
		case "kafka": {
			// TODO: implement Kafka transport using a Kafka client library
			logger.warn("audit-forwarder: Kafka transport not yet implemented", {
				forwarderId: forwarder.id,
			});
			break;
		}
		default: {
			throw new Error(`Unknown forwarder type: ${forwarder.forwarderType}`);
		}
	}
}

async function drainQueue(): Promise<void> {
	if (eventQueue.length === 0) {
		return;
	}

	// Drain all currently queued events in a single batch
	const events = eventQueue.splice(0, eventQueue.length);

	// Load all enabled forwarders once per drain cycle
	const forwarders = await db.query.logForwarder.findMany({
		where: { enabled: { eq: true } },
	});

	if (forwarders.length === 0) {
		return;
	}

	for (const event of events) {
		const matching = forwarders.filter(
			(f) =>
				f.organizationId === event.organizationId &&
				Array.isArray(f.logTypes) &&
				(f.logTypes as string[]).includes(event.logType),
		);

		for (const forwarder of matching) {
			const payload = {
				...event.payload,
				logType: event.logType,
				timestamp: (event.timestamp ?? new Date()).toISOString(),
			};

			try {
				await dispatchToForwarder(forwarder, payload);

				await db
					.update(tables.logForwarder)
					.set({
						sentCount: forwarder.sentCount + 1,
						lastSentAt: new Date(),
					})
					.where(eq(tables.logForwarder.id, forwarder.id));
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				logger.warn("audit-forwarder: dispatch failed, queuing for retry", {
					forwarderId: forwarder.id,
					error: errMsg,
				});

				await db
					.update(tables.logForwarder)
					.set({
						errorCount: forwarder.errorCount + 1,
						lastError: errMsg,
					})
					.where(eq(tables.logForwarder.id, forwarder.id));

				// For webhook type only, persist to outbox for retry
				if (forwarder.forwarderType === "webhook") {
					await db.insert(tables.logForwarderOutbox).values({
						forwarderId: forwarder.id,
						payload,
						lastError: errMsg,
						attempts: 1,
						nextRetryAt: new Date(Date.now() + exponentialBackoffMs(1)),
					});
				}
			}
		}
	}
}

function exponentialBackoffMs(attempt: number): number {
	return Math.min(60_000 * Math.pow(2, attempt - 1), 3_600_000);
}

async function drainOutbox(): Promise<void> {
	const now = new Date();

	const items = await db.query.logForwarderOutbox.findMany({
		where: {
			attempts: { lt: MAX_ATTEMPTS },
			nextRetryAt: { lte: now },
		},
		limit: 100,
	});

	for (const item of items) {
		// Load forwarder separately since no drizzle relation is defined yet
		const forwarder = await db.query.logForwarder.findFirst({
			where: { id: { eq: item.forwarderId } },
		});

		if (!forwarder || !forwarder.enabled) {
			continue;
		}

		try {
			await dispatchToForwarder(
				forwarder,
				item.payload as Record<string, unknown>,
			);

			// Success — remove from outbox and update stats
			await db
				.delete(tables.logForwarderOutbox)
				.where(eq(tables.logForwarderOutbox.id, item.id));

			await db
				.update(tables.logForwarder)
				.set({
					sentCount: forwarder.sentCount + 1,
					lastSentAt: new Date(),
				})
				.where(eq(tables.logForwarder.id, forwarder.id));
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const nextAttempt = item.attempts + 1;

			if (nextAttempt >= MAX_ATTEMPTS) {
				logger.warn(
					"audit-forwarder: max retry attempts reached, dropping item",
					{
						outboxId: item.id,
						forwarderId: forwarder.id,
					},
				);
			}

			await db
				.update(tables.logForwarderOutbox)
				.set({
					attempts: nextAttempt,
					lastError: errMsg,
					nextRetryAt: new Date(Date.now() + exponentialBackoffMs(nextAttempt)),
				})
				.where(eq(tables.logForwarderOutbox.id, item.id));

			await db
				.update(tables.logForwarder)
				.set({
					errorCount: forwarder.errorCount + 1,
					lastError: errMsg,
				})
				.where(eq(tables.logForwarder.id, forwarder.id));
		}
	}
}

export async function startForwarderWorker(): Promise<void> {
	logger.info("audit-forwarder: worker started");

	// Primary drain loop — every 2 seconds
	const drainTimer = setInterval(async () => {
		try {
			await drainQueue();
		} catch (err) {
			logger.error("audit-forwarder: drain loop error", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}, DRAIN_INTERVAL_MS);

	// Retry/outbox loop — every 10 seconds
	const retryTimer = setInterval(async () => {
		try {
			await drainOutbox();
		} catch (err) {
			logger.error("audit-forwarder: outbox drain error", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}, RETRY_INTERVAL_MS);

	// Allow graceful shutdown in tests
	if (drainTimer.unref) {
		drainTimer.unref();
	}
	if (retryTimer.unref) {
		retryTimer.unref();
	}
}
