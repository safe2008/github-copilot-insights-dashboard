CREATE TABLE IF NOT EXISTS "fact_org_adoption_phase_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"org_id" integer,
	"scope" varchar(20) DEFAULT 'organization' NOT NULL,
	"phase_number" smallint NOT NULL,
	"phase_label" varchar(32),
	"total_engaged_users" integer DEFAULT 0,
	"avg_user_initiated_interactions" numeric,
	"avg_code_generation_activities" numeric,
	"avg_code_acceptance_activities" numeric,
	"avg_loc_added" numeric,
	"avg_loc_deleted" numeric,
	"avg_pull_requests_created" numeric,
	"avg_pull_requests_merged" numeric,
	"avg_pull_requests_reviewed" numeric,
	"avg_pull_requests_median_minutes_to_merge" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fact_org_pr_comment_type_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"org_id" integer,
	"scope" varchar(20) DEFAULT 'organization' NOT NULL,
	"comment_type" varchar(100) NOT NULL,
	"total_copilot_suggestions" integer DEFAULT 0,
	"total_copilot_applied_suggestions" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "fact_copilot_seat_assignment" ADD COLUMN IF NOT EXISTS "last_authenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "daily_active_copilot_cloud_agent_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "weekly_active_copilot_cloud_agent_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "monthly_active_copilot_cloud_agent_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "daily_active_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "weekly_active_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "monthly_active_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "daily_passive_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "weekly_passive_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD COLUMN IF NOT EXISTS "monthly_passive_copilot_code_review_users" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_adoption_phase_daily" ADD CONSTRAINT "fact_org_adoption_phase_daily_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_org_pr_comment_type_daily" ADD CONSTRAINT "fact_org_pr_comment_type_daily_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fact_org_phase_unique" ON "fact_org_adoption_phase_daily" USING btree ("day","org_id","scope","phase_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_org_phase_day" ON "fact_org_adoption_phase_daily" USING btree ("day","phase_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fact_org_pr_comment_unique" ON "fact_org_pr_comment_type_daily" USING btree ("day","org_id","scope","comment_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_org_pr_comment_day" ON "fact_org_pr_comment_type_daily" USING btree ("day");