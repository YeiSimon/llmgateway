"use client";

import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";

interface RowData {
	groupValue: string | null;
	requestCount: number;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
}

interface TopModelsTableProps {
	data: RowData[];
	groupBy: "model" | "provider" | "project" | "source";
}

type SortKey = "costUsd" | "requestCount" | "inputTokens" | "outputTokens";

function formatNumber(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return n.toLocaleString();
}

const COLUMN_LABEL: Record<SortKey, string> = {
	costUsd: "Cost",
	requestCount: "Requests",
	inputTokens: "Input Tokens",
	outputTokens: "Output Tokens",
};

export function TopModelsTable({ data, groupBy }: TopModelsTableProps) {
	const [sortKey, setSortKey] = useState<SortKey>("costUsd");
	const [sortAsc, setSortAsc] = useState(false);

	const aggregated = new Map<
		string,
		{
			requestCount: number;
			costUsd: number;
			inputTokens: number;
			outputTokens: number;
		}
	>();
	for (const row of data) {
		const key = row.groupValue ?? "(none)";
		const existing = aggregated.get(key);
		if (existing) {
			existing.requestCount += row.requestCount;
			existing.costUsd += row.costUsd;
			existing.inputTokens += row.inputTokens;
			existing.outputTokens += row.outputTokens;
		} else {
			aggregated.set(key, {
				requestCount: row.requestCount,
				costUsd: row.costUsd,
				inputTokens: row.inputTokens,
				outputTokens: row.outputTokens,
			});
		}
	}

	const rows = Array.from(aggregated.entries())
		.map(([name, stats]) => ({ name, ...stats }))
		.sort((a, b) => {
			const diff = a[sortKey] - b[sortKey];
			return sortAsc ? diff : -diff;
		})
		.slice(0, 10);

	const handleSort = (key: SortKey) => {
		if (key === sortKey) {
			setSortAsc((v) => !v);
		} else {
			setSortKey(key);
			setSortAsc(false);
		}
	};

	const groupByLabel =
		groupBy === "model"
			? "Model"
			: groupBy === "provider"
				? "Provider"
				: groupBy === "project"
					? "Project"
					: "Source";

	const sortIndicator = (key: SortKey) =>
		sortKey === key ? (sortAsc ? " ▲" : " ▼") : "";

	if (rows.length === 0) {
		return (
			<div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
				No data available
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>{groupByLabel}</TableHead>
					{(
						[
							"costUsd",
							"requestCount",
							"inputTokens",
							"outputTokens",
						] as SortKey[]
					).map((key) => (
						<TableHead
							key={key}
							className="cursor-pointer select-none text-right"
							onClick={() => handleSort(key)}
						>
							{COLUMN_LABEL[key]}
							{sortIndicator(key)}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.name}>
						<TableCell className="font-medium max-w-[160px] truncate">
							<Badge variant="outline" className="font-mono text-xs">
								{row.name}
							</Badge>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							${row.costUsd.toFixed(4)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(row.requestCount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(row.inputTokens)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(row.outputTokens)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
