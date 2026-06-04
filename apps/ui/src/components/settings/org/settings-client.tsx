"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Label } from "@/lib/components/label";
import { Separator } from "@/lib/components/separator";
import { Switch } from "@/lib/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/lib/components/tabs";
import { useApi, useFetchClient } from "@/lib/fetch-client";

export function SettingsClient() {
	const params = useParams();
	const orgId = params.orgId as string;
	const api = useApi();
	const fetchClient = useFetchClient();

	const { data: orgsData } = api.useQuery("get", "/orgs");
	const orgData = orgsData?.organizations?.find((o) => o.id === orgId);

	const [rateLimitFailMode, setRateLimitFailMode] = useState<"open" | "closed">(
		"open",
	);
	const [savingFailMode, setSavingFailMode] = useState(false);

	async function handleFailModeToggle(closed: boolean) {
		const newMode = closed ? "closed" : "open";
		setSavingFailMode(true);
		try {
			await fetchClient.PATCH("/admin/settings", {
				body: {
					key: "rate_limit_fail_mode",
					value: newMode,
					category: "limits",
				},
			});
			setRateLimitFailMode(newMode);
		} finally {
			setSavingFailMode(false);
		}
	}

	const org = orgData ?? null;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
				<div className="max-w-3xl mx-auto space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
					</div>

					<Tabs defaultValue="general">
						<TabsList className="grid w-full grid-cols-4">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="security">Security</TabsTrigger>
							<TabsTrigger value="data">Data & Retention</TabsTrigger>
							<TabsTrigger value="notifications">Notifications</TabsTrigger>
						</TabsList>

						<TabsContent value="general" className="space-y-4 mt-4">
							<Card>
								<CardHeader>
									<CardTitle>Organization</CardTitle>
									<CardDescription>
										Basic information about your organization.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-1">
										<Label className="text-muted-foreground text-xs uppercase tracking-wide">
											Name
										</Label>
										<p className="text-sm font-medium">{org?.name ?? "—"}</p>
									</div>
									<div className="space-y-1">
										<Label className="text-muted-foreground text-xs uppercase tracking-wide">
											Plan
										</Label>
										<p className="text-sm font-medium capitalize">
											{org?.plan ?? "—"}
										</p>
									</div>
									<Separator />
									<div className="flex flex-col gap-2">
										<Link
											href={`/dashboard/${orgId}/org/billing`}
											className="text-sm text-primary underline-offset-4 hover:underline"
										>
											Manage Billing
										</Link>
										<Link
											href={`/dashboard/${orgId}/org/team`}
											className="text-sm text-primary underline-offset-4 hover:underline"
										>
											Manage Team
										</Link>
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="security" className="space-y-4 mt-4">
							<Card>
								<CardHeader>
									<CardTitle>Single Sign-On</CardTitle>
									<CardDescription>
										Configure OIDC/SAML SSO for your organization.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Link
										href="/org/sso"
										className="text-sm text-primary underline-offset-4 hover:underline"
									>
										Configure SSO
									</Link>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Two-Factor Authentication</CardTitle>
									<CardDescription>
										TOTP-based second factor for your account.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Link
										href="/settings/security"
										className="text-sm text-primary underline-offset-4 hover:underline"
									>
										Manage TOTP
									</Link>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Rate Limit Fail Mode</CardTitle>
									<CardDescription>
										When Redis is unavailable, choose whether to allow or block
										traffic.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="flex items-center gap-3">
										<Switch
											checked={rateLimitFailMode === "closed"}
											onCheckedChange={handleFailModeToggle}
											disabled={savingFailMode}
										/>
										<div className="space-y-0.5">
											<Label>
												{rateLimitFailMode === "closed"
													? "Closed (block)"
													: "Open (allow)"}
											</Label>
											<p className="text-muted-foreground text-xs">
												{rateLimitFailMode === "closed"
													? "Return 429 when Redis is down."
													: "Allow all traffic when Redis is down."}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="data" className="space-y-4 mt-4">
							<Card>
								<CardHeader>
									<CardTitle>Audit Log Retention</CardTitle>
									<CardDescription>
										Configure how long audit logs are retained.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Retention policy configuration coming soon.
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Body Capture</CardTitle>
									<CardDescription>
										Control whether request and response bodies are captured in
										logs.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Body capture settings coming soon.
									</p>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="notifications" className="space-y-4 mt-4">
							<Card>
								<CardHeader>
									<CardTitle>Email Alerts</CardTitle>
									<CardDescription>
										Receive email alerts for budget thresholds, errors, and
										security events.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Email alert configuration coming soon.
									</p>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
