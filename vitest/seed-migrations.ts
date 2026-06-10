/**
 * Emergency recovery script: seeds drizzle.__drizzle_migrations with all entries
 * from the repo journal that are not yet recorded in the production database.
 *
 * Use this when schema was applied via `drizzle-kit push` (bypassing the migration
 * runner), leaving drizzle.__drizzle_migrations out of sync with the actual schema.
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   kubectl port-forward -n llmgateway svc/llmgateway-postgresql 15433:5432
 *   DATABASE_URL="postgres://postgres:<pw>@localhost:15433/llmgateway" pnpm tsx vitest/seed-migrations.ts
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

interface JournalEntry {
	tag: string;
	when: number;
}

async function run() {
	const journal = JSON.parse(
		readFileSync("./packages/db/migrations/meta/_journal.json", "utf8"),
	) as { entries: JournalEntry[] };

	const db = drizzle({
		connection:
			process.env.DATABASE_URL ?? "postgres://postgres:pw@localhost:5432/test",
	});

	// Ensure the table exists in the drizzle schema
	await db.execute(
		sql`CREATE SCHEMA IF NOT EXISTS drizzle`,
	);
	await db.execute(
		sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)`,
	);

	// Get last recorded timestamp so we only report on what we're adding
	const result = await db.execute(
		sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
	);
	const lastAt = result.rows[0]
		? Number((result.rows[0] as { created_at: string }).created_at)
		: 0;
	console.log(`Last recorded migration timestamp: ${lastAt}`);

	let seeded = 0;
	for (const entry of journal.entries) {
		const sqlContent = readFileSync(
			`./packages/db/migrations/${entry.tag}.sql`,
			"utf8",
		);
		const hash = createHash("sha256").update(sqlContent).digest("hex");
		await db.execute(
			sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
			    VALUES (${hash}, ${entry.when})
			    ON CONFLICT DO NOTHING`,
		);
		if (entry.when > lastAt) {
			console.log(`  seeded: ${entry.tag}`);
			seeded++;
		}
	}

	const total = await db.execute(
		sql`SELECT COUNT(*) as n FROM drizzle.__drizzle_migrations`,
	);
	console.log(
		`Done. Seeded ${seeded} new entries. Total in DB: ${(total.rows[0] as { n: string }).n}`,
	);
}

void run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
