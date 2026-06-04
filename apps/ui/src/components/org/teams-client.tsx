"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";

export function TeamsClient() {
	const params = useParams();
	const orgId = params.orgId as string;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
				<div className="max-w-3xl mx-auto space-y-4">
					<h2 className="text-3xl font-bold tracking-tight">Teams</h2>

					<Card>
						<CardHeader>
							<CardTitle>Teams feature coming soon</CardTitle>
							<CardDescription>
								Teams allow you to group members and scope budget caps and rate
								limits per team, giving you fine-grained control over resource
								allocation within your organization.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-muted-foreground">
								With Teams you will be able to:
							</p>
							<ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
								<li>Create named teams and assign members to them</li>
								<li>Set per-team token budgets (daily, weekly, monthly)</li>
								<li>Apply rate limits scoped to individual teams</li>
								<li>Track usage and spending broken down by team</li>
							</ul>
							<Button variant="outline" asChild>
								<Link href={`/dashboard/${orgId}/org/limits`}>
									Learn more about limits
								</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
