import { createClient } from "@clickhouse/client";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { userHasOrganizationAccess } from "@/utils/authorization.js";

import { and, db, gte, lte, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";

export const analytics = new OpenAPIHono<ServerTypes>();

const analyticsSourceSchema = z.enum(["clickhouse", "postgres"]);
const groupBySchema = z.enum(["model", "provider", "project", "source"]);
const resolutionSchema = z.enum(["hourly", "daily"]);

type AnalyticsSource = z.infer<typeof analyticsSourceSchema>;
type GroupBy = z.infer<typeof groupBySchema>;
type Resolution = z.infer<typeof resolutionSchema>;

const dateRangeQuerySchema = z.object({
	organizationId: z.string().openapi({
		description: "Organization ID to query analytics data for",
	}),
	from: z.string().openapi({
		description: "Start date (ISO 8601, e.g. 2026-05-01)",
		example: "2026-05-01",
	}),
	to: z.string().openapi({
		description: "End date (ISO 8601, e.g. 2026-06-01)",
		example: "2026-06-01",
	}),
});

const costBreakdownQuerySchema = dateRangeQuerySchema.extend({
	groupBy: groupBySchema.optional().openapi({
		description: "Dimension to group results by",
		example: "model",
	}),
	resolution: resolutionSchema.optional().openapi({
		description: "Time resolution for aggregation",
		example: "hourly",
	}),
});

const analyticsSummarySchema = z.object({
	requestCount: z.number().openapi({ description: "Number of requests" }),
	errorCount: z.number().openapi({ description: "Number of errors" }),
	cacheCount: z.number().openapi({ description: "Number of cached responses" }),
	inputTokens: z.number().openapi({ description: "Total input tokens" }),
	outputTokens: z.number().openapi({ description: "Total output tokens" }),
	cachedTokens: z.number().openapi({ description: "Total cached tokens" }),
	reasoningTokens: z
		.number()
		.openapi({ description: "Total reasoning tokens" }),
	costUsd: z.number().openapi({ description: "Total cost in USD" }),
	avgLatencyMs: z
		.number()
		.nullable()
		.openapi({ description: "Average end-to-end latency in milliseconds" }),
	avgTimeToFirstTokenMs: z
		.number()
		.nullable()
		.openapi({ description: "Average time to first token in milliseconds" }),
});

const costBreakdownItemSchema = analyticsSummarySchema.extend({
	bucket: z.string().openapi({ description: "Time bucket (ISO string)" }),
	groupValue: z
		.string()
		.nullable()
		.openapi({ description: "Value of the groupBy dimension" }),
});

const providerHealthItemSchema = z.object({
	provider: z.string().openapi({ description: "Provider ID" }),
	requestCount: z.number().openapi({ description: "Number of requests" }),
	errorCount: z.number().openapi({ description: "Number of failed requests" }),
	throttledCount: z
		.number()
		.openapi({ description: "Number of rate-limited requests" }),
	errorRate: z.number().openapi({ description: "Error rate percentage" }),
	throttleRate: z.number().openapi({ description: "Throttle rate percentage" }),
	avgLatencyMs: z
		.number()
		.nullable()
		.openapi({ description: "Average end-to-end latency in milliseconds" }),
	p95LatencyMs: z
		.number()
		.nullable()
		.openapi({ description: "P95 end-to-end latency in milliseconds" }),
	lastSeenAt: z
		.string()
		.nullable()
		.openapi({ description: "Most recent request timestamp" }),
});

const getSummary = createRoute({
	method: "get",
	path: "/summary",
	request: {
		query: dateRangeQuerySchema,
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						data: analyticsSummarySchema,
						source: analyticsSourceSchema,
					}),
				},
			},
			description: "Organization analytics summary for a time range",
		},
		401: { description: "Unauthorized" },
		403: { description: "Forbidden" },
	},
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
						source: analyticsSourceSchema,
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

const getProviderHealth = createRoute({
	method: "get",
	path: "/provider-health",
	request: {
		query: dateRangeQuerySchema,
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						data: z.array(providerHealthItemSchema),
						source: analyticsSourceSchema,
					}),
				},
			},
			description: "Provider health metrics scoped to an organization",
		},
		401: { description: "Unauthorized" },
		403: { description: "Forbidden" },
	},
});

analytics.openapi(getSummary, async (c) => {
	const { organizationId, fromDate, toDate } = await validateAnalyticsRequest(
		c.get("user")?.id,
		c.req.valid("query"),
	);

	const result = await withAnalyticsSource(
		() => querySummaryClickHouse(organizationId, fromDate, toDate),
		() => querySummaryPostgres(organizationId, fromDate, toDate),
	);

	return c.json(result);
});

analytics.openapi(getCostBreakdown, async (c) => {
	const {
		organizationId,
		from,
		to,
		groupBy = "model",
		resolution = "hourly",
	} = c.req.valid("query");

	const { fromDate, toDate } = await validateAnalyticsRequest(
		c.get("user")?.id,
		{
			organizationId,
			from,
			to,
		},
	);

	const result = await withAnalyticsSource(
		() =>
			queryCostBreakdownClickHouse(
				organizationId,
				fromDate,
				toDate,
				groupBy,
				resolution,
			),
		() =>
			queryCostBreakdownPostgres(
				organizationId,
				fromDate,
				toDate,
				groupBy,
				resolution,
			),
	);

	return c.json(result);
});

analytics.openapi(getProviderHealth, async (c) => {
	const { organizationId, fromDate, toDate } = await validateAnalyticsRequest(
		c.get("user")?.id,
		c.req.valid("query"),
	);

	const result = await withAnalyticsSource(
		() => queryProviderHealthClickHouse(organizationId, fromDate, toDate),
		() => queryProviderHealthPostgres(organizationId, fromDate, toDate),
	);

	return c.json(result);
});

async function validateAnalyticsRequest(
	userId: string | undefined,
	query: z.infer<typeof dateRangeQuerySchema>,
): Promise<{ organizationId: string; fromDate: Date; toDate: Date }> {
	if (!userId) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const hasAccess = await userHasOrganizationAccess(
		userId,
		query.organizationId,
	);
	if (!hasAccess) {
		throw new HTTPException(403, {
			message: "You don't have access to this organization",
		});
	}

	const fromDate = new Date(query.from);
	const toDate = new Date(query.to);

	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
		throw new HTTPException(400, {
			message: "Invalid date format. Use ISO 8601 (e.g. 2026-05-01)",
		});
	}

	if (fromDate.getTime() >= toDate.getTime()) {
		throw new HTTPException(400, {
			message: "from must be before to",
		});
	}

	return { organizationId: query.organizationId, fromDate, toDate };
}

async function withAnalyticsSource<T>(
	clickHouseQuery: () => Promise<T>,
	postgresQuery: () => Promise<T>,
): Promise<{ data: T; source: AnalyticsSource }> {
	if (!process.env.CLICKHOUSE_URL) {
		return {
			data: await postgresQuery(),
			source: "postgres",
		};
	}

	try {
		return {
			data: await clickHouseQuery(),
			source: "clickhouse",
		};
	} catch (error) {
		logger.warn("ClickHouse analytics query failed; falling back to Postgres", {
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			data: await postgresQuery(),
			source: "postgres",
		};
	}
}

function toClickHouseDateTime(date: Date): string {
	return date
		.toISOString()
		.replace("T", " ")
		.replace(/\..+Z$/, "");
}

async function queryClickHouseJson<T>(
	query: string,
	queryParams: Record<string, string>,
): Promise<T[]> {
	const client = createClient({
		url: process.env.CLICKHOUSE_URL,
		database: "llmgateway",
	});

	try {
		const result = await client.query({
			query,
			query_params: queryParams,
			format: "JSONEachRow",
		});

		return (await result.json()) as T[];
	} finally {
		await client.close();
	}
}

function normalizeNumber(value: unknown): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function normalizeNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = normalizeNumber(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function getBucketExpression(resolution: Resolution, column: string): string {
	return resolution === "hourly"
		? `toStartOfHour(${column})`
		: `toStartOfDay(${column})`;
}

function getClickHouseGroupColumn(groupBy: GroupBy): string {
	return {
		model: "used_model",
		provider: "used_provider",
		project: "project_id",
		source: "source",
	}[groupBy];
}

function getPostgresGroupExpression(groupBy: GroupBy) {
	if (groupBy === "model") {
		return sql<string>`${tables.log.usedModel}`;
	}
	if (groupBy === "provider") {
		return sql<string>`${tables.log.usedProvider}`;
	}
	if (groupBy === "project") {
		return sql<string>`${tables.log.projectId}`;
	}
	return sql<string | null>`${tables.log.source}`;
}

function getPostgresBucketExpression(resolution: Resolution) {
	return resolution === "hourly"
		? sql<string>`to_char(date_trunc('hour', ${tables.log.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS')`
		: sql<string>`to_char(date_trunc('day', ${tables.log.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS')`;
}

const emptySummary: z.infer<typeof analyticsSummarySchema> = {
	requestCount: 0,
	errorCount: 0,
	cacheCount: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	reasoningTokens: 0,
	costUsd: 0,
	avgLatencyMs: null,
	avgTimeToFirstTokenMs: null,
};

async function querySummaryClickHouse(
	organizationId: string,
	from: Date,
	to: Date,
): Promise<z.infer<typeof analyticsSummarySchema>> {
	const rows = await queryClickHouseJson<{
		request_count: unknown;
		error_count: unknown;
		cache_count: unknown;
		input_tokens: unknown;
		output_tokens: unknown;
		cached_tokens: unknown;
		reasoning_tokens: unknown;
		cost_usd: unknown;
		avg_latency_ms: unknown;
		avg_time_to_first_token_ms: unknown;
	}>(
		`
			SELECT
				count() AS request_count,
				sum(has_error) AS error_count,
				sum(cached) AS cache_count,
				sum(ifNull(input_tokens, 0)) AS input_tokens,
				sum(ifNull(output_tokens, 0)) AS output_tokens,
				sum(ifNull(cached_tokens, 0)) AS cached_tokens,
				sum(ifNull(reasoning_tokens, 0)) AS reasoning_tokens,
				sum(ifNull(cost, 0)) AS cost_usd,
				avgOrNull(duration_ms) AS avg_latency_ms,
				avgOrNull(time_to_first_token) AS avg_time_to_first_token_ms
			FROM gateway_logs
			WHERE
				organization_id = {organizationId: String}
				AND created_at >= {from: DateTime}
				AND created_at < {to: DateTime}
		`,
		{
			organizationId,
			from: toClickHouseDateTime(from),
			to: toClickHouseDateTime(to),
		},
	);

	const row = rows[0];
	if (!row) {
		return emptySummary;
	}

	return {
		requestCount: normalizeNumber(row.request_count),
		errorCount: normalizeNumber(row.error_count),
		cacheCount: normalizeNumber(row.cache_count),
		inputTokens: normalizeNumber(row.input_tokens),
		outputTokens: normalizeNumber(row.output_tokens),
		cachedTokens: normalizeNumber(row.cached_tokens),
		reasoningTokens: normalizeNumber(row.reasoning_tokens),
		costUsd: normalizeNumber(row.cost_usd),
		avgLatencyMs: normalizeNullableNumber(row.avg_latency_ms),
		avgTimeToFirstTokenMs: normalizeNullableNumber(
			row.avg_time_to_first_token_ms,
		),
	};
}

async function querySummaryPostgres(
	organizationId: string,
	from: Date,
	to: Date,
): Promise<z.infer<typeof analyticsSummarySchema>> {
	const rows = await db
		.select({
			requestCount: sql<number>`COUNT(*)::int`.as("requestCount"),
			errorCount:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.hasError} THEN 1 ELSE 0 END), 0)::int`.as(
					"errorCount",
				),
			cacheCount:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.cached} THEN 1 ELSE 0 END), 0)::int`.as(
					"cacheCount",
				),
			inputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.promptTokens} AS NUMERIC)), 0)`.as(
					"inputTokens",
				),
			outputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.completionTokens} AS NUMERIC)), 0)`.as(
					"outputTokens",
				),
			cachedTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.cachedTokens} AS NUMERIC)), 0)`.as(
					"cachedTokens",
				),
			reasoningTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.reasoningTokens} AS NUMERIC)), 0)`.as(
					"reasoningTokens",
				),
			costUsd: sql<number>`COALESCE(SUM(${tables.log.cost}), 0)`.as("costUsd"),
			avgLatencyMs: sql<number | null>`AVG(${tables.log.duration})`.as(
				"avgLatencyMs",
			),
			avgTimeToFirstTokenMs: sql<
				number | null
			>`AVG(${tables.log.timeToFirstToken})`.as("avgTimeToFirstTokenMs"),
		})
		.from(tables.log)
		.where(
			and(
				sql`${tables.log.organizationId} = ${organizationId}`,
				gte(tables.log.createdAt, from),
				lte(tables.log.createdAt, to),
			),
		);

	const row = rows[0];
	if (!row) {
		return emptySummary;
	}

	return {
		requestCount: Number(row.requestCount),
		errorCount: Number(row.errorCount),
		cacheCount: Number(row.cacheCount),
		inputTokens: Number(row.inputTokens),
		outputTokens: Number(row.outputTokens),
		cachedTokens: Number(row.cachedTokens),
		reasoningTokens: Number(row.reasoningTokens),
		costUsd: Number(row.costUsd),
		avgLatencyMs: row.avgLatencyMs === null ? null : Number(row.avgLatencyMs),
		avgTimeToFirstTokenMs:
			row.avgTimeToFirstTokenMs === null
				? null
				: Number(row.avgTimeToFirstTokenMs),
	};
}

async function queryCostBreakdownClickHouse(
	organizationId: string,
	from: Date,
	to: Date,
	groupBy: GroupBy,
	resolution: Resolution,
): Promise<z.infer<typeof costBreakdownItemSchema>[]> {
	const groupCol = getClickHouseGroupColumn(groupBy);
	const bucketExpr = getBucketExpression(resolution, "created_at");

	const rows = await queryClickHouseJson<{
		bucket: string;
		group_value: string | null;
		request_count: unknown;
		error_count: unknown;
		cache_count: unknown;
		input_tokens: unknown;
		output_tokens: unknown;
		cached_tokens: unknown;
		reasoning_tokens: unknown;
		cost_usd: unknown;
		avg_latency_ms: unknown;
		avg_time_to_first_token_ms: unknown;
	}>(
		`
			SELECT
				toString(${bucketExpr}) AS bucket,
				${groupCol} AS group_value,
				count() AS request_count,
				sum(has_error) AS error_count,
				sum(cached) AS cache_count,
				sum(ifNull(input_tokens, 0)) AS input_tokens,
				sum(ifNull(output_tokens, 0)) AS output_tokens,
				sum(ifNull(cached_tokens, 0)) AS cached_tokens,
				sum(ifNull(reasoning_tokens, 0)) AS reasoning_tokens,
				sum(ifNull(cost, 0)) AS cost_usd,
				avgOrNull(duration_ms) AS avg_latency_ms,
				avgOrNull(time_to_first_token) AS avg_time_to_first_token_ms
			FROM gateway_logs
			WHERE
				organization_id = {organizationId: String}
				AND created_at >= {from: DateTime}
				AND created_at < {to: DateTime}
			GROUP BY bucket, group_value
			ORDER BY bucket ASC, cost_usd DESC
		`,
		{
			organizationId,
			from: toClickHouseDateTime(from),
			to: toClickHouseDateTime(to),
		},
	);

	return rows.map((row) => ({
		bucket: row.bucket,
		groupValue: row.group_value ?? null,
		requestCount: normalizeNumber(row.request_count),
		errorCount: normalizeNumber(row.error_count),
		cacheCount: normalizeNumber(row.cache_count),
		inputTokens: normalizeNumber(row.input_tokens),
		outputTokens: normalizeNumber(row.output_tokens),
		cachedTokens: normalizeNumber(row.cached_tokens),
		reasoningTokens: normalizeNumber(row.reasoning_tokens),
		costUsd: normalizeNumber(row.cost_usd),
		avgLatencyMs: normalizeNullableNumber(row.avg_latency_ms),
		avgTimeToFirstTokenMs: normalizeNullableNumber(
			row.avg_time_to_first_token_ms,
		),
	}));
}

async function queryCostBreakdownPostgres(
	organizationId: string,
	from: Date,
	to: Date,
	groupBy: GroupBy,
	resolution: Resolution,
): Promise<z.infer<typeof costBreakdownItemSchema>[]> {
	const bucketExpr = getPostgresBucketExpression(resolution);
	const groupExpr = getPostgresGroupExpression(groupBy);

	const rows = await db
		.select({
			bucket: bucketExpr.as("bucket"),
			groupValue: groupExpr.as("groupValue"),
			requestCount: sql<number>`COUNT(*)::int`.as("requestCount"),
			errorCount:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.hasError} THEN 1 ELSE 0 END), 0)::int`.as(
					"errorCount",
				),
			cacheCount:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.cached} THEN 1 ELSE 0 END), 0)::int`.as(
					"cacheCount",
				),
			inputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.promptTokens} AS NUMERIC)), 0)`.as(
					"inputTokens",
				),
			outputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.completionTokens} AS NUMERIC)), 0)`.as(
					"outputTokens",
				),
			cachedTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.cachedTokens} AS NUMERIC)), 0)`.as(
					"cachedTokens",
				),
			reasoningTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.reasoningTokens} AS NUMERIC)), 0)`.as(
					"reasoningTokens",
				),
			costUsd: sql<number>`COALESCE(SUM(${tables.log.cost}), 0)`.as("costUsd"),
			avgLatencyMs: sql<number | null>`AVG(${tables.log.duration})`.as(
				"avgLatencyMs",
			),
			avgTimeToFirstTokenMs: sql<
				number | null
			>`AVG(${tables.log.timeToFirstToken})`.as("avgTimeToFirstTokenMs"),
		})
		.from(tables.log)
		.where(
			and(
				sql`${tables.log.organizationId} = ${organizationId}`,
				gte(tables.log.createdAt, from),
				lte(tables.log.createdAt, to),
			),
		)
		.groupBy(bucketExpr, groupExpr)
		.orderBy(bucketExpr, sql`COALESCE(SUM(${tables.log.cost}), 0) DESC`);

	return rows.map((row) => ({
		bucket: String(row.bucket),
		groupValue: row.groupValue ?? null,
		requestCount: Number(row.requestCount),
		errorCount: Number(row.errorCount),
		cacheCount: Number(row.cacheCount),
		inputTokens: Number(row.inputTokens),
		outputTokens: Number(row.outputTokens),
		cachedTokens: Number(row.cachedTokens),
		reasoningTokens: Number(row.reasoningTokens),
		costUsd: Number(row.costUsd),
		avgLatencyMs: row.avgLatencyMs === null ? null : Number(row.avgLatencyMs),
		avgTimeToFirstTokenMs:
			row.avgTimeToFirstTokenMs === null
				? null
				: Number(row.avgTimeToFirstTokenMs),
	}));
}

async function queryProviderHealthClickHouse(
	organizationId: string,
	from: Date,
	to: Date,
): Promise<z.infer<typeof providerHealthItemSchema>[]> {
	const rows = await queryClickHouseJson<{
		provider: string;
		request_count: unknown;
		error_count: unknown;
		throttled_count: unknown;
		error_rate: unknown;
		throttle_rate: unknown;
		avg_latency_ms: unknown;
		p95_latency_ms: unknown;
		last_seen_at: unknown;
	}>(
		`
			SELECT
				used_provider AS provider,
				count() AS request_count,
				sum(has_error) AS error_count,
				countIf(status_code = 429) AS throttled_count,
				if(request_count = 0, 0, error_count / request_count * 100) AS error_rate,
				if(request_count = 0, 0, throttled_count / request_count * 100) AS throttle_rate,
				avgOrNull(duration_ms) AS avg_latency_ms,
				if(
					countIf(duration_ms IS NOT NULL) = 0,
					NULL,
					quantileExactIf(0.95)(duration_ms, duration_ms IS NOT NULL)
				) AS p95_latency_ms,
				toString(max(created_at)) AS last_seen_at
			FROM gateway_logs
			WHERE
				organization_id = {organizationId: String}
				AND created_at >= {from: DateTime}
				AND created_at < {to: DateTime}
			GROUP BY provider
			ORDER BY request_count DESC, provider ASC
		`,
		{
			organizationId,
			from: toClickHouseDateTime(from),
			to: toClickHouseDateTime(to),
		},
	);

	return rows.map((row) => ({
		provider: row.provider,
		requestCount: normalizeNumber(row.request_count),
		errorCount: normalizeNumber(row.error_count),
		throttledCount: normalizeNumber(row.throttled_count),
		errorRate: normalizeNumber(row.error_rate),
		throttleRate: normalizeNumber(row.throttle_rate),
		avgLatencyMs: normalizeNullableNumber(row.avg_latency_ms),
		p95LatencyMs: normalizeNullableNumber(row.p95_latency_ms),
		lastSeenAt: normalizeDateString(row.last_seen_at),
	}));
}

async function queryProviderHealthPostgres(
	organizationId: string,
	from: Date,
	to: Date,
): Promise<z.infer<typeof providerHealthItemSchema>[]> {
	const rows = await db
		.select({
			provider: tables.log.usedProvider,
			requestCount: sql<number>`COUNT(*)::int`.as("requestCount"),
			errorCount:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.hasError} THEN 1 ELSE 0 END), 0)::int`.as(
					"errorCount",
				),
			throttledCount:
				sql<number>`COALESCE(SUM(CASE WHEN (${tables.log.errorDetails}->>'statusCode')::int = 429 THEN 1 ELSE 0 END), 0)::int`.as(
					"throttledCount",
				),
			errorRate:
				sql<number>`COALESCE(SUM(CASE WHEN ${tables.log.hasError} THEN 1 ELSE 0 END), 0)::float / NULLIF(COUNT(*), 0)::float * 100`.as(
					"errorRate",
				),
			throttleRate:
				sql<number>`COALESCE(SUM(CASE WHEN (${tables.log.errorDetails}->>'statusCode')::int = 429 THEN 1 ELSE 0 END), 0)::float / NULLIF(COUNT(*), 0)::float * 100`.as(
					"throttleRate",
				),
			avgLatencyMs: sql<number | null>`AVG(${tables.log.duration})`.as(
				"avgLatencyMs",
			),
			p95LatencyMs: sql<
				number | null
			>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${tables.log.duration})`.as(
				"p95LatencyMs",
			),
			lastSeenAt:
				sql<string>`to_char(MAX(${tables.log.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS')`.as(
					"lastSeenAt",
				),
		})
		.from(tables.log)
		.where(
			and(
				sql`${tables.log.organizationId} = ${organizationId}`,
				gte(tables.log.createdAt, from),
				lte(tables.log.createdAt, to),
			),
		)
		.groupBy(tables.log.usedProvider)
		.orderBy(sql`COUNT(*) DESC`, tables.log.usedProvider);

	return rows.map((row) => ({
		provider: row.provider,
		requestCount: Number(row.requestCount),
		errorCount: Number(row.errorCount),
		throttledCount: Number(row.throttledCount),
		errorRate: Number(row.errorRate ?? 0),
		throttleRate: Number(row.throttleRate ?? 0),
		avgLatencyMs: row.avgLatencyMs === null ? null : Number(row.avgLatencyMs),
		p95LatencyMs: row.p95LatencyMs === null ? null : Number(row.p95LatencyMs),
		lastSeenAt: row.lastSeenAt,
	}));
}
