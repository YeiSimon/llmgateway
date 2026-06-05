import { ArrowLeft, ShieldAlert } from "lucide-react";
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
	if (action === "blocked") {
		return "destructive" as const;
	}
	if (action === "redacted") {
		return "secondary" as const;
	}
	return "outline" as const;
}

export default async function OrgSecurityEventsPage({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string }>;
	searchParams?: Promise<{ cursor?: string }>;
}) {
	await requireSession();
	const { orgId } = await params;
	const sp = await searchParams;
	const cursor = sp?.cursor;

	const $api = await createServerApiClient();
	const res = await $api.GET("/admin/organizations/{orgId}/violations", {
		params: {
			path: { orgId },
			query: { limit: "50", ...(cursor ? { cursor } : {}) },
		},
	});

	if (!res.data) {
		notFound();
	}

	const { violations, hasMore, nextCursor } = res.data;

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
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
					<ShieldAlert className="h-5 w-5" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Security Events
					</h1>
					<p className="text-sm text-muted-foreground">
						Guardrail violations for org{" "}
						<span className="font-mono">{orgId}</span>
					</p>
				</div>
			</header>

			<div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							<TableHead>Rule</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Action</TableHead>
							<TableHead>Model</TableHead>
							<TableHead>API Key</TableHead>
							<TableHead>Pattern</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{violations.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={7}
									className="h-24 text-center text-muted-foreground"
								>
									No violations recorded
								</TableCell>
							</TableRow>
						) : (
							violations.map((v) => (
								<TableRow key={v.id}>
									<TableCell className="whitespace-nowrap text-muted-foreground text-xs">
										{formatDate(v.createdAt)}
									</TableCell>
									<TableCell className="font-medium max-w-[160px] truncate">
										{v.ruleName}
									</TableCell>
									<TableCell>
										<Badge variant="outline">{v.category}</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={actionVariant(v.actionTaken)}>
											{v.actionTaken}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{v.model ?? "—"}
									</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">
										{v.apiKeyId ?? "—"}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
										{v.matchedPattern ?? "—"}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{hasMore && nextCursor && (
				<div className="flex justify-end">
					<Button variant="outline" size="sm" asChild>
						<Link
							href={`/organizations/${orgId}/security-events?cursor=${nextCursor}`}
						>
							Next page →
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
