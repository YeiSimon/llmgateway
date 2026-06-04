"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { Progress } from "@/lib/components/progress";
import { Skeleton } from "@/lib/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";

interface BudgetCap {
	id: string;
	subjectKind: "user" | "api_key" | "organization" | "provider" | "model";
	subjectId: string | null;
	period: "daily" | "weekly" | "monthly";
	limit: string;
	enabled: boolean;
	reason: string | null;
}

interface BudgetCapsTableProps {
	caps: BudgetCap[];
	isLoading: boolean;
	onDelete: (id: string) => Promise<void>;
}

export function BudgetCapsTable({
	caps,
	isLoading,
	onDelete,
}: BudgetCapsTableProps) {
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

	if (caps.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-4 text-center">
				No budget caps configured.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Subject</TableHead>
					<TableHead>Period</TableHead>
					<TableHead>Token Limit</TableHead>
					<TableHead>Usage</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="w-[80px]" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{caps.map((cap) => (
					<TableRow key={cap.id}>
						<TableCell className="font-medium">
							{cap.subjectKind}
							{cap.subjectId && (
								<span className="text-muted-foreground ml-1 text-xs">
									({cap.subjectId})
								</span>
							)}
						</TableCell>
						<TableCell className="capitalize">{cap.period}</TableCell>
						<TableCell>{Number(cap.limit).toLocaleString()} tokens</TableCell>
						<TableCell>
							<div className="flex items-center gap-2 min-w-[120px]">
								<Progress value={0} className="h-2 flex-1" />
								<span className="text-xs text-muted-foreground w-8">0%</span>
							</div>
						</TableCell>
						<TableCell>
							<Badge variant={cap.enabled ? "default" : "secondary"}>
								{cap.enabled ? "enabled" : "disabled"}
							</Badge>
						</TableCell>
						<TableCell>
							<div className="flex gap-1">
								<Button
									size="icon"
									variant="ghost"
									disabled={deletingId === cap.id}
									onClick={() => handleDelete(cap.id)}
								>
									<Trash2 className="h-4 w-4 text-destructive" />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
