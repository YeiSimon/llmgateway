import { ClipboardList, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/require-session";
import { createServerApiClient } from "@/lib/server-api";

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function actionVariant(action: string) {
	if (action.includes("delete") || action.includes("remove")) {
		return "destructive" as const;
	}
	if (action.includes("create") || action.includes("add")) {
		return "default" as const;
	}
	return "outline" as const;
}

function formatAction(action: string) {
	return action.replace(/\./g, " → ");
}

function formatResourceType(resourceType: string) {
	const specialCases: Record<string, string> = { api: "API", iam: "IAM" };
	return resourceType
		.split("_")
		.map((p) => specialCases[p] ?? p)
		.join(" ");
}

export default async function OrgAuditLogsPage({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string }>;
	searchParams?: Promise<{
		cursor?: string;
		action?: string;
		resourceType?: string;
	}>;
}) {
	await requireSession();
	const { orgId } = await params;
	const sp = await searchParams;
	const cursor = sp?.cursor;

	const $api = await createServerApiClient();
	const res = await $api.GET("/admin/organizations/{orgId}/audit-logs", {
		params: {
			path: { orgId },
			query: {
				limit: "50",
				...(cursor ? { cursor } : {}),
			},
		},
	});

	if (!res.data) {
		notFound();
	}

	const { auditLogs, pagination } = res.data;

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" asChild>
					<Link href={`/organizations/${orgId}`}>
						<ArrowLeft className="h-4 w-4" />
						Back to org
					</Link>
				</Button>
			</div>

			<header className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<ClipboardList className="h-5 w-5" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
					<p className="text-sm text-muted-foreground">
						Action history for org <span className="font-mono">{orgId}</span>
					</p>
				</div>
			</header>

			<div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							<TableHead>User</TableHead>
							<TableHead>Action</TableHead>
							<TableHead>Resource Type</TableHead>
							<TableHead>Resource ID</TableHead>
							<TableHead>Details</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{auditLogs.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={6}
									className="h-24 text-center text-muted-foreground"
								>
									No audit logs found
								</TableCell>
							</TableRow>
						) : (
							auditLogs.map((log) => (
								<TableRow key={log.id}>
									<TableCell className="whitespace-nowrap text-muted-foreground text-xs">
										{formatDate(log.createdAt)}
									</TableCell>
									<TableCell>
										<div className="flex flex-col">
											<span className="text-sm font-medium">
												{log.user?.email ?? log.userId}
											</span>
											{log.user?.name && (
												<span className="text-xs text-muted-foreground">
													{log.user.name}
												</span>
											)}
										</div>
									</TableCell>
									<TableCell>
										<Badge variant={actionVariant(log.action)}>
											{formatAction(log.action)}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge variant="outline" className="text-xs">
											{formatResourceType(log.resourceType)}
										</Badge>
									</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground max-w-[140px] truncate">
										{log.resourceId ?? "—"}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
										{(log.metadata as { resourceName?: string } | null)
											?.resourceName ?? "—"}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{pagination.hasMore && pagination.nextCursor && (
				<div className="flex justify-end">
					<Button variant="outline" size="sm" asChild>
						<Link
							href={`/organizations/${orgId}/audit-logs?cursor=${pagination.nextCursor}`}
						>
							Next page →
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
