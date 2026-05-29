import { HTTPException } from "hono/http-exception";

import {
	getRoundRobinValue,
	peekRoundRobinValue,
} from "@/lib/round-robin-env.js";

import {
	getProviderEnvVar,
	getProviderEnvConfig,
	type Provider,
} from "@llmgateway/models";

export interface ProviderEnvResult {
	token: string;
	configIndex: number;
	envVarName: string;
}

interface GetProviderEnvOptions {
	advanceRoundRobin?: boolean;
	excludedIndices?: ReadonlySet<number>;
	selectionScope?: string;
}

/**
 * Get provider token from environment variables with round-robin support
 * Supports comma-separated values in environment variables for load balancing
 * @param usedProvider The provider to get the token for
 * @returns Object containing the token and the config index used
 */
export function getProviderEnv(
	usedProvider: Provider,
	options: GetProviderEnvOptions = {},
): ProviderEnvResult {
	const envVar = getProviderEnvVar(usedProvider);

	if (!envVar) {
		// Provider has no required API key — check if it has an optional one (e.g. llm-d)
		const config = getProviderEnvConfig(usedProvider);
		if (!config) {
			throw new HTTPException(500, {
				message: `No environment variable set for provider: ${usedProvider}`,
			});
		}

		// Validate required non-apiKey env vars (e.g. baseUrl for llm-d)
		for (const [key, envVarName] of Object.entries(config.required)) {
			if (key === "apiKey" || !envVarName) {
				continue;
			}
			if (!process.env[envVarName]) {
				throw new HTTPException(500, {
					message: `${envVarName} environment variable is required for ${usedProvider} provider`,
				});
			}
		}

		const optionalApiKeyVar = (
			config.optional as Record<string, string | undefined> | undefined
		)?.apiKey;
		const token = optionalApiKeyVar
			? (process.env[optionalApiKeyVar] ?? "")
			: "";
		const envVarName = optionalApiKeyVar ?? "";

		// Respect excludedIndices — if index 0 is excluded (prior failure) and
		// there is no alternative, throw so the caller can fall back to another provider.
		if (options.excludedIndices?.has(0)) {
			throw new HTTPException(500, {
				message: `No available keys for provider: ${usedProvider}`,
			});
		}

		return { token, configIndex: 0, envVarName };
	}

	const envValue = process.env[envVar];
	if (!envValue) {
		throw new HTTPException(500, {
			message: `No API key set in environment for provider: ${usedProvider}`,
		});
	}

	// Validate required env vars for the provider
	const config = getProviderEnvConfig(usedProvider);
	if (config?.required) {
		for (const [key, envVarName] of Object.entries(config.required)) {
			if (key === "apiKey" || !envVarName) {
				continue;
			} // Already validated above
			if (!process.env[envVarName]) {
				throw new HTTPException(500, {
					message: `${envVarName} environment variable is required for ${usedProvider} provider`,
				});
			}
		}
	}

	const advanceRoundRobin = options.advanceRoundRobin ?? true;
	const excludedIndices = options.excludedIndices;
	const selectionScope = options.selectionScope;
	const result = advanceRoundRobin
		? getRoundRobinValue(envVar, envValue, selectionScope, excludedIndices)
		: peekRoundRobinValue(envVar, envValue, selectionScope, excludedIndices);

	return { token: result.value, configIndex: result.index, envVarName: envVar };
}
