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
import { Switch } from "@/lib/components/switch";

type ForwarderType = "udp_syslog" | "tcp_syslog" | "kafka" | "webhook";
type LogType = "gateway" | "audit" | "access";

export interface ForwarderFormValues {
	name: string;
	enabled: boolean;
	forwarderType: ForwarderType;
	logTypes: LogType[];
	config: {
		host?: string;
		port?: number;
		brokers?: string[];
		topic?: string;
		url?: string;
		secret?: string;
		headers?: Record<string, string>;
	};
}

interface ForwarderDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: ForwarderFormValues) => Promise<void>;
	initialValues?: Partial<ForwarderFormValues>;
	title?: string;
}

const LOG_TYPE_OPTIONS: { value: LogType; label: string }[] = [
	{ value: "gateway", label: "Gateway" },
	{ value: "audit", label: "Audit" },
	{ value: "access", label: "Access" },
];

export function ForwarderDialog({
	open,
	onClose,
	onSubmit,
	initialValues,
	title = "Add Log Forwarder",
}: ForwarderDialogProps) {
	const [name, setName] = useState(initialValues?.name ?? "");
	const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
	const [forwarderType, setForwarderType] = useState<ForwarderType>(
		initialValues?.forwarderType ?? "webhook",
	);
	const [logTypes, setLogTypes] = useState<LogType[]>(
		initialValues?.logTypes ?? ["gateway"],
	);
	const [host, setHost] = useState(initialValues?.config?.host ?? "");
	const [port, setPort] = useState(
		initialValues?.config?.port !== null &&
			initialValues?.config?.port !== undefined
			? String(initialValues.config.port)
			: "",
	);
	const [brokers, setBrokers] = useState(
		initialValues?.config?.brokers?.join(", ") ?? "",
	);
	const [topic, setTopic] = useState(initialValues?.config?.topic ?? "");
	const [url, setUrl] = useState(initialValues?.config?.url ?? "");
	const [secret, setSecret] = useState(initialValues?.config?.secret ?? "");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function toggleLogType(lt: LogType) {
		setLogTypes((prev) =>
			prev.includes(lt) ? prev.filter((x) => x !== lt) : [...prev, lt],
		);
	}

	async function handleSubmit() {
		if (!name.trim()) {
			setError("Name is required.");
			return;
		}
		if (logTypes.length === 0) {
			setError("Select at least one log type.");
			return;
		}
		setError(null);
		setLoading(true);

		const config: ForwarderFormValues["config"] = {};
		if (forwarderType === "udp_syslog" || forwarderType === "tcp_syslog") {
			if (host) {
				config.host = host;
			}
			if (port) {
				config.port = parseInt(port, 10);
			}
		} else if (forwarderType === "kafka") {
			if (brokers) {
				config.brokers = brokers
					.split(",")
					.map((b) => b.trim())
					.filter(Boolean);
			}
			if (topic) {
				config.topic = topic;
			}
		} else if (forwarderType === "webhook") {
			if (url) {
				config.url = url;
			}
			if (secret) {
				config.secret = secret;
			}
		}

		try {
			await onSubmit({
				name: name.trim(),
				enabled,
				forwarderType,
				logTypes,
				config,
			});
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save forwarder.");
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
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="My Forwarder"
						/>
					</div>
					<div className="flex items-center gap-3">
						<Switch checked={enabled} onCheckedChange={setEnabled} />
						<Label>Enabled</Label>
					</div>
					<div className="space-y-2">
						<Label>Type</Label>
						<Select
							value={forwarderType}
							onValueChange={(v) => setForwarderType(v as ForwarderType)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="webhook">Webhook</SelectItem>
								<SelectItem value="udp_syslog">Syslog (UDP)</SelectItem>
								<SelectItem value="tcp_syslog">Syslog (TCP)</SelectItem>
								<SelectItem value="kafka">Kafka</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Log Types</Label>
						<div className="flex gap-4">
							{LOG_TYPE_OPTIONS.map((opt) => (
								<label
									key={opt.value}
									className="flex items-center gap-1.5 cursor-pointer text-sm"
								>
									<input
										type="checkbox"
										checked={logTypes.includes(opt.value)}
										onChange={() => toggleLogType(opt.value)}
										className="rounded"
									/>
									{opt.label}
								</label>
							))}
						</div>
					</div>
					{(forwarderType === "udp_syslog" ||
						forwarderType === "tcp_syslog") && (
						<>
							<div className="space-y-2">
								<Label>Host</Label>
								<Input
									value={host}
									onChange={(e) => setHost(e.target.value)}
									placeholder="logs.example.com"
								/>
							</div>
							<div className="space-y-2">
								<Label>Port</Label>
								<Input
									type="number"
									value={port}
									onChange={(e) => setPort(e.target.value)}
									placeholder="514"
								/>
							</div>
						</>
					)}
					{forwarderType === "kafka" && (
						<>
							<div className="space-y-2">
								<Label>Brokers (comma-separated)</Label>
								<Input
									value={brokers}
									onChange={(e) => setBrokers(e.target.value)}
									placeholder="broker1:9092, broker2:9092"
								/>
							</div>
							<div className="space-y-2">
								<Label>Topic</Label>
								<Input
									value={topic}
									onChange={(e) => setTopic(e.target.value)}
									placeholder="llm-gateway-logs"
								/>
							</div>
						</>
					)}
					{forwarderType === "webhook" && (
						<>
							<div className="space-y-2">
								<Label>URL</Label>
								<Input
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://hooks.example.com/..."
								/>
							</div>
							<div className="space-y-2">
								<Label>Secret (optional)</Label>
								<Input
									value={secret}
									onChange={(e) => setSecret(e.target.value)}
									placeholder="Signing secret"
									type="password"
								/>
							</div>
						</>
					)}
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
