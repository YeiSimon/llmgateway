const defaultTestDatabaseUrl = "postgres://postgres:pw@localhost:5432/test";

process.env.DATABASE_URL ??= defaultTestDatabaseUrl;
process.env.AUTH_SECRET ??= "dev-secret-change-in-production-32chars";
process.env.VIDEO_CONTENT_TOKEN_ALLOW_DEV ??= "true";
