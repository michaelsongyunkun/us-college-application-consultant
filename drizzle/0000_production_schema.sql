CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"actor_user_name" text DEFAULT '' NOT NULL,
	"actor_user_email" text DEFAULT '' NOT NULL,
	"actor_role" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT 'success' NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_date" text NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"queue_name" text NOT NULL,
	"job_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"result_json" jsonb,
	"error_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"user_email" text DEFAULT '' NOT NULL,
	"issue_type" text NOT NULL,
	"page_name" text NOT NULL,
	"description" text NOT NULL,
	"steps" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"feedback_status" text DEFAULT '未处理' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"feedback_date" text NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_version" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"official_url" text,
	"embedding" vector(1536),
	"embedding_model_version" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_name" text,
	"user_email" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"login_date" text NOT NULL,
	"login_week" text NOT NULL,
	"status" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "object_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_length" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"current_draft_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_activity_portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"application_plan_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activities_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summer_schools_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendation_letters_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"planning_actions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deepseek_notes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"school_selection_versions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"academic_records_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capability_assessment_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"profile_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_progress_planners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"planner_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"event_type" text NOT NULL,
	"grade" text,
	"major_direction" text,
	"completion_fields" integer DEFAULT 0 NOT NULL,
	"filled_activity_count" integer DEFAULT 0 NOT NULL,
	"generated_activity_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"details_json" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_date" text NOT NULL,
	"event_week" text NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"login_count" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_records" ADD CONSTRAINT "object_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_projects" ADD CONSTRAINT "planning_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_snapshots" ADD CONSTRAINT "planning_snapshots_project_id_planning_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."planning_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_snapshots" ADD CONSTRAINT "planning_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_activity_portfolios" ADD CONSTRAINT "student_activity_portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress_planners" ADD CONSTRAINT "student_progress_planners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor_user_id" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_user_idempotency_unique" ON "background_jobs" USING btree ("user_id","job_type","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_source_hash_unique" ON "knowledge_documents" USING btree ("source_id","content_hash");--> statement-breakpoint
CREATE INDEX "knowledge_documents_embedding_hnsw" ON "knowledge_documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_login_events_user_id" ON "login_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_records_user_key_unique" ON "object_records" USING btree ("user_id","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_planning_projects_user_id" ON "planning_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_planning_snapshots_project_id" ON "planning_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_planning_snapshots_user_id" ON "planning_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_activity_portfolios_user_id_unique" ON "student_activity_portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_user_id_unique" ON "student_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_progress_planners_user_id_unique" ON "student_progress_planners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_events_user_id" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_events_event_type" ON "usage_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
