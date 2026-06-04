"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Skeleton } from "@/lib/components/skeleton";

interface KpiCardsProps {
	totalRequests: number;
	totalCost: number;
	totalTokens: number;
	avgLatencyMs: number | null;
	isLoading: boolean;
}

function formatNumber(n: number): string {
	if (n >= 1_000_000_000) {
		return `${(n / 1_000_000_000).toFixed(1)}B`;
	}
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return n.toLocaleString();
}

function formatCost(usd: number): string {
	if (usd >= 1_000) {
		return `$${(usd / 1_000).toFixed(1)}K`;
	}
	return `$${usd.toFixed(2)}`;
}

export function KpiCards({
	totalRequests,
	totalCost,
	totalTokens,
	avgLatencyMs,
	isLoading,
}: KpiCardsProps) {
	const cards = [
		{
			title: "Total Requests",
			value: isLoading ? null : formatNumber(totalRequests),
		},
		{
			title: "Total Cost",
			value: isLoading ? null : formatCost(totalCost),
		},
		{
			title: "Total Tokens",
			value: isLoading ? null : formatNumber(totalTokens),
		},
		{
			title: "Avg Latency",
			value:
				isLoading || avgLatencyMs === null
					? null
					: avgLatencyMs === 0
						? "—"
						: `${Math.round(avgLatencyMs)}ms`,
		},
	];

	return (
		<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{cards.map((card) => (
				<Card key={card.title}>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{card.title}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{card.value === null ? (
							<Skeleton className="h-7 w-24" />
						) : (
							<p className="text-2xl font-bold tabular-nums">{card.value}</p>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
