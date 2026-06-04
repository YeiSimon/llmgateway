"use client";

import { format, subDays } from "date-fns";
import { useMemo, useState } from "react";

import { CostTimelineChart } from "@/components/analytics/cost-timeline-chart";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { ProviderDistributionChart } from "@/components/analytics/provider-distribution-chart";
import { TopModelsTable } from "@/components/analytics/top-models-table";
import { DateRangeSelect } from "@/components/date-range-select";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/lib/components/card";
import { Separator } from "@/lib/components/separator";
import { useApi } from "@/lib/fetch-client";

import type { DateRange } from "@/components/date-range-select";

type GroupBy = "model" | "provider" | "project" | "source";
type Resolution = "hourly" | "daily";

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
	{ value: "model", label: "Model" },
	{ value: "provider", label: "Provider" },
	{ value: "project", label: "Project" },
	{ value: "source", label: "Source" },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
	{ value: "hourly", label: "Hourly" },
	{ value: "daily", label: "Daily" },
];

interface AnalyticsClientProps {
	orgId: string;
}

export function AnalyticsClient({ orgId }: AnalyticsClientProps) {
	const now = new Date();
	const [dateRange, setDateRange] = useState<DateRange>({
		start: subDays(now, 7),
		end: now,
	});
	const [groupBy, setGroupBy] = useState<GroupBy>("model");
	const [resolution, setResolution] = useState<Resolution>("daily");

	const from = format(dateRange.start, "yyyy-MM-dd");
	const to = format(dateRange.end, "yyyy-MM-dd");

	const api = useApi();
	const { data, isLoading } = api.useQuery(
		"get",
		"/analytics/cost-breakdown",
		{
			params: {
				query: {
					organizationId: orgId,
					from,
					to,
					groupBy,
					resolution,
				},
			},
		},
		{
			staleTime: 30_000,
		},
	);

	const rows = data?.data ?? [];

	const { totalRequests, totalCost, totalTokens } = useMemo(() => {
		let reqs = 0;
		let cost = 0;
		let tokens = 0;
		for (const r of rows) {
			reqs += r.requestCount;
			cost += r.costUsd;
			tokens += r.inputTokens + r.outputTokens;
		}
		return { totalRequests: reqs, totalCost: cost, totalTokens: tokens };
	}, [rows]);

	const timelineData = useMemo(() => {
		const bucketMap = new Map<string, number>();
		for (const r of rows) {
			bucketMap.set(r.bucket, (bucketMap.get(r.bucket) ?? 0) + r.costUsd);
		}
		return Array.from(bucketMap.entries())
			.map(([bucket, costUsd]) => ({ bucket, costUsd }))
			.sort((a, b) => a.bucket.localeCompare(b.bucket));
	}, [rows]);

	const providerRows = useMemo(() => {
		if (groupBy === "provider") {
			return rows.map((r) => ({
				groupValue: r.groupValue,
				costUsd: r.costUsd,
			}));
		}
		return [];
	}, [rows, groupBy]);

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold">Analytics</h1>
					<p className="text-muted-foreground text-sm">
						Cost and usage breakdown across your organization
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<DateRangeSelect
						value="7days"
						onChange={(_value, range) => setDateRange(range)}
					/>
				</div>
			</div>

			<KpiCards
				totalRequests={totalRequests}
				totalCost={totalCost}
				totalTokens={totalTokens}
				avgLatencyMs={0}
				isLoading={isLoading}
			/>

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle>Cost Over Time</CardTitle>
							<CardDescription>
								{resolution === "hourly" ? "Hourly" : "Daily"} cost in USD
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex rounded-md border overflow-hidden">
								{GROUP_BY_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => setGroupBy(opt.value)}
										className={`px-3 py-1.5 text-xs transition-colors ${
											groupBy === opt.value
												? "bg-primary text-primary-foreground"
												: "hover:bg-muted"
										}`}
									>
										{opt.label}
									</button>
								))}
							</div>
							<div className="flex rounded-md border overflow-hidden">
								{RESOLUTION_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => setResolution(opt.value)}
										className={`px-3 py-1.5 text-xs transition-colors ${
											resolution === opt.value
												? "bg-primary text-primary-foreground"
												: "hover:bg-muted"
										}`}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<CostTimelineChart data={timelineData} resolution={resolution} />
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Top 10 by Cost</CardTitle>
						<CardDescription>
							Sorted by total spend — click a column to re-sort
						</CardDescription>
					</CardHeader>
					<CardContent className="overflow-x-auto">
						<TopModelsTable data={rows} groupBy={groupBy} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Provider Distribution</CardTitle>
						<CardDescription>Cost share by provider</CardDescription>
					</CardHeader>
					<CardContent>
						<ProviderDistributionChart
							data={
								groupBy === "provider"
									? providerRows
									: rows.map((r) => ({
											groupValue: r.groupValue,
											costUsd: r.costUsd,
										}))
							}
						/>
					</CardContent>
				</Card>
			</div>

			{data && (
				<>
					<Separator />
					<p className="text-xs text-muted-foreground">
						Data source:{" "}
						<span className="font-medium">
							{data.source === "clickhouse" ? "ClickHouse" : "PostgreSQL"}
						</span>
					</p>
				</>
			)}
		</div>
	);
}
