"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/lib/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Label } from "@/lib/components/label";
import { Separator } from "@/lib/components/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/lib/components/tabs";
import { useApi } from "@/lib/fetch-client";

export function SettingsClient() {
	const params = useParams();
	const orgId = params.orgId as string;
	const api = useApi();

	const { data: orgsData } = api.useQuery("get", "/orgs");
	const orgData = orgsData?.organizations?.find((o) => o.id === orgId);

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
										When Valkey is unavailable, the gateway falls back to the
										platform-wide fail mode.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col gap-3">
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant="outline">Managed in Admin</Badge>
											<Badge variant="secondary">Global setting</Badge>
										</div>
										<div className="space-y-1">
											<Label>Platform control</Label>
											<p className="text-sm text-muted-foreground">
												This setting is configured in the admin dashboard and
												applies to all gateway traffic. It is not editable from
												organization settings.
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
