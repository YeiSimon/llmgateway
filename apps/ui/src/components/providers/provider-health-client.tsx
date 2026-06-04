"use client";

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

import { providers } from "@llmgateway/models";

interface ProviderHealthClientProps {
	orgId: string;
}

const VISIBLE_PROVIDERS = providers.filter(
	(p) => p.id !== "llmgateway" && p.id !== "custom" && p.website !== null,
);

export function ProviderHealthClient({
	orgId: _orgId,
}: ProviderHealthClientProps) {
	const api = useApi();
	const fetchClient = useFetchClient();

	const {
		data: statesData,
		isLoading,
		error,
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

	const statusUnavailable = !!error;

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

	const getStatusBadge = (providerId: string) => {
		const key = `provider:${providerId}`;
		const state = circuitStates[key];

		if (statusUnavailable) {
			return <Badge variant="secondary">Status unavailable</Badge>;
		}

		if (state === "open") {
			return (
				<Badge variant="destructive" className="gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-current" />
					Circuit Open
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

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Provider Health</h1>
					<p className="text-muted-foreground text-sm">
						Circuit breaker status — auto-refreshes every 30s
					</p>
				</div>
				<Badge variant="secondary" className="text-xs">
					Auto-refresh: ON
				</Badge>
			</div>

			{statusUnavailable && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
					Circuit breaker state endpoint is unavailable. Provider list is shown
					below — use the Reset button to manually close a breaker if needed.
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Providers</CardTitle>
					<CardDescription>
						Reset a circuit breaker to force it back to closed state after a
						provider recovers
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Provider</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-24">Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading
								? Array.from({ length: 6 }).map((_, i) => (
										<TableRow key={i}>
											<TableCell>
												<Skeleton className="h-4 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-20" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-8 w-16" />
											</TableCell>
										</TableRow>
									))
								: VISIBLE_PROVIDERS.map((provider) => {
										const cbKey = `provider:${provider.id}`;
										const isResetting = resetting.has(cbKey);
										const result = resetResults.get(cbKey);

										return (
											<TableRow
												key={provider.id}
												className={
													circuitStates[cbKey] === "open"
														? "bg-destructive/5"
														: circuitStates[cbKey] === "half-open"
															? "bg-amber-50/50 dark:bg-amber-950/20"
															: undefined
												}
											>
												<TableCell>
													<div className="flex items-center gap-2">
														{provider.color && (
															<span
																className="h-3 w-3 rounded-full shrink-0"
																style={{ backgroundColor: provider.color }}
															/>
														)}
														<span className="font-medium">{provider.name}</span>
													</div>
												</TableCell>
												<TableCell>{getStatusBadge(provider.id)}</TableCell>
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
