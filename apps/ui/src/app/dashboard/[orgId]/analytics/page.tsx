import { AnalyticsClient } from "@/components/analytics/analytics-client";

export default async function AnalyticsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;

	return <AnalyticsClient orgId={orgId} />;
}
