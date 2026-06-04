import { createClient } from "@clickhouse/client";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { userHasOrganizationAccess } from "@/utils/authorization.js";

import {
	and,
	db,
	gte,
	inArray,
	lte,
	projectHourlyModelStats,
	sql,
	tables,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const analytics = new OpenAPIHono<ServerTypes>();

const costBreakdownQuerySchema = z.object({
	organizationId: z.string().openapi({
		description: "Organization ID to query cost data for",
	}),
	from: z.string().openapi({
		description: "Start date (ISO 8601, e.g. 2026-05-01)",
		example: "2026-05-01",
	}),
	to: z.string().openapi({
		description: "End date (ISO 8601, e.g. 2026-06-01)",
		example: "2026-06-01",
	}),
	groupBy: z
		.enum(["model", "provider", "project", "source"])
		.optional()
		.openapi({
			description: "Dimension to group results by",
			example: "model",
		}),
	resolution: z.enum(["hourly", "daily"]).optional().openapi({
		description: "Time resolution for aggregation",
		example: "hourly",
	}),
});

const costBreakdownItemSchema = z.object({
	bucket: z.string().openapi({ description: "Time bucket (ISO string)" }),
	groupValue: z
		.string()
		.nullable()
		.openapi({ description: "Value of the groupBy dimension" }),
	requestCount: z.number().openapi({ description: "Number of requests" }),
	errorCount: z.number().openapi({ description: "Number of errors" }),
	cacheCount: z.number().openapi({ description: "Number of cached responses" }),
	inputTokens: z.number().openapi({ description: "Total input tokens" }),
	outputTokens: z.number().openapi({ description: "Total output tokens" }),
	cachedTokens: z.number().openapi({ description: "Total cached tokens" }),
	costUsd: z
		.number()
		.openapi({ description: "Total cost in USD (summed from cost_usd)" }),
});

const getCostBreakdown = createRoute({
	method: "get",
	path: "/cost-breakdown",
	request: {
		query: costBreakdownQuerySchema,
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						data: z.array(costBreakdownItemSchema),
						source: z.enum(["clickhouse", "postgres"]),
					}),
				},
			},
			description:
				"Cost breakdown data, grouped by the requested dimension and time resolution",
		},
		401: { description: "Unauthorized" },
		403: { description: "Forbidden" },
	},
});

analytics.openapi(getCostBreakdown, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const {
		organizationId,
		from,
		to,
		groupBy = "model",
		resolution = "hourly",
	} = c.req.valid("query");

	const hasAccess = await userHasOrganizationAccess(user.id, organizationId);
	if (!hasAccess) {
		throw new HTTPException(403, {
			message: "You don't have access to this organization",
		});
	}

	const fromDate = new Date(from);
	const toDate = new Date(to);

	if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
		throw new HTTPException(400, {
			message: "Invalid date format. Use ISO 8601 (e.g. 2026-05-01)",
		});
	}

	// Use ClickHouse when available
	if (process.env.CLICKHOUSE_URL) {
		return c.json({
			data: await queryCostBreakdownClickHouse(
				organizationId,
				fromDate,
				toDate,
				groupBy,
				resolution,
			),
			source: "clickhouse" as const,
		});
	}

	// Fallback to PostgreSQL using projectHourlyModelStats
	return c.json({
		data: await queryCostBreakdownPostgres(
			organizationId,
			fromDate,
			toDate,
			groupBy,
			resolution,
		),
		source: "postgres" as const,
	});
});

async function queryCostBreakdownClickHouse(
	organizationId: string,
	from: Date,
	to: Date,
	groupBy: "model" | "provider" | "project" | "source",
	resolution: "hourly" | "daily",
): Promise<z.infer<typeof costBreakdownItemSchema>[]> {
	const client = createClient({
		url: process.env.CLICKHOUSE_URL,
		database: "llmgateway",
	});

	const groupCol = {
		model: "used_model",
		provider: "used_provider",
		project: "project_id",
		source: "source",
	}[groupBy];

	const bucketExpr =
		resolution === "hourly" ? "toStartOfHour(hour)" : "toStartOfDay(hour)";

	const fromStr = from
		.toISOString()
		.replace("T", " ")
		.replace(/\..+Z$/, "");
	const toStr = to
		.toISOString()
		.replace("T", " ")
		.replace(/\..+Z$/, "");

	const query = `
		SELECT
			toString(${bucketExpr}) AS bucket,
			${groupCol} AS group_value,
			SUM(request_count) AS request_count,
			SUM(error_count) AS error_count,
			SUM(cache_count) AS cache_count,
			SUM(input_tokens) AS input_tokens,
			SUM(output_tokens) AS output_tokens,
			SUM(cached_tokens) AS cached_tokens,
			SUM(cost_usd) AS cost_usd
		FROM cost_rollup_hourly
		WHERE
			organization_id = {organizationId: String}
			AND hour >= {from: DateTime}
			AND hour < {to: DateTime}
		GROUP BY bucket, group_value
		ORDER BY bucket ASC, cost_usd DESC
	`;

	const result = await client.query({
		query,
		query_params: {
			organizationId,
			from: fromStr,
			to: toStr,
		},
		format: "JSONEachRow",
	});

	const rows = (await result.json()) as Array<{
		bucket: string;
		group_value: string | null;
		request_count: number;
		error_count: number;
		cache_count: number;
		input_tokens: number;
		output_tokens: number;
		cached_tokens: number;
		cost_usd: number;
	}>;

	await client.close();

	return rows.map((row) => ({
		bucket: row.bucket,
		groupValue: row.group_value ?? null,
		requestCount: Number(row.request_count),
		errorCount: Number(row.error_count),
		cacheCount: Number(row.cache_count),
		inputTokens: Number(row.input_tokens),
		outputTokens: Number(row.output_tokens),
		cachedTokens: Number(row.cached_tokens),
		costUsd: Number(row.cost_usd),
	}));
}

async function queryCostBreakdownPostgres(
	organizationId: string,
	from: Date,
	to: Date,
	groupBy: "model" | "provider" | "project" | "source",
	resolution: "hourly" | "daily",
): Promise<z.infer<typeof costBreakdownItemSchema>[]> {
	// Resolve all projects belonging to this organization
	const projects = await db.query.project.findMany({
		where: {
			organizationId: { eq: organizationId },
			status: { ne: "deleted" },
		},
		columns: { id: true },
	});

	if (projects.length === 0) {
		return [];
	}

	const projectIds = projects.map((p) => p.id);

	const isHourly = resolution === "hourly";

	const groupColMap = {
		model: projectHourlyModelStats.usedModel,
		provider: projectHourlyModelStats.usedProvider,
		// project and source are not available in projectHourlyModelStats;
		// fall back to projectId as best effort for "project" grouping.
		project: projectHourlyModelStats.projectId,
		source: projectHourlyModelStats.usedModel, // no source column; use model as fallback
	} as const;

	const groupCol = groupColMap[groupBy];

	const bucketExpr = isHourly
		? sql<string>`to_char(${projectHourlyModelStats.hourTimestamp}, 'YYYY-MM-DD"T"HH24:MI:SS')`.as(
				"bucket",
			)
		: sql<string>`DATE(${projectHourlyModelStats.hourTimestamp})::text`.as(
				"bucket",
			);

	const rows = await db
		.select({
			bucket: bucketExpr,
			groupValue: groupCol,
			requestCount:
				sql<number>`COALESCE(SUM(${projectHourlyModelStats.requestCount}), 0)`.as(
					"requestCount",
				),
			errorCount:
				sql<number>`COALESCE(SUM(${projectHourlyModelStats.errorCount}), 0)`.as(
					"errorCount",
				),
			cacheCount:
				sql<number>`COALESCE(SUM(${projectHourlyModelStats.cacheCount}), 0)`.as(
					"cacheCount",
				),
			inputTokens:
				sql<number>`COALESCE(SUM(CAST(${projectHourlyModelStats.inputTokens} AS NUMERIC)), 0)`.as(
					"inputTokens",
				),
			outputTokens:
				sql<number>`COALESCE(SUM(CAST(${projectHourlyModelStats.outputTokens} AS NUMERIC)), 0)`.as(
					"outputTokens",
				),
			cachedTokens:
				sql<number>`COALESCE(SUM(CAST(${projectHourlyModelStats.cachedTokens} AS NUMERIC)), 0)`.as(
					"cachedTokens",
				),
			costUsd:
				sql<number>`COALESCE(SUM(${projectHourlyModelStats.cost}), 0)`.as(
					"costUsd",
				),
		})
		.from(projectHourlyModelStats)
		.where(
			and(
				inArray(projectHourlyModelStats.projectId, projectIds),
				gte(projectHourlyModelStats.hourTimestamp, from),
				lte(projectHourlyModelStats.hourTimestamp, to),
			),
		)
		.groupBy(
			isHourly
				? sql`${projectHourlyModelStats.hourTimestamp}, ${groupCol}`
				: sql`DATE(${projectHourlyModelStats.hourTimestamp}), ${groupCol}`,
		)
		.orderBy(
			isHourly
				? sql`${projectHourlyModelStats.hourTimestamp} ASC`
				: sql`DATE(${projectHourlyModelStats.hourTimestamp}) ASC`,
		);

	return rows.map((row) => ({
		bucket: String(row.bucket),
		groupValue: row.groupValue ?? null,
		requestCount: Number(row.requestCount),
		errorCount: Number(row.errorCount),
		cacheCount: Number(row.cacheCount),
		inputTokens: Number(row.inputTokens),
		outputTokens: Number(row.outputTokens),
		cachedTokens: Number(row.cachedTokens),
		costUsd: Number(row.costUsd),
	}));
}

// Re-export tables for use in the route
export { tables };
