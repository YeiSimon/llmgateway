import { createClient } from "@clickhouse/client";

import { logger } from "@llmgateway/logger";

import type { LogInsertData } from "./types.js";

export interface GatewayLogRow {
	id: string;
	organization_id: string;
	project_id: string;
	api_key_id: string;
	user_id: string | null;
	requested_model: string;
	used_model: string;
	used_provider: string;
	input_tokens: number | null;
	output_tokens: number | null;
	cached_tokens: number | null;
	reasoning_tokens: number | null;
	cost: number | null;
	input_cost: number | null;
	output_cost: number | null;
	duration_ms: number | null;
	time_to_first_token: number | null;
	status_code: number | null;
	has_error: 0 | 1;
	streamed: 0 | 1;
	cached: 0 | 1;
	finish_reason: string | null;
	mode: string;
	source: string | null;
	trace_id: string | null;
	created_at: string; // ISO8601 string for ClickHouse DateTime64
}

/**
 * Maps a LogInsertData (PostgreSQL insert shape) to a GatewayLogRow for ClickHouse.
 * Call this just before enqueue() at each insertLog site.
 */
export function buildClickHouseRow(
	logData: LogInsertData,
	id?: string,
): GatewayLogRow {
	const resolvedId = id ?? logData.id ?? "";
	const toNum = (v: unknown): number | null =>
		v !== null && v !== undefined ? Number(v) : null;
	return {
		id: resolvedId,
		organization_id: logData.organizationId,
		project_id: logData.projectId,
		api_key_id: logData.apiKeyId,
		user_id: null,
		requested_model: logData.requestedModel,
		used_model: logData.usedModel,
		used_provider: logData.usedProvider,
		input_tokens: toNum(logData.promptTokens),
		output_tokens: toNum(logData.completionTokens),
		cached_tokens: toNum(logData.cachedTokens),
		reasoning_tokens: toNum(logData.reasoningTokens),
		cost: toNum(logData.cost),
		input_cost: toNum(logData.inputCost),
		output_cost: toNum(logData.outputCost),
		duration_ms: logData.duration ?? null,
		time_to_first_token: logData.timeToFirstToken ?? null,
		status_code: null,
		has_error: logData.hasError ? 1 : 0,
		streamed: logData.streamed ? 1 : 0,
		cached: logData.cached ? 1 : 0,
		finish_reason: logData.finishReason ?? null,
		mode: logData.mode,
		source: logData.source ?? null,
		trace_id: logData.traceId ?? null,
		created_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
	};
}

export class ClickHouseWriter {
	private client: ReturnType<typeof createClient>;
	private buffer: GatewayLogRow[] = [];
	private flushInterval: NodeJS.Timeout;

	public constructor(url: string, database = "llmgateway") {
		this.client = createClient({ url, database });
		this.flushInterval = setInterval(() => {
			void this.flush();
		}, 2_000);
		this.flushInterval.unref?.();
	}

	public enqueue(row: GatewayLogRow): void {
		this.buffer.push(row);
		if (this.buffer.length >= 50) {
			void this.flush();
		}
	}

	private async flush(): Promise<void> {
		if (this.buffer.length === 0) {
			return;
		}
		const rows = this.buffer.splice(0, this.buffer.length);
		try {
			await this.client.insert({
				table: "gateway_logs",
				values: rows,
				format: "JSONEachRow",
			});
		} catch (err) {
			if (this.buffer.length < 100_000) {
				this.buffer.unshift(...rows);
			}
			logger.error("ClickHouse flush failed, rows queued for retry", {
				count: rows.length,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	public async close(): Promise<void> {
		clearInterval(this.flushInterval);
		await this.flush();
		await this.client.close();
	}
}
