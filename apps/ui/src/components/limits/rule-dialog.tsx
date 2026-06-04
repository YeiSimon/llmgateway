"use client";

import { useState } from "react";

import { Button } from "@/lib/components/button";
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

type SubjectKind = "user" | "api_key" | "organization" | "provider" | "model";
type Metric = "requests" | "tokens";

const WINDOW_OPTIONS = [
	{ label: "1 minute", value: 60 },
	{ label: "5 minutes", value: 300 },
	{ label: "1 hour", value: 3600 },
	{ label: "5 hours", value: 18000 },
	{ label: "1 day", value: 86400 },
	{ label: "1 week", value: 604800 },
] as const;

export interface RuleFormValues {
	subjectKind: SubjectKind;
	windowSeconds: number;
	metric: Metric;
	limit: number;
	provider?: string;
	model?: string;
}

interface RuleDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: RuleFormValues) => Promise<void>;
	initialValues?: Partial<RuleFormValues>;
	title?: string;
}

export function RuleDialog({
	open,
	onClose,
	onSubmit,
	initialValues,
	title = "Add Rate Limit Rule",
}: RuleDialogProps) {
	const [subjectKind, setSubjectKind] = useState<SubjectKind>(
		initialValues?.subjectKind ?? "organization",
	);
	const [windowSeconds, setWindowSeconds] = useState<number>(
		initialValues?.windowSeconds ?? 3600,
	);
	const [metric, setMetric] = useState<Metric>(
		initialValues?.metric ?? "requests",
	);
	const [limit, setLimit] = useState<string>(
		initialValues?.limit !== null && initialValues?.limit !== undefined
			? String(initialValues.limit)
			: "",
	);
	const [provider, setProvider] = useState(initialValues?.provider ?? "");
	const [model, setModel] = useState(initialValues?.model ?? "");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit() {
		const limitNum = parseInt(limit, 10);
		if (!limitNum || limitNum <= 0) {
			setError("Limit must be a positive number.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await onSubmit({
				subjectKind,
				windowSeconds,
				metric,
				limit: limitNum,
				provider: provider || undefined,
				model: model || undefined,
			});
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save rule.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
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
						<Label>Window</Label>
						<Select
							value={String(windowSeconds)}
							onValueChange={(v) => setWindowSeconds(Number(v))}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{WINDOW_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={String(opt.value)}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Metric</Label>
						<Select
							value={metric}
							onValueChange={(v) => setMetric(v as Metric)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="requests">Requests</SelectItem>
								<SelectItem value="tokens">Tokens</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Limit</Label>
						<Input
							type="number"
							min={1}
							value={limit}
							onChange={(e) => setLimit(e.target.value)}
							placeholder="e.g. 1000"
						/>
					</div>
					<div className="space-y-2">
						<Label>Provider (optional)</Label>
						<Input
							value={provider}
							onChange={(e) => setProvider(e.target.value)}
							placeholder="e.g. openai"
						/>
					</div>
					<div className="space-y-2">
						<Label>Model (optional)</Label>
						<Input
							value={model}
							onChange={(e) => setModel(e.target.value)}
							placeholder="e.g. gpt-4o"
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
