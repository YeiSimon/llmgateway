"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
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
import { Checkbox } from "@/lib/components/checkbox";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { Separator } from "@/lib/components/separator";
import { Switch } from "@/lib/components/switch";
import { toast } from "@/lib/components/use-toast";
import { useAppConfig } from "@/lib/config";

type Provider = "oidc" | "saml" | "google" | "microsoft" | "okta" | "github";
type DefaultRole = "owner" | "admin" | "team_manager" | "developer" | "viewer";

export function SsoClient() {
	const params = useParams();
	const orgId = params.orgId as string;
	const config = useAppConfig();
	const callbackUrl = `${config.apiUrl}/api/auth/callback/oidc`;

	const [provider, setProvider] = useState<Provider>("oidc");
	const [discoveryUrl, setDiscoveryUrl] = useState("");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [showSecret, setShowSecret] = useState(false);
	const [jitProvisioning, setJitProvisioning] = useState(true);
	const [defaultRole, setDefaultRole] = useState<DefaultRole>("developer");
	const [requireSso, setRequireSso] = useState(false);
	const [requireTotp, setRequireTotp] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const handleSave = async () => {
		if (!clientId || !clientSecret) {
			toast({
				title: "Missing required fields",
				description: "Client ID and Client Secret are required.",
				variant: "destructive",
			});
			return;
		}

		setIsSaving(true);
		try {
			await fetch(`${config.apiUrl}/orgs/${orgId}/sso`, {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					clientId,
					clientSecret,
					discoveryUrl: discoveryUrl || undefined,
					jitProvisioning,
					defaultRole,
					enforced: requireSso,
					enabled: true,
				}),
			});
			setIsConnected(true);
			toast({ title: "SSO configuration saved successfully." });
		} catch {
			toast({
				title: "Failed to save SSO configuration.",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleTest = async () => {
		setIsTesting(true);
		try {
			await fetch(`${config.apiUrl}/orgs/${orgId}/sso/test`, {
				method: "POST",
				credentials: "include",
			});
			toast({ title: "SSO connection test passed." });
		} catch {
			toast({
				title: "SSO connection test failed.",
				variant: "destructive",
			});
		} finally {
			setIsTesting(false);
		}
	};

	const handleCopyCallback = () => {
		void navigator.clipboard.writeText(callbackUrl);
		toast({ title: "Callback URL copied to clipboard." });
	};

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="max-w-3xl mx-auto space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">
							SSO Configuration
						</h2>
						<Badge variant={isConnected ? "default" : "outline"}>
							{isConnected ? "Connected" : "Not configured"}
						</Badge>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Provider Settings</CardTitle>
							<CardDescription>
								Configure your identity provider to enable single sign-on for
								your organization.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="provider">Provider Type</Label>
								<Select
									value={provider}
									onValueChange={(v) => setProvider(v as Provider)}
								>
									<SelectTrigger id="provider">
										<SelectValue placeholder="Select provider" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="oidc">OIDC</SelectItem>
										<SelectItem value="saml">SAML</SelectItem>
										<SelectItem value="google">Google</SelectItem>
										<SelectItem value="microsoft">Microsoft</SelectItem>
										<SelectItem value="okta">Okta</SelectItem>
										<SelectItem value="github">GitHub</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="discovery-url">Discovery URL</Label>
								<Input
									id="discovery-url"
									type="url"
									placeholder="https://your-provider/.well-known/openid-configuration"
									value={discoveryUrl}
									onChange={(e) => setDiscoveryUrl(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="client-id">Client ID</Label>
								<Input
									id="client-id"
									placeholder="your-client-id"
									value={clientId}
									onChange={(e) => setClientId(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="client-secret">Client Secret</Label>
								<div className="relative">
									<Input
										id="client-secret"
										type={showSecret ? "text" : "password"}
										placeholder="your-client-secret"
										value={clientSecret}
										onChange={(e) => setClientSecret(e.target.value)}
										className="pr-10"
									/>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
										onClick={() => setShowSecret(!showSecret)}
									>
										{showSecret ? (
											<EyeOff className="h-4 w-4 text-muted-foreground" />
										) : (
											<Eye className="h-4 w-4 text-muted-foreground" />
										)}
									</Button>
								</div>
							</div>

							<Separator />

							<div className="space-y-2">
								<Label htmlFor="callback-url">Callback URL</Label>
								<div className="flex gap-2">
									<Input
										id="callback-url"
										value={callbackUrl}
										readOnly
										className="font-mono text-sm bg-muted"
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={handleCopyCallback}
									>
										<Copy className="h-4 w-4" />
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Add this URL as a redirect URI in your identity provider.
								</p>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Provisioning</CardTitle>
							<CardDescription>
								Configure how users are provisioned when they sign in via SSO.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label>JIT Provisioning</Label>
									<p className="text-sm text-muted-foreground">
										Automatically create accounts for new SSO users on first
										login.
									</p>
								</div>
								<Switch
									checked={jitProvisioning}
									onCheckedChange={setJitProvisioning}
								/>
							</div>

							<Separator />

							<div className="space-y-2">
								<Label htmlFor="default-role">Default Role</Label>
								<Select
									value={defaultRole}
									onValueChange={(v) => setDefaultRole(v as DefaultRole)}
								>
									<SelectTrigger id="default-role">
										<SelectValue placeholder="Select default role" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="viewer">Viewer</SelectItem>
										<SelectItem value="developer">Developer</SelectItem>
										<SelectItem value="team_manager">Team Manager</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
										<SelectItem value="owner">Owner</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Role assigned to newly provisioned SSO users.
								</p>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Enforcement</CardTitle>
							<CardDescription>
								Control authentication requirements for your organization.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Checkbox
									id="require-sso"
									checked={requireSso}
									onCheckedChange={(checked) => setRequireSso(checked === true)}
								/>
								<div>
									<label
										htmlFor="require-sso"
										className="text-sm font-medium cursor-pointer"
									>
										Require SSO for all users
									</label>
									<p className="text-xs text-muted-foreground">
										Prevents members from signing in with email/password or
										social providers.
									</p>
								</div>
							</div>

							<div className="flex items-center gap-3">
								<Checkbox
									id="require-totp"
									checked={requireTotp}
									onCheckedChange={(checked) =>
										setRequireTotp(checked === true)
									}
								/>
								<div>
									<label
										htmlFor="require-totp"
										className="text-sm font-medium cursor-pointer"
									>
										Require TOTP for non-SSO accounts
									</label>
									<p className="text-xs text-muted-foreground">
										Users not signing in via SSO must have two-factor
										authentication enabled.
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="flex gap-3">
						<Button
							variant="outline"
							onClick={handleTest}
							disabled={isTesting || !clientId || !clientSecret}
						>
							{isTesting ? "Testing..." : "Test Connection"}
						</Button>
						<Button onClick={handleSave} disabled={isSaving}>
							{isSaving ? "Saving..." : "Save Configuration"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
