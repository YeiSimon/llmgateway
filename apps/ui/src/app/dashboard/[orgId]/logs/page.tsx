import { Suspense } from "react";

import { LogExplorerClient } from "@/components/logs/log-explorer-client";

export default async function LogsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;

	return (
		<Suspense>
			<LogExplorerClient orgId={orgId} />
		</Suspense>
	);
}
