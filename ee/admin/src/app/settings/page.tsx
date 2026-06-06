import Link from "next/link";

import { SystemSettingsClient } from "@/components/system-settings-client";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/require-session";
import { createServerApiClient } from "@/lib/server-api";

function SignInPrompt() {
	return (
		<div className="flex min-h-screen items-center justify-center px-4">
			<div className="w-full max-w-md text-center">
				<div className="mb-8">
					<h1 className="text-3xl font-semibold tracking-tight">
						Admin Dashboard
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Sign in to access the admin dashboard
					</p>
				</div>
				<Button asChild size="lg" className="w-full">
					<Link href="/login">Sign In</Link>
				</Button>
			</div>
		</div>
	);
}

export default async function SettingsPage() {
	await requireSession();

	const $api = await createServerApiClient();
	const { data } = await $api.GET("/admin/settings");

	if (!data) {
		return <SignInPrompt />;
	}

	return (
		<div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6 px-4 py-8 md:px-8">
			<header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">
						System Settings
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage global configuration that is published to gateway instances.
					</p>
				</div>
			</header>

			<SystemSettingsClient initialSettings={data.settings} />
		</div>
	);
}
