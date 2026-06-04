"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/lib/components/chart";

import type { ChartConfig } from "@/lib/components/chart";

interface TimePoint {
	bucket: string;
	costUsd: number;
}

interface CostTimelineChartProps {
	data: TimePoint[];
	resolution: "hourly" | "daily";
}

const chartConfig: ChartConfig = {
	costUsd: {
		label: "Cost (USD)",
		color: "#3b82f6",
	},
};

function formatBucket(bucket: string, resolution: "hourly" | "daily"): string {
	try {
		const d = parseISO(bucket);
		return resolution === "hourly"
			? format(d, "MMM d, HH:mm")
			: format(d, "MMM d");
	} catch {
		return bucket;
	}
}

export function CostTimelineChart({
	data,
	resolution,
}: CostTimelineChartProps) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
				No data for selected range
			</div>
		);
	}

	const chartData = data.map((d) => ({
		label: formatBucket(d.bucket, resolution),
		costUsd: d.costUsd,
	}));

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<LineChart data={chartData}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
				<XAxis
					dataKey="label"
					tick={{ fontSize: 11 }}
					tickLine={false}
					axisLine={false}
					interval="preserveStartEnd"
				/>
				<YAxis
					tickFormatter={(v: number) => `$${v.toFixed(2)}`}
					tick={{ fontSize: 11 }}
					tickLine={false}
					axisLine={false}
					width={70}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
						/>
					}
				/>
				<Line
					type="monotone"
					dataKey="costUsd"
					stroke="var(--color-costUsd)"
					strokeWidth={2}
					dot={false}
					activeDot={{ r: 4 }}
				/>
			</LineChart>
		</ChartContainer>
	);
}
