CREATE TABLE "budget_cap" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" text,
	"subject_kind" text NOT NULL,
	"subject_id" text,
	"period" text NOT NULL,
	"limit" numeric NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "log_forwarder" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"forwarder_type" text NOT NULL,
	"log_types" json NOT NULL,
	"config" jsonb NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_forwarder_outbox" (
	"id" text PRIMARY KEY,
	"forwarder_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_rule" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" text,
	"subject_kind" text NOT NULL,
	"subject_id" text,
	"window_seconds" integer NOT NULL,
	"metric" text DEFAULT 'requests' NOT NULL,
	"limit" integer NOT NULL,
	"provider" text,
	"model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "sso_config" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL UNIQUE,
	"provider" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_encrypted" text NOT NULL,
	"discovery_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"default_role" text DEFAULT 'developer' NOT NULL,
	"jit_provisioning" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"category" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "rotation_period_days" integer;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "rotated_from_id" text;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "grace_period_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "inactivity_timeout_days" integer;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "disabled_reason" text;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "last_rotation_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "last_expiry_warning_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "lineage_id" text DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "cost_center" text;--> statement-breakpoint
CREATE INDEX "api_key_lineage_id_idx" ON "api_key" ("lineage_id");--> statement-breakpoint
CREATE INDEX "api_key_expires_at_idx" ON "api_key" ("expires_at");--> statement-breakpoint
CREATE INDEX "budget_cap_org_idx" ON "budget_cap" ("organization_id");--> statement-breakpoint
CREATE INDEX "budget_cap_subject_idx" ON "budget_cap" ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "log_forwarder_org_idx" ON "log_forwarder" ("organization_id");--> statement-breakpoint
CREATE INDEX "log_forwarder_outbox_forwarder_idx" ON "log_forwarder_outbox" ("forwarder_id");--> statement-breakpoint
CREATE INDEX "log_forwarder_outbox_next_retry_idx" ON "log_forwarder_outbox" ("next_retry_at");--> statement-breakpoint
CREATE INDEX "rate_limit_rule_org_idx" ON "rate_limit_rule" ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_limit_rule_subject_idx" ON "rate_limit_rule" ("subject_kind","subject_id");--> statement-breakpoint
ALTER TABLE "budget_cap" ADD CONSTRAINT "budget_cap_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "log_forwarder" ADD CONSTRAINT "log_forwarder_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "log_forwarder_outbox" ADD CONSTRAINT "log_forwarder_outbox_forwarder_id_log_forwarder_id_fkey" FOREIGN KEY ("forwarder_id") REFERENCES "log_forwarder"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rate_limit_rule" ADD CONSTRAINT "rate_limit_rule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sso_config" ADD CONSTRAINT "sso_config_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");