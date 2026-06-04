"use client";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { useApi } from "@/lib/fetch-client";

export default function SetupPage() {
	const api = useApi();

	const { data: orgsData } = api.useQuery("get", "/orgs", undefined, {
		staleTime: 60 * 1000,
	});

	const org = orgsData?.organizations?.[0];

	if (!org) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return <SetupWizard orgId={org.id} orgName={org.name} />;
}
