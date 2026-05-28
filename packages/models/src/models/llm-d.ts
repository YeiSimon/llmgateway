import type { ModelDefinition } from "@/models.js";

export const llmdModels = [
	{
		id: "qwen3-27b",
		name: "Qwen3.6 27B",
		description: "Qwen3.6 27B served locally via llm-d / vLLM.",
		family: "qwen",
		releasedAt: new Date("2025-04-28"),
		providers: [
			{
				providerId: "llm-d",
				modelName: "Qwen/Qwen3.6-27B",
				inputPrice: "0",
				outputPrice: "0",
				requestPrice: "0",
				contextSize: 262144,
				maxOutput: undefined,
				streaming: true,
				vision: false,
				tools: true,
				jsonOutput: true,
				supportedParameters: ["temperature", "max_tokens", "top_p", "stream"],
				test: "only",
			},
		],
	},
] as const satisfies ModelDefinition[];
