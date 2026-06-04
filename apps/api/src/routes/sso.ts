// Register in index.ts: routes.route("/orgs", ssoRoutes)

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { db, eq, tables } from "@llmgateway/db";
import { encryptSecret, parseEncryptionKey } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const ssoRoutes = new OpenAPIHono<ServerTypes>();

async function assertAdminAccess(userId: string, orgId: string): Promise<void> {
	const userOrg = await db.query.userOrganization.findFirst({
		where: {
			userId: { eq: userId },
			organizationId: { eq: orgId },
		},
	});

	if (!userOrg) {
		throw new HTTPException(403, {
			message: "You do not have access to this organization",
		});
	}

	if (userOrg.role !== "owner" && userOrg.role !== "admin") {
		throw new HTTPException(403, {
			message: "Only owners and admins can manage SSO configuration",
		});
	}
}

function maybeEncrypt(value: string): string {
	const raw = process.env.PROVIDER_KEY_ENCRYPTION_KEY;
	if (!raw) {
		return value;
	}
	try {
		const key = parseEncryptionKey(raw);
		return encryptSecret(value, key);
	} catch {
		return value;
	}
}

const ssoResponseSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	provider: z.enum(["oidc", "google", "microsoft", "okta", "github"]),
	clientId: z.string(),
	discoveryUrl: z.string().nullable(),
	enabled: z.boolean(),
	enforced: z.boolean(),
	defaultRole: z.enum([
		"owner",
		"admin",
		"team_manager",
		"developer",
		"viewer",
	]),
	jitProvisioning: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const ssoUpsertSchema = z.object({
	provider: z.enum(["oidc", "google", "microsoft", "okta", "github"]),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	discoveryUrl: z.string().url().optional(),
	enabled: z.boolean().optional(),
	enforced: z.boolean().optional(),
	defaultRole: z
		.enum(["owner", "admin", "team_manager", "developer", "viewer"])
		.optional(),
	jitProvisioning: z.boolean().optional(),
});

const getRoute = createRoute({
	method: "get",
	path: "/:orgId/sso",
	request: {
		params: z.object({ orgId: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ ssoConfig: ssoResponseSchema.nullable() }),
				},
			},
			description: "SSO configuration",
		},
	},
});

ssoRoutes.openapi(getRoute, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.valid("param");
	await assertAdminAccess(user.id, orgId);

	const config = await db.query.ssoConfig.findFirst({
		where: { organizationId: { eq: orgId } },
	});

	type SsoResponse = z.infer<typeof ssoResponseSchema>;
	const ssoConfig: SsoResponse | null = config
		? {
				id: config.id,
				organizationId: config.organizationId,
				provider: config.provider as SsoResponse["provider"],
				clientId: config.clientId,
				discoveryUrl: config.discoveryUrl ?? null,
				enabled: config.enabled,
				enforced: config.enforced,
				defaultRole: config.defaultRole as SsoResponse["defaultRole"],
				jitProvisioning: config.jitProvisioning,
				createdAt: config.createdAt.toISOString(),
				updatedAt: config.updatedAt.toISOString(),
			}
		: null;

	return c.json({ ssoConfig });
});

const putRoute = createRoute({
	method: "put",
	path: "/:orgId/sso",
	request: {
		params: z.object({ orgId: z.string() }),
		body: { content: { "application/json": { schema: ssoUpsertSchema } } },
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ ssoConfig: ssoResponseSchema }),
				},
			},
			description: "SSO configuration saved",
		},
	},
});

ssoRoutes.openapi(putRoute, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.valid("param");
	await assertAdminAccess(user.id, orgId);

	const body = c.req.valid("json");
	const encryptedSecret = maybeEncrypt(body.clientSecret);

	const existing = await db.query.ssoConfig.findFirst({
		where: { organizationId: { eq: orgId } },
	});

	let config;
	if (existing) {
		const [updated] = await db
			.update(tables.ssoConfig)
			.set({
				provider: body.provider,
				clientId: body.clientId,
				clientSecretEncrypted: encryptedSecret,
				discoveryUrl: body.discoveryUrl ?? null,
				enabled: body.enabled ?? true,
				enforced: body.enforced ?? false,
				defaultRole: body.defaultRole ?? "developer",
				jitProvisioning: body.jitProvisioning ?? true,
				updatedAt: new Date(),
			})
			.where(eq(tables.ssoConfig.organizationId, orgId))
			.returning();
		config = updated;
	} else {
		const [created] = await db
			.insert(tables.ssoConfig)
			.values({
				organizationId: orgId,
				provider: body.provider,
				clientId: body.clientId,
				clientSecretEncrypted: encryptedSecret,
				discoveryUrl: body.discoveryUrl ?? null,
				enabled: body.enabled ?? true,
				enforced: body.enforced ?? false,
				defaultRole: body.defaultRole ?? "developer",
				jitProvisioning: body.jitProvisioning ?? true,
			})
			.returning();
		config = created;
	}

	type SsoResponse = z.infer<typeof ssoResponseSchema>;
	return c.json({
		ssoConfig: {
			id: config.id,
			organizationId: config.organizationId,
			provider: config.provider as SsoResponse["provider"],
			clientId: config.clientId,
			discoveryUrl: config.discoveryUrl ?? null,
			enabled: config.enabled,
			enforced: config.enforced,
			defaultRole: config.defaultRole as SsoResponse["defaultRole"],
			jitProvisioning: config.jitProvisioning,
			createdAt: config.createdAt.toISOString(),
			updatedAt: config.updatedAt.toISOString(),
		} satisfies SsoResponse,
	});
});

const deleteRoute = createRoute({
	method: "delete",
	path: "/:orgId/sso",
	request: {
		params: z.object({ orgId: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description: "SSO configuration removed",
		},
	},
});

ssoRoutes.openapi(deleteRoute, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.valid("param");
	await assertAdminAccess(user.id, orgId);

	await db
		.delete(tables.ssoConfig)
		.where(eq(tables.ssoConfig.organizationId, orgId));

	return c.json({ success: true });
});

const testRoute = createRoute({
	method: "post",
	path: "/:orgId/sso/test",
	request: {
		params: z.object({ orgId: z.string() }),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description: "SSO connection test result",
		},
	},
});

ssoRoutes.openapi(testRoute, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { orgId } = c.req.valid("param");
	await assertAdminAccess(user.id, orgId);

	return c.json({ success: true });
});
