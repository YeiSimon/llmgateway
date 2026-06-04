// Register with: app.route('/api/organizations/:orgId/log-forwarders', logForwardersRoute)

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { enqueueAuditEvent } from "@/lib/audit-forwarder.js";

import { db, eq, tables, and } from "@llmgateway/db";
import { encryptSecret, parseEncryptionKey } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const logForwardersRoute = new OpenAPIHono<ServerTypes>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertAdminAccess(userId: string, orgId: string): Promise<void> {
	const userOrg = await db.query.userOrganization.findFirst({
		where: {
			userId: { eq: userId },
			organizationId: { eq: orgId },
		},
		with: {
			organization: true,
		},
	});

	if (!userOrg) {
		throw new HTTPException(403, {
			message: "You do not have access to this organization",
		});
	}

	if (userOrg.role !== "owner" && userOrg.role !== "admin") {
		throw new HTTPException(403, {
			message: "Only owners and admins can manage log forwarders",
		});
	}
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

function maybeEncrypt(value: string): string {
	const key = getEncryptionKey();
	if (!key) {
		return value;
	}
	return encryptSecret(value, key);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const logTypeEnum = z.enum(["gateway", "audit", "access"]);

const forwarderConfigSchema = z.object({
	host: z.string().optional(),
	port: z.number().int().optional(),
	brokers: z.array(z.string()).optional(),
	topic: z.string().optional(),
	saslUsername: z.string().optional(),
	saslPassword: z.string().optional(), // cleartext on input; stored encrypted
	url: z.string().url().optional(),
	secret: z.string().optional(), // cleartext on input; stored encrypted as secretEncrypted
	headers: z.record(z.string()).optional(),
});

const createForwarderSchema = z.object({
	name: z.string().min(1).max(255),
	enabled: z.boolean().optional().default(true),
	forwarderType: z.enum(["udp_syslog", "tcp_syslog", "kafka", "webhook"]),
	logTypes: z.array(logTypeEnum).min(1),
	config: forwarderConfigSchema,
});

const updateForwarderSchema = createForwarderSchema.partial();

const forwarderResponseSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	name: z.string(),
	enabled: z.boolean(),
	forwarderType: z.enum(["udp_syslog", "tcp_syslog", "kafka", "webhook"]),
	logTypes: z.array(logTypeEnum),
	sentCount: z.number(),
	errorCount: z.number(),
	lastSentAt: z.date().nullable(),
	lastError: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const outboxItemSchema = z.object({
	id: z.string(),
	forwarderId: z.string(),
	payload: z.unknown(),
	lastError: z.string().nullable(),
	attempts: z.number(),
	nextRetryAt: z.date(),
	createdAt: z.date(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET / — list forwarders for org
const list = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ forwarders: z.array(forwarderResponseSchema) }),
				},
			},
			description: "List of log forwarders for the organization.",
		},
	},
});

logForwardersRoute.openapi(list, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.param() as { orgId: string };
	await assertAdminAccess(user.id, orgId);

	const forwarders = await db.query.logForwarder.findMany({
		where: { organizationId: { eq: orgId } },
	});

	return c.json({
		forwarders: forwarders.map((f) => ({
			...f,
			logTypes: f.logTypes as Array<"gateway" | "audit" | "access">,
		})),
	});
});

// POST / — create forwarder
const create = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: {
				"application/json": { schema: createForwarderSchema },
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": {
					schema: z.object({ forwarder: forwarderResponseSchema }),
				},
			},
			description: "Log forwarder created successfully.",
		},
	},
});

logForwardersRoute.openapi(create, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.param() as { orgId: string };
	await assertAdminAccess(user.id, orgId);

	const body = c.req.valid("json");
	const { config, ...rest } = body;

	// Encrypt secrets before storing
	const storedConfig: (typeof tables.logForwarder.$inferInsert)["config"] = {
		host: config.host,
		port: config.port,
		brokers: config.brokers,
		topic: config.topic,
		saslUsername: config.saslUsername,
		url: config.url,
		headers: config.headers,
	};

	if (config.saslPassword) {
		storedConfig.saslPasswordEncrypted = maybeEncrypt(config.saslPassword);
	}
	if (config.secret) {
		storedConfig.secretEncrypted = maybeEncrypt(config.secret);
	}

	const [forwarder] = await db
		.insert(tables.logForwarder)
		.values({
			organizationId: orgId,
			name: rest.name,
			enabled: rest.enabled ?? true,
			forwarderType: rest.forwarderType,
			logTypes: rest.logTypes,
			config: storedConfig,
		})
		.returning();

	return c.json(
		{
			forwarder: {
				...forwarder,
				logTypes: forwarder.logTypes as Array<"gateway" | "audit" | "access">,
			},
		},
		201,
	);
});

// PATCH /:id — update forwarder
const update = createRoute({
	method: "patch",
	path: "/:id",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": { schema: updateForwarderSchema },
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ forwarder: forwarderResponseSchema }),
				},
			},
			description: "Log forwarder updated successfully.",
		},
	},
});

logForwardersRoute.openapi(update, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId, id } = c.req.param() as { orgId: string; id: string };
	await assertAdminAccess(user.id, orgId);

	const existing = await db.query.logForwarder.findFirst({
		where: {
			id: { eq: id },
			organizationId: { eq: orgId },
		},
	});

	if (!existing) {
		throw new HTTPException(404, { message: "Log forwarder not found" });
	}

	const body = c.req.valid("json");
	const { config, ...fields } = body;

	let newConfig = existing.config;
	if (config !== undefined) {
		newConfig = {
			...existing.config,
			host: config.host ?? existing.config.host,
			port: config.port ?? existing.config.port,
			brokers: config.brokers ?? existing.config.brokers,
			topic: config.topic ?? existing.config.topic,
			saslUsername: config.saslUsername ?? existing.config.saslUsername,
			url: config.url ?? existing.config.url,
			headers: config.headers ?? existing.config.headers,
		};
		if (config.saslPassword) {
			newConfig.saslPasswordEncrypted = maybeEncrypt(config.saslPassword);
		}
		if (config.secret) {
			newConfig.secretEncrypted = maybeEncrypt(config.secret);
		}
	}

	const [updated] = await db
		.update(tables.logForwarder)
		.set({
			...(fields.name !== undefined && { name: fields.name }),
			...(fields.enabled !== undefined && { enabled: fields.enabled }),
			...(fields.forwarderType !== undefined && {
				forwarderType: fields.forwarderType,
			}),
			...(fields.logTypes !== undefined && { logTypes: fields.logTypes }),
			config: newConfig,
		})
		.where(
			and(
				eq(tables.logForwarder.id, id),
				eq(tables.logForwarder.organizationId, orgId),
			),
		)
		.returning();

	return c.json({
		forwarder: {
			...updated,
			logTypes: updated.logTypes as Array<"gateway" | "audit" | "access">,
		},
	});
});

// DELETE /:id — delete forwarder
const deleteForwarder = createRoute({
	method: "delete",
	path: "/:id",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ message: z.string() }) },
			},
			description: "Log forwarder deleted successfully.",
		},
	},
});

logForwardersRoute.openapi(deleteForwarder, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId, id } = c.req.param() as { orgId: string; id: string };
	await assertAdminAccess(user.id, orgId);

	const result = await db
		.delete(tables.logForwarder)
		.where(
			and(
				eq(tables.logForwarder.id, id),
				eq(tables.logForwarder.organizationId, orgId),
			),
		)
		.returning();

	if (!result.length) {
		throw new HTTPException(404, { message: "Log forwarder not found" });
	}

	return c.json({ message: "Log forwarder deleted successfully" });
});

// POST /:id/test — send a test event through the forwarder
const testForwarder = createRoute({
	method: "post",
	path: "/:id/test",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ message: z.string() }) },
			},
			description: "Test event dispatched.",
		},
	},
});

logForwardersRoute.openapi(testForwarder, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId, id } = c.req.param() as { orgId: string; id: string };
	await assertAdminAccess(user.id, orgId);

	const forwarder = await db.query.logForwarder.findFirst({
		where: {
			id: { eq: id },
			organizationId: { eq: orgId },
		},
	});

	if (!forwarder) {
		throw new HTTPException(404, { message: "Log forwarder not found" });
	}

	const logTypes = forwarder.logTypes as Array<"gateway" | "audit" | "access">;
	const logType = logTypes[0] ?? "audit";

	enqueueAuditEvent({
		organizationId: orgId,
		logType,
		payload: {
			test: true,
			message: "LLM Gateway audit log forwarder test event",
			forwarderId: forwarder.id,
			forwarderName: forwarder.name,
		},
		timestamp: new Date(),
	});

	return c.json({ message: "Test event dispatched" });
});

// GET /:id/outbox — list dead-letter outbox items
const listOutbox = createRoute({
	method: "get",
	path: "/:id/outbox",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ items: z.array(outboxItemSchema) }),
				},
			},
			description: "Dead-letter outbox items for this forwarder.",
		},
	},
});

logForwardersRoute.openapi(listOutbox, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId, id } = c.req.param() as { orgId: string; id: string };
	await assertAdminAccess(user.id, orgId);

	// Verify the forwarder belongs to this org
	const forwarder = await db.query.logForwarder.findFirst({
		where: {
			id: { eq: id },
			organizationId: { eq: orgId },
		},
	});

	if (!forwarder) {
		throw new HTTPException(404, { message: "Log forwarder not found" });
	}

	const items = await db.query.logForwarderOutbox.findMany({
		where: { forwarderId: { eq: id } },
		orderBy: (t, { desc }) => [desc(t.createdAt)],
		limit: 100,
	});

	return c.json({ items });
});

export default logForwardersRoute;
