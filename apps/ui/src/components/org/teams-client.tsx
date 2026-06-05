"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import {
	useTeamMembers,
	useAddTeamMember,
	useUpdateTeamMember,
	useRemoveTeamMember,
} from "@/hooks/useTeam";
import { Alert, AlertDescription } from "@/lib/components/alert";
import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import { toast } from "@/lib/components/use-toast";

type Role = "owner" | "admin" | "team_manager" | "developer" | "viewer";

const ROLE_LABELS: Record<Role, string> = {
	owner: "Owner",
	admin: "Admin",
	team_manager: "Team Manager",
	developer: "Developer",
	viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
	owner: "Full access including billing and org settings",
	admin: "Manage members, projects, and provider keys",
	team_manager: "Manage team membership and roles",
	developer: "Create API keys and view projects",
	viewer: "Read-only access to logs and analytics",
};

export function TeamsClient() {
	const params = useParams();
	const organizationId = params.orgId as string;

	const { data, isLoading } = useTeamMembers(organizationId);
	const addMemberMutation = useAddTeamMember(organizationId);
	const updateMemberMutation = useUpdateTeamMember(organizationId);
	const removeMemberMutation = useRemoveTeamMember(organizationId);

	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("developer");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	const handleAddMember = async () => {
		if (!email) {
			toast({
				title: "Error",
				description: "Please enter an email address",
				variant: "destructive",
			});
			return;
		}

		await addMemberMutation.mutateAsync({
			params: { path: { organizationId } },
			body: { email, role },
		});
		toast({ title: "Success", description: "Team member added successfully" });
		setEmail("");
		setRole("developer");
		setIsAddDialogOpen(false);
	};

	const handleUpdateRole = async (memberId: string, newRole: Role) => {
		await updateMemberMutation.mutateAsync({
			params: { path: { organizationId, memberId } },
			body: { role: newRole },
		});
		toast({ title: "Success", description: "Role updated successfully" });
	};

	const handleRemoveMember = async (memberId: string, memberName: string) => {
		const confirmed = window.confirm(
			`Are you sure you want to remove ${memberName} from the team?`,
		);
		if (!confirmed) {
			return;
		}

		await removeMemberMutation.mutateAsync({
			params: { path: { organizationId, memberId } },
		});
		toast({
			title: "Success",
			description: "Team member removed successfully",
		});
	};

	const memberCount = data?.members.length ?? 0;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="max-w-4xl mx-auto space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-3xl font-bold tracking-tight">Teams</h2>
						<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
							<DialogTrigger asChild>
								<Button disabled={memberCount >= 5}>Invite Member</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Invite Team Member</DialogTitle>
									<DialogDescription>
										Add a new member to your organization and assign their role.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-4 py-4">
									<div className="space-y-2">
										<Label htmlFor="email">Email</Label>
										<Input
											id="email"
											type="email"
											placeholder="user@example.com"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="role">Role</Label>
										<Select
											value={role}
											onValueChange={(value) => setRole(value as Role)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a role" />
											</SelectTrigger>
											<SelectContent>
												{(Object.entries(ROLE_LABELS) as [Role, string][]).map(
													([value, label]) => (
														<SelectItem key={value} value={value}>
															<div>
																<div className="font-medium">{label}</div>
																<div className="text-xs text-muted-foreground">
																	{ROLE_DESCRIPTIONS[value]}
																</div>
															</div>
														</SelectItem>
													),
												)}
											</SelectContent>
										</Select>
									</div>
									<Alert>
										<AlertDescription>
											Organizations can have up to 5 team members on the free
											plan. Contact{" "}
											<a
												href="mailto:contact@llmgateway.io"
												className="underline"
											>
												contact@llmgateway.io
											</a>{" "}
											to unlock more seats.
										</AlertDescription>
									</Alert>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setIsAddDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button
										onClick={handleAddMember}
										disabled={addMemberMutation.isPending}
									>
										{addMemberMutation.isPending ? "Inviting..." : "Invite"}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Members</CardTitle>
							<CardDescription>
								{memberCount}/5 seats used — manage roles from the dropdown.
								View permission details on the{" "}
								<a
									href={`/dashboard/${organizationId}/org/roles`}
									className="underline"
								>
									Roles
								</a>{" "}
								page.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{isLoading ? (
								<div className="text-sm text-muted-foreground">Loading…</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Role</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{data?.members.map((member) => (
											<TableRow key={member.id}>
												<TableCell className="font-medium">
													{member.user.name ?? "—"}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{member.user.email}
												</TableCell>
												<TableCell>
													<Select
														value={member.role}
														onValueChange={(value) =>
															handleUpdateRole(member.id, value as Role)
														}
														disabled={updateMemberMutation.isPending}
													>
														<SelectTrigger className="w-[150px]">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{(
																Object.entries(ROLE_LABELS) as [Role, string][]
															).map(([value, label]) => (
																<SelectItem key={value} value={value}>
																	{label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell className="text-right">
													<Button
														variant="destructive"
														size="sm"
														onClick={() =>
															handleRemoveMember(
																member.id,
																member.user.name ?? member.user.email,
															)
														}
														disabled={removeMemberMutation.isPending}
													>
														Remove
													</Button>
												</TableCell>
											</TableRow>
										))}
										{memberCount === 0 && (
											<TableRow>
												<TableCell
													colSpan={4}
													className="text-center text-muted-foreground py-8"
												>
													No members yet. Invite someone to get started.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Role Overview</CardTitle>
							<CardDescription>
								The 5-tier RBAC system — assign the least privileged role that
								fits each member's responsibilities.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{(Object.entries(ROLE_LABELS) as [Role, string][]).map(
									([value, label]) => (
										<div key={value} className="flex items-start gap-3">
											<Badge variant="outline" className="mt-0.5 shrink-0">
												{label}
											</Badge>
											<span className="text-sm text-muted-foreground">
												{ROLE_DESCRIPTIONS[value]}
											</span>
										</div>
									),
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
