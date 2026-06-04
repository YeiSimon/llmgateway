"use client";

import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@/lib/components/tabs";
import { useApi } from "@/lib/fetch-client";

import { LogFilters } from "./log-filters";
import { LogTable } from "./log-table";

import type { paths } from "@/lib/api/v1";

type AuditLog =
	paths["/audit-logs/{organizationId}"]["get"]["responses"][200]["content"]["application/json"]["auditLogs"][number];

interface LogExplorerClientProps {
	orgId: string;
}

function formatAuditAction(action: string): string {
	return action.replace(/\./g, " → ");
}

function getAuditBadgeVariant(
	action: string,
): "default" | "secondary" | "destructive" | "outline" {
	if (action.includes("delete") || action.includes("remove")) {
		return "destructive";
	}
	if (action.includes("create") || action.includes("add")) {
		return "default";
	}
	return "outline";
}

interface AuditLogTableProps {
	auditLogs: AuditLog[];
	isLoading: boolean;
	hasMore: boolean;
	isFetchingMore: boolean;
	onLoadMore: () => void;
}

function AuditLogTable({
	auditLogs,
	isLoading,
	hasMore,
	isFetchingMore,
	onLoadMore,
}: AuditLogTableProps) {
	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 8 }).map((_, i) => (
					<div
						key={i}
						className="h-12 w-full bg-muted/50 rounded animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (auditLogs.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground">
				No audit logs found.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-md border overflow-hidden">
				<table className="w-full">
					<thead className="bg-muted/50">
						<tr>
							<th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
								Time
							</th>
							<th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
								User
							</th>
							<th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
								Action
							</th>
							<th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
								Resource
							</th>
							<th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
								Resource ID
							</th>
						</tr>
					</thead>
					<tbody>
						{auditLogs.map((log) => (
							<tr
								key={log.id}
								className="border-t hover:bg-muted/25 transition-colors"
							>
								<td className="px-3 py-3 text-xs font-mono whitespace-nowrap">
									{format(new Date(log.createdAt), "HH:mm:ss MMM d")}
								</td>
								<td className="px-3 py-3">
									<div className="flex flex-col">
										<span className="text-sm">{log.user?.name ?? "—"}</span>
										<span className="text-xs text-muted-foreground">
											{log.user?.email ?? log.userId}
										</span>
									</div>
								</td>
								<td className="px-3 py-3">
									<Badge
										variant={getAuditBadgeVariant(log.action)}
										className="text-xs"
									>
										{formatAuditAction(log.action)}
									</Badge>
								</td>
								<td className="px-3 py-3">
									<Badge variant="outline" className="text-xs">
										{log.resourceType}
									</Badge>
								</td>
								<td className="px-3 py-3 text-xs font-mono text-muted-foreground">
									{log.resourceId ?? "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{hasMore && (
				<div className="flex justify-center">
					<button
						type="button"
						onClick={onLoadMore}
						disabled={isFetchingMore}
						className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
					>
						{isFetchingMore ? "Loading..." : "Load More"}
					</button>
				</div>
			)}
		</div>
	);
}

export function LogExplorerClient({ orgId }: LogExplorerClientProps) {
	const searchParams = useSearchParams();
	const api = useApi();

	const [activeTab, setActiveTab] = useState<"gateway" | "audit">("gateway");

	const projectId = searchParams.get("projectId") ?? undefined;
	const provider = searchParams.get("provider") ?? undefined;
	const status = searchParams.get("status") ?? undefined;
	const fromDate = searchParams.get("from") ?? undefined;
	const toDate = searchParams.get("to") ?? undefined;

	const gatewayQuery: Record<string, string> = {
		orderBy: "createdAt_desc",
		orgId,
	};
	if (projectId) {
		gatewayQuery.projectId = projectId;
	}
	if (provider) {
		gatewayQuery.provider = provider;
	}
	if (fromDate) {
		gatewayQuery.startDate = new Date(fromDate + "T00:00:00").toISOString();
	}
	if (toDate) {
		gatewayQuery.endDate = new Date(toDate + "T23:59:59").toISOString();
	}
	if (status === "success") {
		gatewayQuery.unifiedFinishReason = "completed";
	} else if (status === "rate_limited") {
		gatewayQuery.unifiedFinishReason = "gateway_error";
	} else if (status === "error") {
		gatewayQuery.unifiedFinishReason = "upstream_error";
	}

	const {
		data: gatewayData,
		isLoading: gatewayLoading,
		fetchNextPage: fetchNextGateway,
		hasNextPage: gatewayHasNext,
		isFetchingNextPage: gatewayFetchingNext,
	} = api.useInfiniteQuery(
		"get",
		"/logs",
		{
			params: { query: gatewayQuery },
		},
		{
			enabled: activeTab === "gateway",
			initialPageParam: undefined,
			getNextPageParam: (lastPage) =>
				lastPage?.pagination?.hasMore
					? lastPage.pagination.nextCursor
					: undefined,
		},
	);

	const auditQuery: Record<string, string> = {};
	if (fromDate) {
		auditQuery.startDate = new Date(fromDate + "T00:00:00").toISOString();
	}
	if (toDate) {
		auditQuery.endDate = new Date(toDate + "T23:59:59").toISOString();
	}

	const {
		data: auditData,
		isLoading: auditLoading,
		fetchNextPage: fetchNextAudit,
		hasNextPage: auditHasNext,
		isFetchingNextPage: auditFetchingNext,
	} = api.useInfiniteQuery(
		"get",
		"/audit-logs/{organizationId}",
		{
			params: {
				path: { organizationId: orgId },
				query: auditQuery,
			},
		},
		{
			enabled: activeTab === "audit",
			initialPageParam: undefined,
			getNextPageParam: (lastPage) =>
				lastPage?.pagination?.hasMore
					? lastPage.pagination.nextCursor
					: undefined,
		},
	);

	const allGatewayLogs =
		gatewayData?.pages.flatMap((page) => page?.logs ?? []) ?? [];
	const allAuditLogs =
		auditData?.pages.flatMap((page) => page?.auditLogs ?? []) ?? [];

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="flex flex-col gap-1">
					<h2 className="text-3xl font-bold tracking-tight">Log Explorer</h2>
					<p className="text-muted-foreground">
						Explore gateway and audit logs across your organization
					</p>
				</div>

				<Tabs
					value={activeTab}
					onValueChange={(v) => setActiveTab(v as "gateway" | "audit")}
				>
					<TabsList>
						<TabsTrigger value="gateway">Gateway Logs</TabsTrigger>
						<TabsTrigger value="audit">Audit Logs</TabsTrigger>
					</TabsList>

					<TabsContent value="gateway" className="space-y-4">
						<Card>
							<CardHeader className="pb-3">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
									<div>
										<CardTitle className="text-base">Gateway Logs</CardTitle>
										<CardDescription>
											All LLM API requests routed through the gateway
										</CardDescription>
									</div>
								</div>
								<LogFilters orgId={orgId} />
							</CardHeader>
							<CardContent>
								<LogTable
									logs={allGatewayLogs}
									isLoading={gatewayLoading}
									hasMore={!!gatewayHasNext}
									isFetchingMore={gatewayFetchingNext}
									onLoadMore={() => void fetchNextGateway()}
								/>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="audit" className="space-y-4">
						<Card>
							<CardHeader className="pb-3">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
									<div>
										<CardTitle className="text-base">Audit Logs</CardTitle>
										<CardDescription>
											Organization-level actions and configuration changes
										</CardDescription>
									</div>
								</div>
								<div className="pt-2">
									<LogFilters orgId={orgId} />
								</div>
							</CardHeader>
							<CardContent>
								<AuditLogTable
									auditLogs={allAuditLogs}
									isLoading={auditLoading}
									hasMore={!!auditHasNext}
									isFetchingMore={auditFetchingNext}
									onLoadMore={() => void fetchNextAudit()}
								/>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
