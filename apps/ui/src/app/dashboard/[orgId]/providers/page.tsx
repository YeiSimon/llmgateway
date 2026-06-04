import { ProviderHealthClient } from "@/components/providers/provider-health-client";

export default async function ProvidersPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;

	return <ProviderHealthClient orgId={orgId} />;
}
