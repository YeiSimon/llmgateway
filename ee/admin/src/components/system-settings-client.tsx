"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useFetchClient } from "@/lib/fetch-client";

interface SystemSetting {
	key: string;
	value?: unknown;
	category: "gateway" | "security" | "audit" | "retention" | "limits";
	updatedAt: string;
	updatedBy: string | null;
}

interface SystemSettingsClientProps {
	initialSettings: SystemSetting[];
}

function formatSettingValue(value: unknown): string {
	if (typeof value === "undefined") {
		return "undefined";
	}
	if (value === null) {
		return "null";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return JSON.stringify(value, null, 2);
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function categoryBadgeVariant(category: SystemSetting["category"]) {
	switch (category) {
		case "gateway":
			return "default" as const;
		case "limits":
			return "secondary" as const;
		case "security":
			return "destructive" as const;
		case "audit":
			return "outline" as const;
		case "retention":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
}

export function SystemSettingsClient({
	initialSettings,
}: SystemSettingsClientProps) {
	const fetchClient = useFetchClient();
	const [settings, setSettings] = useState(initialSettings);
	const [savingRateLimitFailMode, setSavingRateLimitFailMode] = useState(false);

	const rateLimitFailModeSetting = useMemo(
		() => settings.find((setting) => setting.key === "rate_limit_fail_mode"),
		[settings],
	);

	const rateLimitFailMode = (() => {
		const value = rateLimitFailModeSetting?.value;
		return value === "closed" ? "closed" : "open";
	})();

	async function handleRateLimitFailModeChange(value: string) {
		if (value !== "open" && value !== "closed") {
			return;
		}

		if (value === rateLimitFailMode) {
			return;
		}

		setSavingRateLimitFailMode(true);
		try {
			await fetchClient.PATCH("/admin/settings", {
				body: {
					key: "rate_limit_fail_mode",
					value,
					category: "limits",
				},
			});

			const now = new Date().toISOString();
			setSettings((current) => {
				const next = current.filter(
					(setting) => setting.key !== "rate_limit_fail_mode",
				);
				next.unshift({
					key: "rate_limit_fail_mode",
					value,
					category: "limits",
					updatedAt: now,
					updatedBy: rateLimitFailModeSetting?.updatedBy ?? null,
				});
				return next;
			});

			toast.success("System setting updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update setting",
			);
		} finally {
			setSavingRateLimitFailMode(false);
		}
	}

	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
			<Card>
				<CardHeader>
					<CardTitle>Rate Limit Fail Mode</CardTitle>
					<CardDescription>
						Choose how the gateway behaves when Valkey is unavailable.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">Global</Badge>
						<Badge variant="secondary">Platform control</Badge>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rate-limit-fail-mode">Fail mode</Label>
						<Select
							name="rate-limit-fail-mode"
							value={rateLimitFailMode}
							onValueChange={handleRateLimitFailModeChange}
							disabled={savingRateLimitFailMode}
						>
							<SelectTrigger id="rate-limit-fail-mode" className="w-full">
								<SelectValue placeholder="Choose mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="open">Open</SelectItem>
								<SelectItem value="closed">Closed</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-sm text-muted-foreground">
							{rateLimitFailMode === "closed"
								? "Requests are rejected when Valkey cannot be reached."
								: "Requests continue when Valkey cannot be reached."}
						</p>
					</div>
					<div className="space-y-1 text-sm">
						<p className="text-muted-foreground">
							{rateLimitFailModeSetting
								? `Last updated ${formatDate(rateLimitFailModeSetting.updatedAt)}`
								: "No persisted value found yet; the gateway defaults to open."}
						</p>
						<p className="text-muted-foreground">
							This change publishes immediately to all gateway instances.
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>All System Settings</CardTitle>
					<CardDescription>
						Every setting currently stored in `system_settings`.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-hidden rounded-lg border border-border/60">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Key</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Value</TableHead>
									<TableHead>Updated</TableHead>
									<TableHead>Updated By</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{settings.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={5}
											className="h-24 text-center text-muted-foreground"
										>
											No system settings configured
										</TableCell>
									</TableRow>
								) : (
									settings.map((setting) => (
										<TableRow key={setting.key}>
											<TableCell className="font-medium">
												{setting.key}
											</TableCell>
											<TableCell>
												<Badge variant={categoryBadgeVariant(setting.category)}>
													{setting.category}
												</Badge>
											</TableCell>
											<TableCell className="max-w-[28rem] whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
												{formatSettingValue(setting.value)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDate(setting.updatedAt)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{setting.updatedBy ?? "system"}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
