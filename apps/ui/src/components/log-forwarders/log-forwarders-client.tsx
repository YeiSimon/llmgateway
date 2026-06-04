"use client";

import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
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

import { ForwarderDialog, type ForwarderFormValues } from "./forwarder-dialog";

const TYPE_LABELS: Record<string, string> = {
	udp_syslog: "Syslog UDP",
	tcp_syslog: "Syslog TCP",
	kafka: "Kafka",
	webhook: "Webhook",
};

export function LogForwardersClient() {
	const params = useParams();
	const orgId = params.orgId as string;
	const api = useApi();
	const fetchClient = useFetchClient();

	const { data, isLoading, refetch } = api.useQuery(
		"get",
		"/orgs/{orgId}/log-forwarders",
		{},
	);

	const [showAdd, setShowAdd] = useState(false);
	const [editingForwarder, setEditingForwarder] = useState<
		NonNullable<typeof data>["forwarders"][number] | null
	>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);

	async function handleCreate(values: ForwarderFormValues) {
		await fetchClient.POST("/orgs/{orgId}/log-forwarders", {
			body: values,
		});
		await refetch();
	}

	async function handleEdit(id: string, values: ForwarderFormValues) {
		await fetchClient.PATCH("/orgs/{orgId}/log-forwarders/:id", {
			params: { path: { orgId, id } },
			body: values,
		});
		await refetch();
	}

	async function handleDelete(id: string) {
		setDeletingId(id);
		try {
			await fetchClient.DELETE("/orgs/{orgId}/log-forwarders/:id", {
				params: { path: { id } },
			});
			await refetch();
		} finally {
			setDeletingId(null);
		}
	}

	async function handleTest(id: string) {
		setTestingId(id);
		try {
			await fetchClient.POST("/orgs/{orgId}/log-forwarders/:id/test", {
				params: { path: { id } },
			});
		} finally {
			setTestingId(null);
		}
	}

	const forwarders = data?.forwarders ?? [];

	function renderTable() {
		if (isLoading) {
			return (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			);
		}

		if (forwarders.length === 0) {
			return (
				<p className="text-sm text-muted-foreground py-4 text-center">
					No log forwarders configured.
				</p>
			);
		}

		return (
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Log Types</TableHead>
						<TableHead>Sent</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="w-[120px]" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{forwarders.map((f) => (
						<TableRow key={f.id}>
							<TableCell className="font-medium">{f.name}</TableCell>
							<TableCell>
								{TYPE_LABELS[f.forwarderType] ?? f.forwarderType}
							</TableCell>
							<TableCell>
								<div className="flex gap-1 flex-wrap">
									{f.logTypes.map((lt) => (
										<Badge key={lt} variant="secondary" className="text-xs">
											{lt}
										</Badge>
									))}
								</div>
							</TableCell>
							<TableCell>{f.sentCount.toLocaleString()}</TableCell>
							<TableCell>
								<Badge variant={f.enabled ? "default" : "secondary"}>
									{f.enabled ? "enabled" : "disabled"}
								</Badge>
							</TableCell>
							<TableCell>
								<div className="flex gap-1">
									<Button
										size="icon"
										variant="ghost"
										disabled={testingId === f.id}
										onClick={() => handleTest(f.id)}
										title="Send test event"
									>
										<Send className="h-4 w-4" />
									</Button>
									<Button
										size="icon"
										variant="ghost"
										onClick={() => setEditingForwarder(f)}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										size="icon"
										variant="ghost"
										disabled={deletingId === f.id}
										onClick={() => handleDelete(f.id)}
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

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
				<div className="max-w-5xl mx-auto space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">
							Log Forwarders
						</h2>
					</div>

					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Forwarder Destinations</CardTitle>
									<CardDescription>
										Forward gateway, audit and access logs to external SIEM or
										observability systems.
									</CardDescription>
								</div>
								<Button size="sm" onClick={() => setShowAdd(true)}>
									<Plus className="h-4 w-4 mr-1" />
									Add Forwarder
								</Button>
							</div>
						</CardHeader>
						<CardContent>{renderTable()}</CardContent>
					</Card>
				</div>
			</div>

			<ForwarderDialog
				open={showAdd}
				title="Add Log Forwarder"
				onClose={() => setShowAdd(false)}
				onSubmit={handleCreate}
			/>

			{editingForwarder && (
				<ForwarderDialog
					open={true}
					title="Edit Log Forwarder"
					initialValues={{
						name: editingForwarder.name,
						enabled: editingForwarder.enabled,
						forwarderType: editingForwarder.forwarderType,
						logTypes: editingForwarder.logTypes,
					}}
					onClose={() => setEditingForwarder(null)}
					onSubmit={async (values) => {
						await handleEdit(editingForwarder.id, values);
						setEditingForwarder(null);
					}}
				/>
			)}
		</div>
	);
}
