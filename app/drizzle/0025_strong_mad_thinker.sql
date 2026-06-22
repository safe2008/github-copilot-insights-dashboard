CREATE TABLE IF NOT EXISTS "dim_org_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"org_login" varchar(255) NOT NULL,
	"github_org_id" integer,
	"user_id" integer NOT NULL,
	"user_login" varchar(255) NOT NULL,
	"avatar_url" text,
	"member_type" varchar(50) DEFAULT 'User' NOT NULL,
	"site_admin" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fact_copilot_seat_assignment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"enterprise_slug" varchar(255) NOT NULL,
	"assignee_login" varchar(255) NOT NULL,
	"assignee_github_id" integer,
	"organization_login" varchar(255),
	"organization_github_id" integer,
	"assigning_team_github_id" integer,
	"assigning_team_name" varchar(255),
	"assigning_team_slug" varchar(255),
	"assignment_method" varchar(50) NOT NULL,
	"plan_type" varchar(50) DEFAULT 'unknown' NOT NULL,
	"seat_created_at" timestamp with time zone,
	"seat_updated_at" timestamp with time zone,
	"pending_cancellation_date" date,
	"last_activity_at" timestamp with time zone,
	"last_activity_editor" varchar(255),
	"raw_json" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_access_check_snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enterprise_slug" varchar(255),
	"token_login" varchar(255),
	"token_name" varchar(255),
	"token_type" varchar(50) DEFAULT 'unknown' NOT NULL,
	"token_valid" boolean DEFAULT false NOT NULL,
	"representative_org" varchar(255),
	"representative_team" varchar(255),
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orgs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "dim_org_member" ADD CONSTRAINT "dim_org_member_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dim_org_member_unique" ON "dim_org_member" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dim_org_member_org" ON "dim_org_member" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dim_org_member_user" ON "dim_org_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_seat_snapshot_date" ON "fact_copilot_seat_assignment" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_seat_enterprise_date" ON "fact_copilot_seat_assignment" USING btree ("enterprise_slug","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_seat_assignee" ON "fact_copilot_seat_assignment" USING btree ("assignee_login");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fact_seat_assignment_method" ON "fact_copilot_seat_assignment" USING btree ("assignment_method");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_access_checked_at" ON "github_access_check_snapshot" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_access_enterprise" ON "github_access_check_snapshot" USING btree ("enterprise_slug");