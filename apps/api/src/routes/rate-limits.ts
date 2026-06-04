// Register with: routes.route("/rate-limits", rateLimitsRouter)

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { db, eq, tables } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const rateLimitsRouter = new OpenAPIHono<ServerTypes>();

async function assertMemberAccess(
	userId: string,
	organizationId: string,
): Promise<void> {
	const userOrg = await db.query.userOrganization.findFirst({
		where: {
			userId: { eq: userId },
			organizationId: { eq: organizationId },
		},
	});

	if (!userOrg) {
		throw new HTTPException(403, {
			message: "You do not have access to this organization",
		});
	}
}

const rateLimitSubjectKindEnum = z.enum([
	"user",
	"api_key",
	"organization",
	"provider",
	"model",
]);

const rateLimitRuleSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	organizationId: z.string().nullable(),
	subjectKind: rateLimitSubjectKindEnum,
	subjectId: z.string().nullable(),
	windowSeconds: z.number().int(),
	metric: z.enum(["requests", "tokens"]),
	limit: z.number().int(),
	provider: z.string().nullable(),
	model: z.string().nullable(),
	enabled: z.boolean(),
	reason: z.string().nullable(),
});

const createRuleBodySchema = z.object({
	organizationId: z.string(),
	subjectKind: rateLimitSubjectKindEnum,
	subjectId: z.string().optional(),
	windowSeconds: z.number().int(),
	metric: z.enum(["requests", "tokens"]).optional(),
	limit: z.number().int(),
	provider: z.string().optional(),
	model: z.string().optional(),
	enabled: z.boolean().optional(),
	reason: z.string().optional(),
});

const updateRuleBodySchema = z.object({
	subjectKind: rateLimitSubjectKindEnum.optional(),
	subjectId: z.string().nullable().optional(),
	windowSeconds: z.number().int().optional(),
	metric: z.enum(["requests", "tokens"]).optional(),
	limit: z.number().int().optional(),
	provider: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	enabled: z.boolean().optional(),
	reason: z.string().nullable().optional(),
});

const budgetCapSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	organizationId: z.string().nullable(),
	subjectKind: rateLimitSubjectKindEnum,
	subjectId: z.string().nullable(),
	period: z.enum(["daily", "weekly", "monthly"]),
	limit: z.string(),
	enabled: z.boolean(),
	reason: z.string().nullable(),
});

const createBudgetCapBodySchema = z.object({
	organizationId: z.string(),
	subjectKind: rateLimitSubjectKindEnum,
	subjectId: z.string().optional(),
	period: z.enum(["daily", "weekly", "monthly"]),
	limit: z.string(),
	enabled: z.boolean().optional(),
	reason: z.string().optional(),
});

const updateBudgetCapBodySchema = z.object({
	subjectKind: rateLimitSubjectKindEnum.optional(),
	subjectId: z.string().nullable().optional(),
	period: z.enum(["daily", "weekly", "monthly"]).optional(),
	limit: z.string().optional(),
	enabled: z.boolean().optional(),
	reason: z.string().nullable().optional(),
});

// GET / — list rate limit rules for org
const listRules = createRoute({
	method: "get",
	path: "/",
	request: {
		query: z.object({
			organizationId: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ rules: z.array(rateLimitRuleSchema) }),
				},
			},
			description: "List of rate limit rules for the organization.",
		},
	},
});

rateLimitsRouter.openapi(listRules, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("query");
	await assertMemberAccess(user.id, organizationId);

	const rules = await db.query.rateLimitRule.findMany({
		where: { organizationId: { eq: organizationId } },
	});

	return c.json({
		rules: rules.map((r) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		})),
	});
});

// POST / — create a rate limit rule
const createRule = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: {
				"application/json": { schema: createRuleBodySchema },
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": { schema: rateLimitRuleSchema },
			},
			description: "Rate limit rule created.",
		},
	},
});

rateLimitsRouter.openapi(createRule, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const body = c.req.valid("json");
	await assertMemberAccess(user.id, body.organizationId);

	const [created] = await db
		.insert(tables.rateLimitRule)
		.values({
			organizationId: body.organizationId,
			subjectKind: body.subjectKind,
			subjectId: body.subjectId ?? null,
			windowSeconds: body.windowSeconds,
			metric: body.metric ?? "requests",
			limit: body.limit,
			provider: body.provider ?? null,
			model: body.model ?? null,
			enabled: body.enabled ?? true,
			reason: body.reason ?? null,
		})
		.returning();

	return c.json(
		{
			...created,
			createdAt: created.createdAt.toISOString(),
			updatedAt: created.updatedAt.toISOString(),
		},
		201,
	);
});

// PATCH /:id — update a rate limit rule
const updateRule = createRoute({
	method: "patch",
	path: "/:id",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": { schema: updateRuleBodySchema },
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: rateLimitRuleSchema },
			},
			description: "Rate limit rule updated.",
		},
	},
});

rateLimitsRouter.openapi(updateRule, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { id } = c.req.param();
	const body = c.req.valid("json");

	const existing = await db.query.rateLimitRule.findFirst({
		where: { id: { eq: id } },
	});

	if (!existing) {
		throw new HTTPException(404, { message: "Rule not found" });
	}

	if (existing.organizationId) {
		await assertMemberAccess(user.id, existing.organizationId);
	}

	const [updated] = await db
		.update(tables.rateLimitRule)
		.set({
			subjectKind: body.subjectKind ?? existing.subjectKind,
			subjectId:
				body.subjectId !== undefined ? body.subjectId : existing.subjectId,
			windowSeconds: body.windowSeconds ?? existing.windowSeconds,
			metric: body.metric ?? existing.metric,
			limit: body.limit ?? existing.limit,
			provider: body.provider !== undefined ? body.provider : existing.provider,
			model: body.model !== undefined ? body.model : existing.model,
			enabled: body.enabled ?? existing.enabled,
			reason: body.reason !== undefined ? body.reason : existing.reason,
		})
		.where(eq(tables.rateLimitRule.id, id))
		.returning();

	return c.json({
		...updated,
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt.toISOString(),
	});
});

// DELETE /:id — delete a rate limit rule
const deleteRule = createRoute({
	method: "delete",
	path: "/:id",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description: "Rate limit rule deleted.",
		},
	},
});

rateLimitsRouter.openapi(deleteRule, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { id } = c.req.param();

	const existing = await db.query.rateLimitRule.findFirst({
		where: { id: { eq: id } },
	});

	if (!existing) {
		throw new HTTPException(404, { message: "Rule not found" });
	}

	if (existing.organizationId) {
		await assertMemberAccess(user.id, existing.organizationId);
	}

	await db.delete(tables.rateLimitRule).where(eq(tables.rateLimitRule.id, id));

	return c.json({ success: true });
});

// GET /budget-caps — list budget caps for org
const listBudgetCaps = createRoute({
	method: "get",
	path: "/budget-caps",
	request: {
		query: z.object({
			organizationId: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ caps: z.array(budgetCapSchema) }),
				},
			},
			description: "List of budget caps for the organization.",
		},
	},
});

rateLimitsRouter.openapi(listBudgetCaps, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("query");
	await assertMemberAccess(user.id, organizationId);

	const caps = await db.query.budgetCap.findMany({
		where: { organizationId: { eq: organizationId } },
	});

	return c.json({
		caps: caps.map((cap) => ({
			...cap,
			limit: String(cap.limit),
			createdAt: cap.createdAt.toISOString(),
			updatedAt: cap.updatedAt.toISOString(),
		})),
	});
});

// POST /budget-caps — create a budget cap
const createBudgetCap = createRoute({
	method: "post",
	path: "/budget-caps",
	request: {
		body: {
			content: {
				"application/json": { schema: createBudgetCapBodySchema },
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": { schema: budgetCapSchema },
			},
			description: "Budget cap created.",
		},
	},
});

rateLimitsRouter.openapi(createBudgetCap, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const body = c.req.valid("json");
	await assertMemberAccess(user.id, body.organizationId);

	const [created] = await db
		.insert(tables.budgetCap)
		.values({
			organizationId: body.organizationId,
			subjectKind: body.subjectKind,
			subjectId: body.subjectId ?? null,
			period: body.period,
			limit: body.limit,
			enabled: body.enabled ?? true,
			reason: body.reason ?? null,
		})
		.returning();

	return c.json(
		{
			...created,
			limit: String(created.limit),
			createdAt: created.createdAt.toISOString(),
			updatedAt: created.updatedAt.toISOString(),
		},
		201,
	);
});

// PATCH /budget-caps/:id — update a budget cap
const updateBudgetCap = createRoute({
	method: "patch",
	path: "/budget-caps/:id",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": { schema: updateBudgetCapBodySchema },
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: budgetCapSchema },
			},
			description: "Budget cap updated.",
		},
	},
});

rateLimitsRouter.openapi(updateBudgetCap, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { id } = c.req.param();
	const body = c.req.valid("json");

	const existing = await db.query.budgetCap.findFirst({
		where: { id: { eq: id } },
	});

	if (!existing) {
		throw new HTTPException(404, { message: "Budget cap not found" });
	}

	if (existing.organizationId) {
		await assertMemberAccess(user.id, existing.organizationId);
	}

	const [updated] = await db
		.update(tables.budgetCap)
		.set({
			subjectKind: body.subjectKind ?? existing.subjectKind,
			subjectId:
				body.subjectId !== undefined ? body.subjectId : existing.subjectId,
			period: body.period ?? existing.period,
			limit: body.limit ?? String(existing.limit),
			enabled: body.enabled ?? existing.enabled,
			reason: body.reason !== undefined ? body.reason : existing.reason,
		})
		.where(eq(tables.budgetCap.id, id))
		.returning();

	return c.json({
		...updated,
		limit: String(updated.limit),
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt.toISOString(),
	});
});

// DELETE /budget-caps/:id — delete a budget cap
const deleteBudgetCap = createRoute({
	method: "delete",
	path: "/budget-caps/:id",
	request: {
		params: z.object({ id: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description: "Budget cap deleted.",
		},
	},
});

rateLimitsRouter.openapi(deleteBudgetCap, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { id } = c.req.param();

	const existing = await db.query.budgetCap.findFirst({
		where: { id: { eq: id } },
	});

	if (!existing) {
		throw new HTTPException(404, { message: "Budget cap not found" });
	}

	if (existing.organizationId) {
		await assertMemberAccess(user.id, existing.organizationId);
	}

	await db.delete(tables.budgetCap).where(eq(tables.budgetCap.id, id));

	return c.json({ success: true });
});
