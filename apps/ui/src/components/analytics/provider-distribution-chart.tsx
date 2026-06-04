"use client";

import { useCallback, useMemo } from "react";
import { Label, Pie, PieChart } from "recharts";

import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/lib/components/chart";

import { providers } from "@llmgateway/models";

import type { ChartConfig } from "@/lib/components/chart";
import type { ViewBox } from "recharts/types/util/types";

interface RowData {
	groupValue: string | null;
	costUsd: number;
}

interface ProviderDistributionChartProps {
	data: RowData[];
}

const FALLBACK_COLORS = [
	"#3b82f6",
	"#f59e0b",
	"#10b981",
	"#8b5cf6",
	"#ef4444",
	"#06b6d4",
];

function isLowContrast(hex: string): boolean {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const redLum = 0.299 * r;
	const greenLum = 0.587 * g;
	const blueLum = 0.114 * b;
	const lum = (redLum + greenLum + blueLum) / 255;
	return lum < 0.15 || lum > 0.85;
}

function getColor(providerId: string, index: number): string {
	const p = providers.find((p) => p.id === providerId);
	if (p?.color && !isLowContrast(p.color)) {
		return p.color;
	}
	return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function ProviderDistributionChart({
	data,
}: ProviderDistributionChartProps) {
	const { chartData, chartConfig, totalCost } = useMemo(() => {
		const aggregated = new Map<string, number>();
		for (const row of data) {
			const key = row.groupValue ?? "(other)";
			aggregated.set(key, (aggregated.get(key) ?? 0) + row.costUsd);
		}

		const sorted = Array.from(aggregated.entries())
			.map(([name, cost]) => ({ name, cost }))
			.sort((a, b) => b.cost - a.cost);

		const config: ChartConfig = { cost: { label: "Cost" } };
		const pieData = sorted.map((item, i) => {
			const key = item.name.replace(/[^a-zA-Z0-9]/g, "_");
			const color = getColor(item.name, i);
			config[key] = { label: item.name, color };
			return {
				name: key,
				label: item.name,
				cost: item.cost,
				fill: `var(--color-${key})`,
			};
		});

		const total = pieData.reduce((s, r) => s + r.cost, 0);
		return { chartData: pieData, chartConfig: config, totalCost: total };
	}, [data]);

	const centerLabel = useCallback(
		({ viewBox }: { viewBox?: ViewBox }) => {
			if (viewBox && "cx" in viewBox && "cy" in viewBox) {
				const cost =
					totalCost >= 1_000
						? `$${(totalCost / 1_000).toFixed(1)}K`
						: `$${totalCost.toFixed(2)}`;
				return (
					<text
						x={viewBox.cx}
						y={viewBox.cy}
						textAnchor="middle"
						dominantBaseline="middle"
					>
						<tspan
							x={viewBox.cx}
							y={viewBox.cy}
							className="fill-foreground text-lg font-bold"
						>
							{cost}
						</tspan>
						<tspan
							x={viewBox.cx}
							y={(viewBox.cy ?? 0) + 18}
							className="fill-muted-foreground text-xs"
						>
							Total
						</tspan>
					</text>
				);
			}
			return null;
		},
		[totalCost],
	);

	if (chartData.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
				No data available
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4 md:flex-row">
			<ChartContainer
				config={chartConfig}
				className="aspect-square w-full max-w-[220px]"
			>
				<PieChart>
					<ChartTooltip
						content={
							<ChartTooltipContent
								hideLabel
								formatter={(value, name) => (
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">
											{chartConfig[String(name)]?.label ?? name}
										</span>
										<span className="font-mono font-medium">
											${Number(value).toFixed(4)}
										</span>
									</div>
								)}
							/>
						}
					/>
					<Pie
						data={chartData}
						dataKey="cost"
						nameKey="name"
						innerRadius={55}
						strokeWidth={2}
						stroke="hsl(var(--background))"
					>
						<Label content={centerLabel} />
					</Pie>
				</PieChart>
			</ChartContainer>
			<div className="flex flex-col gap-1.5 text-sm flex-1">
				{chartData.map((item) => {
					const pct =
						totalCost > 0 ? ((item.cost / totalCost) * 100).toFixed(1) : "0";
					const cfg = chartConfig[item.name];
					return (
						<div
							key={item.name}
							className="flex items-center justify-between gap-2"
						>
							<div className="flex items-center gap-2 min-w-0">
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-sm"
									style={{
										backgroundColor:
											cfg && "color" in cfg ? cfg.color : "#94a3b8",
									}}
								/>
								<span className="truncate text-muted-foreground">
									{item.label}
								</span>
							</div>
							<div className="flex items-center gap-2 shrink-0 tabular-nums">
								<span className="font-medium">${item.cost.toFixed(2)}</span>
								<span className="text-muted-foreground w-12 text-right">
									{pct}%
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
