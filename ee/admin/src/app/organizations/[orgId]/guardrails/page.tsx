import { ArrowLeft, Shield, ShieldOff } from "lucide-react";
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
	});
}

function actionBadgeVariant(action: string) {
	if (action === "block") {
		return "destructive" as const;
	}
	if (action === "redact") {
		return "secondary" as const;
	}
	return "outline" as const;
}

export default async function OrgGuardrailsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	await requireSession();
	const { orgId } = await params;

	const $api = await createServerApiClient();
	const res = await $api.GET("/admin/organizations/{orgId}/guardrails", {
		params: { path: { orgId } },
	});

	if (!res.data) {
		notFound();
	}

	const { config, rules } = res.data;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
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
					<Shield className="h-5 w-5" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Guardrails</h1>
					<p className="text-sm text-muted-foreground">
						Read-only view for org <span className="font-mono">{orgId}</span>
					</p>
				</div>
			</header>

			{/* Config summary */}
			<section className="rounded-lg border border-border/60 bg-card p-5 space-y-3">
				<h2 className="text-base font-semibold">Configuration</h2>
				{config ? (
					<dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
						<div>
							<dt className="text-muted-foreground">Status</dt>
							<dd>
								{config.enabled ? (
									<Badge variant="secondary">Enabled</Badge>
								) : (
									<Badge variant="outline">
										<ShieldOff className="mr-1 h-3 w-3" />
										Disabled
									</Badge>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">PII Action</dt>
							<dd>
								<Badge
									variant={actionBadgeVariant(config.piiAction ?? "redact")}
								>
									{config.piiAction ?? "redact"}
								</Badge>
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Created</dt>
							<dd className="text-muted-foreground">
								{formatDate(config.createdAt)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Updated</dt>
							<dd className="text-muted-foreground">
								{formatDate(config.updatedAt)}
							</dd>
						</div>
					</dl>
				) : (
					<p className="text-sm text-muted-foreground">
						No guardrail configuration set for this organization.
					</p>
				)}
			</section>

			{/* Custom rules */}
			<section className="space-y-3">
				<h2 className="text-base font-semibold">
					Custom Rules{" "}
					<span className="text-muted-foreground font-normal text-sm">
						({rules.length})
					</span>
				</h2>
				<div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Priority</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rules.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="h-24 text-center text-muted-foreground"
									>
										No custom rules defined
									</TableCell>
								</TableRow>
							) : (
								rules.map((rule) => (
									<TableRow key={rule.id}>
										<TableCell className="font-medium">{rule.name}</TableCell>
										<TableCell>
											<Badge variant="outline">{rule.type}</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={actionBadgeVariant(rule.action)}>
												{rule.action}
											</Badge>
										</TableCell>
										<TableCell className="tabular-nums text-muted-foreground">
											{rule.priority}
										</TableCell>
										<TableCell>
											{rule.enabled ? (
												<Badge variant="secondary">Active</Badge>
											) : (
												<Badge variant="outline">Disabled</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(rule.createdAt)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</section>
		</div>
	);
}
