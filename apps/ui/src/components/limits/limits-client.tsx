"use client";

import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/lib/components/dialog";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { useApi, useFetchClient } from "@/lib/fetch-client";

import { BudgetCapsTable } from "./budget-caps-table";
import { RuleDialog, type RuleFormValues } from "./rule-dialog";
import { SlidingWindowRulesTable } from "./sliding-window-rules-table";

type SubjectKind = "user" | "api_key" | "organization" | "provider" | "model";

function BudgetCapDialog({
	open,
	orgId,
	onClose,
	onCreated,
}: {
	open: boolean;
	orgId: string;
	onClose: () => void;
	onCreated: () => void;
}) {
	const fetchClient = useFetchClient();
	const [subjectKind, setSubjectKind] = useState<SubjectKind>("organization");
	const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">(
		"monthly",
	);
	const [limit, setLimit] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit() {
		const limitNum = parseFloat(limit);
		if (!limitNum || limitNum <= 0) {
			setError("Limit must be a positive number.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await fetchClient.POST("/rate-limits/budget-caps", {
				body: {
					organizationId: orgId,
					subjectKind,
					period,
					limit: String(limitNum),
				},
			});
			onCreated();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create budget cap.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add Budget Cap</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Subject Kind</Label>
						<Select
							value={subjectKind}
							onValueChange={(v) => setSubjectKind(v as SubjectKind)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="user">User</SelectItem>
								<SelectItem value="api_key">API Key</SelectItem>
								<SelectItem value="organization">Organization</SelectItem>
								<SelectItem value="provider">Provider</SelectItem>
								<SelectItem value="model">Model</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Period</Label>
						<Select
							value={period}
							onValueChange={(v) =>
								setPeriod(v as "daily" | "weekly" | "monthly")
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="daily">Daily</SelectItem>
								<SelectItem value="weekly">Weekly</SelectItem>
								<SelectItem value="monthly">Monthly</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Token Limit</Label>
						<Input
							type="number"
							min={1}
							value={limit}
							onChange={(e) => setLimit(e.target.value)}
							placeholder="e.g. 1000000"
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={loading}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading}>
						{loading ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function LimitsClient() {
	const params = useParams();
	const orgId = params.orgId as string;
	const api = useApi();
	const fetchClient = useFetchClient();

	const {
		data: rulesData,
		isLoading: rulesLoading,
		refetch: refetchRules,
	} = api.useQuery("get", "/rate-limits", {
		params: { query: { organizationId: orgId } },
	});

	const {
		data: capsData,
		isLoading: capsLoading,
		refetch: refetchCaps,
	} = api.useQuery("get", "/rate-limits/budget-caps", {
		params: { query: { organizationId: orgId } },
	});

	const [showAddRule, setShowAddRule] = useState(false);
	const [showAddCap, setShowAddCap] = useState(false);

	async function handleCreateRule(values: RuleFormValues) {
		await fetchClient.POST("/rate-limits", {
			body: {
				organizationId: orgId,
				...values,
			},
		});
		await refetchRules();
	}

	async function handleEditRule(id: string, values: RuleFormValues) {
		await fetchClient.PATCH("/rate-limits/:id", {
			params: { path: { id } },
			body: values,
		});
		await refetchRules();
	}

	async function handleDeleteRule(id: string) {
		await fetchClient.DELETE("/rate-limits/:id", {
			params: { path: { id } },
		});
		await refetchRules();
	}

	async function handleDeleteCap(id: string) {
		await fetchClient.DELETE("/rate-limits/budget-caps/:id", {
			params: { path: { id } },
		});
		await refetchCaps();
	}

	const rules = rulesData?.rules ?? [];
	const caps = capsData?.caps ?? [];

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
				<div className="max-w-5xl mx-auto space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">
							Rate Limits & Budgets
						</h2>
					</div>

					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Sliding-Window Rate Limits</CardTitle>
									<CardDescription>
										Per-subject request and token rate limits across
										configurable time windows.
									</CardDescription>
								</div>
								<Button size="sm" onClick={() => setShowAddRule(true)}>
									<Plus className="h-4 w-4 mr-1" />
									Add Rule
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<SlidingWindowRulesTable
								rules={rules}
								isLoading={rulesLoading}
								onEdit={handleEditRule}
								onDelete={handleDeleteRule}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Budget Caps</CardTitle>
									<CardDescription>
										Calendar-period token budget caps per subject.
									</CardDescription>
								</div>
								<Button size="sm" onClick={() => setShowAddCap(true)}>
									<Plus className="h-4 w-4 mr-1" />
									Add Cap
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<BudgetCapsTable
								caps={caps}
								isLoading={capsLoading}
								onDelete={handleDeleteCap}
							/>
						</CardContent>
					</Card>
				</div>
			</div>

			<RuleDialog
				open={showAddRule}
				onClose={() => setShowAddRule(false)}
				onSubmit={handleCreateRule}
			/>

			<BudgetCapDialog
				open={showAddCap}
				orgId={orgId}
				onClose={() => setShowAddCap(false)}
				onCreated={() => refetchCaps()}
			/>
		</div>
	);
}
