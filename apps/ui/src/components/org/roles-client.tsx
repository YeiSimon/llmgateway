"use client";

import { useState } from "react";

import { Badge } from "@/lib/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Checkbox } from "@/lib/components/checkbox";
import { Separator } from "@/lib/components/separator";

type Role = "owner" | "admin" | "team_manager" | "developer" | "viewer";

interface RoleDefinition {
	id: Role;
	label: string;
	description: string;
	permissions: Record<string, boolean>;
}

const PERMISSION_LABELS: Record<string, string> = {
	manage_billing: "Manage Billing",
	manage_team: "Manage Team Members",
	manage_sso: "Configure SSO",
	manage_org_settings: "Organization Settings",
	create_projects: "Create Projects",
	delete_projects: "Delete Projects",
	manage_provider_keys: "Manage Provider Keys",
	create_api_keys: "Create API Keys",
	delete_api_keys: "Delete API Keys",
	view_activity: "View Activity Logs",
	view_analytics: "View Analytics",
	manage_guardrails: "Manage Guardrails",
};

const ROLES: RoleDefinition[] = [
	{
		id: "owner",
		label: "Owner",
		description:
			"Full access to all features including billing, team management, and organization settings. Typically the account creator.",
		permissions: {
			manage_billing: true,
			manage_team: true,
			manage_sso: true,
			manage_org_settings: true,
			create_projects: true,
			delete_projects: true,
			manage_provider_keys: true,
			create_api_keys: true,
			delete_api_keys: true,
			view_activity: true,
			view_analytics: true,
			manage_guardrails: true,
		},
	},
	{
		id: "admin",
		label: "Admin",
		description:
			"Can manage team members, projects, API keys, and provider keys. Cannot access billing or modify owners.",
		permissions: {
			manage_billing: false,
			manage_team: true,
			manage_sso: true,
			manage_org_settings: true,
			create_projects: true,
			delete_projects: true,
			manage_provider_keys: true,
			create_api_keys: true,
			delete_api_keys: true,
			view_activity: true,
			view_analytics: true,
			manage_guardrails: true,
		},
	},
	{
		id: "team_manager",
		label: "Team Manager",
		description:
			"Can manage team membership and roles but cannot access billing or organization-level settings.",
		permissions: {
			manage_billing: false,
			manage_team: true,
			manage_sso: false,
			manage_org_settings: false,
			create_projects: false,
			delete_projects: false,
			manage_provider_keys: false,
			create_api_keys: true,
			delete_api_keys: false,
			view_activity: true,
			view_analytics: true,
			manage_guardrails: false,
		},
	},
	{
		id: "developer",
		label: "Developer",
		description:
			"Can view projects and create API keys for their own use. Cannot modify team or organization settings.",
		permissions: {
			manage_billing: false,
			manage_team: false,
			manage_sso: false,
			manage_org_settings: false,
			create_projects: false,
			delete_projects: false,
			manage_provider_keys: false,
			create_api_keys: true,
			delete_api_keys: false,
			view_activity: true,
			view_analytics: true,
			manage_guardrails: false,
		},
	},
	{
		id: "viewer",
		label: "Viewer",
		description:
			"Read-only access. Can view activity logs and analytics but cannot create or modify any resources.",
		permissions: {
			manage_billing: false,
			manage_team: false,
			manage_sso: false,
			manage_org_settings: false,
			create_projects: false,
			delete_projects: false,
			manage_provider_keys: false,
			create_api_keys: false,
			delete_api_keys: false,
			view_activity: true,
			view_analytics: true,
			manage_guardrails: false,
		},
	},
];

export function RolesClient() {
	const [selectedRole, setSelectedRole] = useState<Role>("owner");
	const activeRole = ROLES.find((r) => r.id === selectedRole)!;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="max-w-5xl mx-auto space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">Roles</h2>
						<Badge variant="outline" className="text-xs">
							Custom roles coming soon (Enterprise)
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">
						Built-in roles define what members of your organization can do.
						Select a role to see its permissions.
					</p>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<Card className="md:col-span-1">
							<CardHeader>
								<CardTitle className="text-base">Built-in Roles</CardTitle>
							</CardHeader>
							<CardContent className="p-0">
								<ul>
									{ROLES.map((role, index) => (
										<li key={role.id}>
											{index > 0 && <Separator />}
											<button
												type="button"
												className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
													selectedRole === role.id ? "bg-muted" : ""
												}`}
												onClick={() => setSelectedRole(role.id)}
											>
												<div className="font-medium text-sm">{role.label}</div>
												<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
													{role.description}
												</div>
											</button>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>

						<Card className="md:col-span-2">
							<CardHeader>
								<CardTitle className="text-base">
									{activeRole.label} Permissions
								</CardTitle>
								<p className="text-sm text-muted-foreground">
									{activeRole.description}
								</p>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{Object.entries(activeRole.permissions).map(
										([key, allowed]) => (
											<div key={key} className="flex items-center gap-2">
												<Checkbox
													id={`${activeRole.id}-${key}`}
													checked={allowed}
													disabled
													aria-readonly
												/>
												<label
													htmlFor={`${activeRole.id}-${key}`}
													className="text-sm cursor-default"
												>
													{PERMISSION_LABELS[key] ?? key}
												</label>
											</div>
										),
									)}
								</div>
								<p className="text-xs text-muted-foreground mt-4">
									Built-in role permissions are read-only. Custom roles with
									granular permissions are coming soon for Enterprise plans.
								</p>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
