"use client";

import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { Skeleton } from "@/lib/components/skeleton";

import { LogRowDetail } from "./log-row-detail";

import type { paths } from "@/lib/api/v1";
import type { ColumnDef } from "@tanstack/react-table";

type GatewayLog =
	paths["/logs"]["get"]["responses"][200]["content"]["application/json"]["logs"][number];

interface LogTableProps {
	logs: GatewayLog[];
	isLoading: boolean;
	hasMore: boolean;
	isFetchingMore: boolean;
	onLoadMore: () => void;
}

function formatCost(cost: number | null): string {
	if (cost === null) {
		return "—";
	}
	if (cost === 0) {
		return "free";
	}
	if (cost < 0.0001) {
		return `<$0.0001`;
	}
	return `$${cost.toFixed(4)}`;
}

function StatusBadge({ log }: { log: GatewayLog }) {
	if (log.hasError) {
		const code = log.errorDetails?.statusCode;
		if (code === 429) {
			return (
				<Badge variant="destructive" className="text-xs">
					429
				</Badge>
			);
		}
		return (
			<Badge variant="destructive" className="text-xs">
				{code ?? "Error"}
			</Badge>
		);
	}
	if (log.canceled) {
		return (
			<Badge variant="secondary" className="text-xs">
				Canceled
			</Badge>
		);
	}
	return (
		<Badge className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
			200
		</Badge>
	);
}

export function LogTable({
	logs,
	isLoading,
	hasMore,
	isFetchingMore,
	onLoadMore,
}: LogTableProps) {
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const toggleRow = (id: string) => {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const columns: ColumnDef<GatewayLog>[] = [
		{
			id: "expand",
			size: 40,
			cell: ({ row }) => (
				<button
					type="button"
					onClick={() => toggleRow(row.original.id)}
					className="p-1 rounded hover:bg-muted transition-colors"
					aria-label={
						expandedRows.has(row.original.id) ? "Collapse row" : "Expand row"
					}
				>
					{expandedRows.has(row.original.id) ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</button>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Time",
			size: 160,
			cell: ({ getValue }) => {
				const val = getValue<string>();
				return (
					<span className="text-xs font-mono whitespace-nowrap">
						{format(new Date(val), "HH:mm:ss.SSS")}
					</span>
				);
			},
		},
		{
			accessorKey: "requestedModel",
			header: "Model",
			size: 200,
			cell: ({ row }) => (
				<div className="min-w-0">
					<p
						className="text-sm truncate max-w-[180px]"
						title={row.original.usedModel}
					>
						{row.original.usedModel}
					</p>
					{row.original.requestedModel !== row.original.usedModel && (
						<p className="text-xs text-muted-foreground truncate max-w-[180px]">
							req: {row.original.requestedModel}
						</p>
					)}
				</div>
			),
		},
		{
			accessorKey: "usedProvider",
			header: "Provider",
			size: 120,
			cell: ({ getValue }) => (
				<span className="text-sm capitalize">{getValue<string>()}</span>
			),
		},
		{
			accessorKey: "cost",
			header: "Cost",
			size: 90,
			cell: ({ getValue }) => (
				<span className="text-sm font-mono">
					{formatCost(getValue<number | null>())}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			size: 90,
			cell: ({ row }) => <StatusBadge log={row.original} />,
		},
		{
			id: "user",
			header: "User",
			size: 160,
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground truncate max-w-[140px] block">
					{row.original.apiKeyName ?? row.original.apiKeyId}
				</span>
			),
		},
	];

	const table = useReactTable({
		data: logs,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 8 }).map((_, i) => (
					<Skeleton key={i} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (logs.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground">
				No logs found matching the selected filters.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-md border overflow-hidden">
				<table className="w-full">
					<thead className="bg-muted/50">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className="px-3 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
										style={{ width: header.getSize() }}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.map((row) => (
							<Fragment key={row.id}>
								<tr
									className="border-t hover:bg-muted/25 transition-colors cursor-pointer"
									onClick={() => toggleRow(row.original.id)}
								>
									{row.getVisibleCells().map((cell) => (
										<td
											key={cell.id}
											className="px-3 py-3 align-middle"
											onClick={
												cell.column.id === "expand"
													? (e) => e.stopPropagation()
													: undefined
											}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
								</tr>
								{expandedRows.has(row.original.id) && (
									<tr className="border-t">
										<td colSpan={columns.length}>
											<LogRowDetail log={row.original} />
										</td>
									</tr>
								)}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>

			{hasMore && (
				<div className="flex justify-center">
					<Button
						variant="outline"
						onClick={onLoadMore}
						disabled={isFetchingMore}
					>
						{isFetchingMore ? "Loading..." : "Load More"}
					</Button>
				</div>
			)}
		</div>
	);
}
