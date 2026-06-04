"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { Skeleton } from "@/lib/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";

import { RuleDialog, type RuleFormValues } from "./rule-dialog";

const WINDOW_LABELS: Record<number, string> = {
	60: "1m",
	300: "5m",
	3600: "1h",
	18000: "5h",
	86400: "1d",
	604800: "1w",
};

interface RateLimitRule {
	id: string;
	subjectKind: "user" | "api_key" | "organization" | "provider" | "model";
	subjectId: string | null;
	windowSeconds: number;
	metric: "requests" | "tokens";
	limit: number;
	provider: string | null;
	model: string | null;
	enabled: boolean;
	reason: string | null;
}

interface SlidingWindowRulesTableProps {
	rules: RateLimitRule[];
	isLoading: boolean;
	onEdit: (id: string, values: RuleFormValues) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}

export function SlidingWindowRulesTable({
	rules,
	isLoading,
	onEdit,
	onDelete,
}: SlidingWindowRulesTableProps) {
	const [editingRule, setEditingRule] = useState<RateLimitRule | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	async function handleDelete(id: string) {
		setDeletingId(id);
		try {
			await onDelete(id);
		} finally {
			setDeletingId(null);
		}
	}

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	if (rules.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-4 text-center">
				No rate limit rules configured.
			</p>
		);
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Subject</TableHead>
						<TableHead>Window</TableHead>
						<TableHead>Metric</TableHead>
						<TableHead>Limit</TableHead>
						<TableHead>Scope</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="w-[80px]" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{rules.map((rule) => (
						<TableRow key={rule.id}>
							<TableCell className="font-medium">
								{rule.subjectKind}
								{rule.subjectId && (
									<span className="text-muted-foreground ml-1 text-xs">
										({rule.subjectId})
									</span>
								)}
							</TableCell>
							<TableCell>
								{WINDOW_LABELS[rule.windowSeconds] ?? `${rule.windowSeconds}s`}
							</TableCell>
							<TableCell>{rule.metric}</TableCell>
							<TableCell>{rule.limit.toLocaleString()}</TableCell>
							<TableCell>
								{rule.provider || rule.model ? (
									<span className="text-xs">
										{[rule.provider, rule.model].filter(Boolean).join(" / ")}
									</span>
								) : (
									<span className="text-muted-foreground text-xs">all</span>
								)}
							</TableCell>
							<TableCell>
								<Badge variant={rule.enabled ? "default" : "secondary"}>
									{rule.enabled ? "enabled" : "disabled"}
								</Badge>
							</TableCell>
							<TableCell>
								<div className="flex gap-1">
									<Button
										size="icon"
										variant="ghost"
										onClick={() => setEditingRule(rule)}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										size="icon"
										variant="ghost"
										disabled={deletingId === rule.id}
										onClick={() => handleDelete(rule.id)}
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{editingRule && (
				<RuleDialog
					open={true}
					title="Edit Rate Limit Rule"
					initialValues={{
						subjectKind: editingRule.subjectKind,
						windowSeconds: editingRule.windowSeconds,
						metric: editingRule.metric,
						limit: editingRule.limit,
						provider: editingRule.provider ?? undefined,
						model: editingRule.model ?? undefined,
					}}
					onClose={() => setEditingRule(null)}
					onSubmit={async (values) => {
						await onEdit(editingRule.id, values);
						setEditingRule(null);
					}}
				/>
			)}
		</>
	);
}
