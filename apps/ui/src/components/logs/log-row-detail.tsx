"use client";

import { Check, Copy } from "lucide-react";
import { useState, useCallback } from "react";

import { Badge } from "@/lib/components/badge";
import { ScrollArea } from "@/lib/components/scroll-area";
import { Separator } from "@/lib/components/separator";

import type { paths } from "@/lib/api/v1";

type GatewayLog =
	paths["/logs"]["get"]["responses"][200]["content"]["application/json"]["logs"][number];

interface LogRowDetailProps {
	log: GatewayLog;
}

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard not available
		}
	}, [value]);

	return (
		<button
			type="button"
			onClick={() => void handleCopy()}
			className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
		>
			{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
			{copied ? "Copied" : "Copy"}
		</button>
	);
}

function formatCost(cost: number | null): string {
	if (cost === null) {
		return "—";
	}
	if (cost === 0) {
		return "$0.00";
	}
	if (cost < 0.0001) {
		return `$${cost.toFixed(8)}`;
	}
	if (cost < 0.01) {
		return `$${cost.toFixed(6)}`;
	}
	return `$${cost.toFixed(4)}`;
}

export function LogRowDetail({ log }: LogRowDetailProps) {
	const requestBody = {
		model: log.requestedModel,
		...(log.requestedProvider ? { provider: log.requestedProvider } : {}),
		messages: log.messages,
		...(log.temperature !== null ? { temperature: log.temperature } : {}),
		...(log.maxTokens !== null ? { max_tokens: log.maxTokens } : {}),
		...(log.topP !== null ? { top_p: log.topP } : {}),
		...(log.tools ? { tools: log.tools } : {}),
	};

	const routingInfo = log.routingMetadata;

	return (
		<div className="p-4 space-y-4 bg-muted/20 border-t">
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h4 className="text-sm font-semibold">Request Body</h4>
						<CopyButton value={JSON.stringify(requestBody, null, 2)} />
					</div>
					<ScrollArea className="h-48 rounded-md border bg-background">
						<pre className="p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
							{JSON.stringify(requestBody, null, 2)}
						</pre>
					</ScrollArea>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h4 className="text-sm font-semibold">Response</h4>
						{log.content && <CopyButton value={log.content} />}
					</div>
					<ScrollArea className="h-48 rounded-md border bg-background">
						<pre className="p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
							{(log.content ?? log.errorDetails)
								? JSON.stringify(log.errorDetails, null, 2)
								: "—"}
						</pre>
					</ScrollArea>
				</div>
			</div>

			<Separator />

			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
				<div>
					<p className="text-xs text-muted-foreground mb-1">Used Provider</p>
					<p className="font-medium">{log.usedProvider}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground mb-1">Used Model</p>
					<p className="font-medium">{log.usedModel}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground mb-1">Cost Breakdown</p>
					<div className="space-y-0.5 text-xs">
						<div className="flex justify-between gap-2">
							<span className="text-muted-foreground">Input:</span>
							<span>{formatCost(log.inputCost)}</span>
						</div>
						<div className="flex justify-between gap-2">
							<span className="text-muted-foreground">Output:</span>
							<span>{formatCost(log.outputCost)}</span>
						</div>
						<div className="flex justify-between gap-2 font-medium">
							<span>Total:</span>
							<span>{formatCost(log.cost)}</span>
						</div>
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground mb-1">Tokens</p>
					<div className="space-y-0.5 text-xs">
						<div className="flex justify-between gap-2">
							<span className="text-muted-foreground">Prompt:</span>
							<span>{log.promptTokens ?? "—"}</span>
						</div>
						<div className="flex justify-between gap-2">
							<span className="text-muted-foreground">Completion:</span>
							<span>{log.completionTokens ?? "—"}</span>
						</div>
						<div className="flex justify-between gap-2">
							<span className="text-muted-foreground">Total:</span>
							<span>{log.totalTokens ?? "—"}</span>
						</div>
					</div>
				</div>
			</div>

			{routingInfo && (
				<>
					<Separator />
					<div className="space-y-2">
						<h4 className="text-sm font-semibold">Routing Info</h4>
						<div className="flex flex-wrap gap-2 text-xs">
							{routingInfo.availableProviders && (
								<div>
									<span className="text-muted-foreground mr-1">Available:</span>
									{routingInfo.availableProviders.map((p) => (
										<Badge key={p} variant="outline" className="mr-1 text-xs">
											{p}
										</Badge>
									))}
								</div>
							)}
							{routingInfo.selectionReason && (
								<div>
									<span className="text-muted-foreground mr-1">Reason:</span>
									<span>{routingInfo.selectionReason}</span>
								</div>
							)}
						</div>
						{routingInfo.providerScores &&
							routingInfo.providerScores.length > 0 && (
								<div className="rounded-md border bg-background overflow-hidden">
									<table className="w-full text-xs">
										<thead className="bg-muted/50">
											<tr>
												<th className="px-3 py-1.5 text-left font-medium">
													Provider
												</th>
												<th className="px-3 py-1.5 text-left font-medium">
													Score
												</th>
												<th className="px-3 py-1.5 text-left font-medium">
													Latency
												</th>
												<th className="px-3 py-1.5 text-left font-medium">
													Uptime
												</th>
												<th className="px-3 py-1.5 text-left font-medium">
													Failed
												</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{routingInfo.providerScores.map((ps, i) => (
												<tr key={i} className={ps.failed ? "opacity-50" : ""}>
													<td className="px-3 py-1.5">{ps.providerId}</td>
													<td className="px-3 py-1.5">{ps.score.toFixed(2)}</td>
													<td className="px-3 py-1.5">
														{ps.latency !== undefined ? `${ps.latency}ms` : "—"}
													</td>
													<td className="px-3 py-1.5">
														{ps.uptime !== undefined
															? `${(ps.uptime * 100).toFixed(0)}%`
															: "—"}
													</td>
													<td className="px-3 py-1.5">
														{ps.failed ? (
															<Badge variant="destructive" className="text-xs">
																failed
															</Badge>
														) : (
															<Badge variant="outline" className="text-xs">
																ok
															</Badge>
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
					</div>
				</>
			)}

			<Separator />

			<div className="flex flex-wrap gap-4 items-center text-sm">
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Trace ID:</span>
					<span className="font-mono text-xs">
						{log.traceId ?? log.requestId}
					</span>
					<CopyButton value={log.traceId ?? log.requestId} />
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Log ID:</span>
					<span className="font-mono text-xs">{log.id}</span>
					<CopyButton value={log.id} />
				</div>
				{log.duration !== undefined && (
					<div>
						<span className="text-xs text-muted-foreground mr-1">
							Duration:
						</span>
						<span className="text-xs">{log.duration}ms</span>
					</div>
				)}
				{log.cached && (
					<Badge variant="secondary" className="text-xs">
						cached
					</Badge>
				)}
				{log.streamed && (
					<Badge variant="outline" className="text-xs">
						streamed
					</Badge>
				)}
				{log.estimatedCost && (
					<Badge variant="outline" className="text-xs">
						estimated cost
					</Badge>
				)}
			</div>
		</div>
	);
}
