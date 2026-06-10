import { closeDatabase, runMigrations } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

async function main() {
	try {
		await runMigrations();
		logger.info("Migration job completed successfully");
	} finally {
		await closeDatabase();
	}
}

void main()
	.then(() => process.exit(0))
	.catch((err) => {
		process.stderr.write(String(err) + "\n");
		process.exit(1);
	});
