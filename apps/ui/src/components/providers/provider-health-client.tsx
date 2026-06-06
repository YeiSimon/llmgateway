"use client";

import { format, subDays } from "date-fns";
import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Skeleton } from "@/lib/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import { useApi, useFetchClient } from "@/lib/fetch-client";

interface ProviderHealthClientProps {
	orgId: string;
}

// The four providers to show health metrics for
const HEALTH_PROVIDER_IDS = ["openai", "anthropic", "google", "llm-d"] as const;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	google: "Google (Gemini)",
	"llm-d": "llm-d",
};

function formatLatency(ms: number | null | undefined): string {
	if (ms === null || ms === undefined) {
		return "—";
	}
	return `${Math.round(ms)} ms`;
}

function formatRate(rate: number): string {
	return `${rate.toFixed(1)}%`;
}

function formatCount(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}M`;
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(1)}K`;
	}
	return String(count);
}

function ErrorRateBadge({ rate }: { rate: number }) {
	if (rate >= 10) {
		return <Badge variant="destructive">{formatRate(rate)}</Badge>;
	}
	if (rate >= 3) {
		return (
			<Badge variant="outline" className="border-amber-500 text-amber-600">
				{formatRate(rate)}
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="border-emerald-500 text-emerald-600">
			{formatRate(rate)}
		</Badge>
	);
}

export function ProviderHealthClient({ orgId }: ProviderHealthClientProps) {
	const api = useApi();
	const fetchClient = useFetchClient();

	const now = new Date();
	const from = format(subDays(now, 7), "yyyy-MM-dd");
	const to = format(now, "yyyy-MM-dd");

	// Fetch provider health analytics
	const {
		data: healthData,
		isLoading: isHealthLoading,
		error: healthError,
	} = api.useQuery(
		"get",
		"/analytics/provider-health",
		{
			params: {
				query: {
					organizationId: orgId,
					from,
					to,
				},
			},
		},
		{
			refetchInterval: 60_000,
			staleTime: 30_000,
		},
	);

	// Fetch circuit breaker states
	const {
		data: statesData,
		isLoading: isCbLoading,
		error: cbError,
	} = api.useQuery(
		"get",
		"/admin/circuit-breaker-states" as never,
		{} as never,
		{
			refetchInterval: 30_000,
			retry: false,
		},
	);

	const [resetting, setResetting] = useState<Set<string>>(new Set());
	const [resetResults, setResetResults] = useState<Map<string, "ok" | "error">>(
		new Map(),
	);

	const circuitStates: Record<string, string> =
		(statesData as { states?: Record<string, string> } | undefined)?.states ??
		{};

	const healthByProvider = new Map(
		(healthData?.data ?? []).map((item) => [item.provider, item]),
	);

	const cbStatusUnavailable = !!cbError;

	const handleReset = async (key: string) => {
		setResetting((prev) => new Set(prev).add(key));
		try {
			await fetchClient.POST("/circuit-breaker/{key}/reset", {
				params: { path: { key } },
			});
			setResetResults((prev) => new Map(prev).set(key, "ok"));
		} catch {
			setResetResults((prev) => new Map(prev).set(key, "error"));
		} finally {
			setResetting((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		}
	};

	const getCircuitBadge = (providerId: string) => {
		const key = `provider:${providerId}`;
		const state = circuitStates[key];

		if (cbStatusUnavailable) {
			return <Badge variant="secondary">Unavailable</Badge>;
		}

		if (state === "open") {
			return (
				<Badge variant="destructive" className="gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-current" />
					Open
				</Badge>
			);
		}

		if (state === "half-open") {
			return (
				<Badge
					variant="outline"
					className="gap-1 border-amber-500 text-amber-600"
				>
					<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
					Half-Open
				</Badge>
			);
		}

		return (
			<Badge
				variant="outline"
				className="gap-1 border-emerald-500 text-emerald-600"
			>
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
				OK
			</Badge>
		);
	};

	const isLoading = isHealthLoading || isCbLoading;

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Provider Health</h1>
					<p className="text-muted-foreground text-sm">
						Last 7 days · auto-refreshes every 60s
					</p>
				</div>
				<Badge variant="secondary" className="text-xs">
					Auto-refresh: ON
				</Badge>
			</div>

			{healthError && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
					Could not load health analytics. Latency and error-rate data may be
					unavailable.
				</div>
			)}

			{/* Health metrics table */}
			<Card>
				<CardHeader>
					<CardTitle>Health Metrics</CardTitle>
					<CardDescription>
						Request volume, error rate, throttle rate, and latency for the last
						7 days across the four core providers.
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Provider</TableHead>
								<TableHead className="text-right">Requests</TableHead>
								<TableHead className="text-right">Error Rate</TableHead>
								<TableHead className="text-right">Throttle Rate</TableHead>
								<TableHead className="text-right">Avg Latency</TableHead>
								<TableHead className="text-right">P95 Latency</TableHead>
								<TableHead>Circuit</TableHead>
								<TableHead className="w-24">Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading
								? Array.from({ length: 4 }).map((_, i) => (
										<TableRow key={i}>
											{Array.from({ length: 8 }).map((__, j) => (
												<TableCell key={j}>
													<Skeleton className="h-4 w-16" />
												</TableCell>
											))}
										</TableRow>
									))
								: HEALTH_PROVIDER_IDS.map((providerId) => {
										const health = healthByProvider.get(providerId);
										const cbKey = `provider:${providerId}`;
										const isResetting = resetting.has(cbKey);
										const result = resetResults.get(cbKey);
										const name =
											PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;

										return (
											<TableRow
												key={providerId}
												className={
													circuitStates[cbKey] === "open"
														? "bg-destructive/5"
														: circuitStates[cbKey] === "half-open"
															? "bg-amber-50/50 dark:bg-amber-950/20"
															: undefined
												}
											>
												<TableCell>
													<span className="font-medium">{name}</span>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{health ? formatCount(health.requestCount) : "—"}
												</TableCell>
												<TableCell className="text-right">
													{health ? (
														<ErrorRateBadge rate={health.errorRate} />
													) : (
														"—"
													)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{health ? formatRate(health.throttleRate) : "—"}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{health ? formatLatency(health.avgLatencyMs) : "—"}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{health ? formatLatency(health.p95LatencyMs) : "—"}
												</TableCell>
												<TableCell>{getCircuitBadge(providerId)}</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<Button
															size="sm"
															variant="outline"
															disabled={isResetting}
															onClick={() => handleReset(cbKey)}
														>
															{isResetting ? "Resetting…" : "Reset"}
														</Button>
														{result === "ok" && (
															<span className="text-xs text-emerald-600">
																✓
															</span>
														)}
														{result === "error" && (
															<span className="text-xs text-destructive">
																Failed
															</span>
														)}
													</div>
												</TableCell>
											</TableRow>
										);
									})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
