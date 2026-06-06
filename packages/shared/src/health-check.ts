export interface HealthCheckResult {
	status: "ok" | "error";
	valkey: {
		connected: boolean;
		error?: string;
	};
	database: {
		connected: boolean;
		error?: string;
	};
}

export interface HealthCheckOptions {
	skipChecks?: string[];
	timeoutMs?: number;
}

export interface HealthCheckDependencies {
	valkeyClient: {
		ping: () => Promise<string>;
	};
	db: {
		query: {
			user: {
				findFirst: (config?: object) => Promise<unknown>;
			};
		};
	};
	logger: {
		error: (message: string, error?: object | Error | undefined) => void;
	};
}

export interface HealthResponse {
	message: string;
	version: string;
	health: HealthCheckResult;
}

export class HealthChecker {
	public constructor(private dependencies: HealthCheckDependencies) {}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		const timeoutPromise = new Promise<T>((_, reject) => {
			setTimeout(
				() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
				timeoutMs,
			);
		});
		return Promise.race([promise, timeoutPromise]);
	}

	public async performHealthChecks(
		options: HealthCheckOptions = {},
	): Promise<HealthCheckResult> {
		const { skipChecks = [], timeoutMs = 3000 } = options;
		const { valkeyClient, db, logger } = this.dependencies;

		const health: HealthCheckResult = {
			status: "ok",
			valkey: { connected: false, error: undefined },
			database: { connected: false, error: undefined },
		};

		// Run health checks in parallel
		const healthChecks = await Promise.allSettled([
			// Valkey check
			skipChecks.includes("valkey")
				? Promise.resolve({ type: "valkey" as const, skipped: true })
				: this.withTimeout(
						valkeyClient
							.ping()
							.then(() => ({ type: "valkey" as const, success: true })),
						timeoutMs,
					),
			// Database check
			skipChecks.includes("database")
				? Promise.resolve({ type: "database" as const, skipped: true })
				: this.withTimeout(
						db.query.user
							.findFirst({})
							.then(() => ({ type: "database" as const, success: true })),
						timeoutMs,
					),
		]);

		// Process results
		for (const result of healthChecks) {
			if (result.status === "fulfilled") {
				const check = result.value;
				if ("skipped" in check && check.skipped) {
					// Set as connected when skipped
					if (check.type === "valkey") {
						health.valkey.connected = true;
					}
					if (check.type === "database") {
						health.database.connected = true;
					}
				} else if ("success" in check && check.success) {
					// Set as connected when successful
					if (check.type === "valkey") {
						health.valkey.connected = true;
					}
					if (check.type === "database") {
						health.database.connected = true;
					}
				}
			} else {
				// Handle failures
				const errorMessage =
					result.reason instanceof Error
						? result.reason.message
						: String(result.reason);

				// Determine which check failed based on the error or order
				// Since we know the order: [valkey, database]
				const checkIndex = healthChecks.indexOf(result);
				if (checkIndex === 0) {
					// Valkey check failed
					health.status = "error";
					health.valkey.error = errorMessage.includes("timed out")
						? "Valkey check timed out"
						: "Valkey connection failed";
					logger.error("Valkey healthcheck failed", result.reason);
				} else if (checkIndex === 1) {
					// Database check failed
					health.status = "error";
					health.database.error = errorMessage.includes("timed out")
						? "Database check timed out"
						: "Database connection failed";
					logger.error("Database healthcheck failed", result.reason);
				}
			}
		}

		return health;
	}

	public createHealthResponse(
		health: HealthCheckResult,
		version?: string,
	): { response: HealthResponse; statusCode: number } {
		const statusCode = health.status === "error" ? 503 : 200;

		// Set appropriate message based on health status
		let message = "OK";
		if (health.status === "error") {
			const failedSystems: string[] = [];
			if (health.valkey.error) {
				failedSystems.push("Valkey");
			}
			if (health.database.error) {
				failedSystems.push("Database");
			}

			if (failedSystems.length > 0) {
				message = `Service Unavailable - ${failedSystems.join(", ")} ${failedSystems.length === 1 ? "is" : "are"} unavailable`;
			} else {
				message = "Service Unavailable";
			}
		}

		return {
			response: {
				message,
				version: version ?? process.env.APP_VERSION ?? "v0.0.0-unknown",
				health,
			},
			statusCode,
		};
	}
}
