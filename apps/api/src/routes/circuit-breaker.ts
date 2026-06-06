import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Redis } from "ioredis";
import { z } from "zod";

import { getActiveUserOrganizationIds } from "@/utils/authorization.js";

import type { ServerTypes } from "@/vars.js";

export const circuitBreaker = new OpenAPIHono<ServerTypes>();

const valkey = new Redis({
	host: process.env.VALKEY_HOST ?? "localhost",
	port: Number(process.env.VALKEY_PORT) || 6379,
	password: process.env.VALKEY_PASSWORD,
});

const CLOSED_STATE = JSON.stringify({
	state: "closed",
	failures: 0,
	successes: 0,
	openedAt: null,
});

const resetRoute = createRoute({
	summary: "Reset a circuit breaker",
	description:
		"Force a circuit breaker back to closed state. Use when a provider has recovered but the breaker has not self-healed yet.",
	operationId: "resetCircuitBreaker",
	method: "post",
	path: "/{key}/reset",
	request: {
		params: z.object({
			key: z
				.string()
				.regex(/^[\w.-]+:[\w./-]+$/)
				.openapi({
					description:
						"Circuit breaker key: provider:model (e.g. openai:gpt-4o)",
					example: "openai:gpt-4o",
				}),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ ok: z.boolean(), key: z.string() }),
				},
			},
			description: "Circuit breaker reset successfully.",
		},
	},
});

circuitBreaker.openapi(resetRoute, async (c) => {
	const user = c.get("user");
	if (!user?.id) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const orgIds = await getActiveUserOrganizationIds(user.id);
	if (orgIds.length === 0) {
		throw new HTTPException(403, { message: "No active organization" });
	}

	const { key } = c.req.valid("param");
	await valkey.set(`cb:${key}`, CLOSED_STATE, "EX", 120);

	return c.json({ ok: true, key });
});
