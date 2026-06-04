"use client";

import { format, subDays } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";

import { DateRangePicker } from "@/components/date-range-picker";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { useApi } from "@/lib/fetch-client";

interface LogFiltersProps {
	orgId: string;
}

export function LogFilters({ orgId }: LogFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { buildOrgUrl } = useDashboardNavigation();
	const api = useApi();

	const { data: projectsData } = api.useQuery("get", "/orgs/{id}/projects", {
		params: { path: { id: orgId } },
	});

	const projects =
		projectsData?.projects.filter((p) => p.status !== "deleted") ?? [];

	const projectId = searchParams.get("projectId") ?? "all";
	const provider = searchParams.get("provider") ?? "all";
	const status = searchParams.get("status") ?? "all";

	const updateParam = (key: string, value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (value && value !== "all") {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		router.push(`${buildOrgUrl("logs")}?${params.toString()}`, {
			scroll: false,
		});
	};

	const fromParam = searchParams.get("from");
	const toParam = searchParams.get("to");
	const fromLabel = fromParam
		? format(new Date(fromParam + "T00:00:00"), "MMM d, yyyy")
		: format(subDays(new Date(), 6), "MMM d, yyyy");
	const toLabel = toParam
		? format(new Date(toParam + "T00:00:00"), "MMM d, yyyy")
		: format(new Date(), "MMM d, yyyy");

	void fromLabel;
	void toLabel;

	return (
		<div className="flex flex-wrap gap-3 items-center">
			<DateRangePicker buildUrl={buildOrgUrl} path="logs" />

			<Select
				value={projectId}
				onValueChange={(v) => updateParam("projectId", v)}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="All Projects" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Projects</SelectItem>
					{projects.map((p) => (
						<SelectItem key={p.id} value={p.id}>
							{p.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				value={provider}
				onValueChange={(v) => updateParam("provider", v)}
			>
				<SelectTrigger className="w-[160px]">
					<SelectValue placeholder="All Providers" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Providers</SelectItem>
					<SelectItem value="openai">OpenAI</SelectItem>
					<SelectItem value="anthropic">Anthropic</SelectItem>
					<SelectItem value="google">Google</SelectItem>
					<SelectItem value="mistral">Mistral</SelectItem>
					<SelectItem value="cohere">Cohere</SelectItem>
					<SelectItem value="groq">Groq</SelectItem>
					<SelectItem value="together">Together</SelectItem>
					<SelectItem value="perplexity">Perplexity</SelectItem>
				</SelectContent>
			</Select>

			<Select value={status} onValueChange={(v) => updateParam("status", v)}>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Status</SelectItem>
					<SelectItem value="success">200 Success</SelectItem>
					<SelectItem value="rate_limited">429 Rate Limited</SelectItem>
					<SelectItem value="error">500 Error</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
