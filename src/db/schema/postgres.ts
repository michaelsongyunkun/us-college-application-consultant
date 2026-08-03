import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" }).notNull();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamptz("created_at"),
  updatedAt: timestamptz("updated_at"),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  csrfTokenHash: text("csrf_token_hash"),
  expiresAt: timestamptz("expires_at"),
  createdAt: timestamptz("created_at"),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("idx_sessions_expires_at").on(table.expiresAt)]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamptz("expires_at"),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamptz("created_at"),
}, (table) => [uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash)]);

export const loginEvents = pgTable("login_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name"), userEmail: text("user_email"), occurredAt: timestamptz("occurred_at"),
  loginDate: text("login_date").notNull(), loginWeek: text("login_week").notNull(), status: text("status").notNull(),
  userAgent: text("user_agent"), ipAddress: text("ip_address"), failureReason: text("failure_reason"),
}, (table) => [index("idx_login_events_user_id").on(table.userId)]);

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(), userEmail: text("user_email").notNull(), eventType: text("event_type").notNull(),
  grade: text("grade"), majorDirection: text("major_direction"), completionFields: integer("completion_fields").notNull().default(0),
  filledActivityCount: integer("filled_activity_count").notNull().default(0), generatedActivityCount: integer("generated_activity_count").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0), failureReason: text("failure_reason"), details: jsonb("details_json"),
  occurredAt: timestamptz("occurred_at"), eventDate: text("event_date").notNull(), eventWeek: text("event_week").notNull(),
  userAgent: text("user_agent"), ipAddress: text("ip_address"),
}, (table) => [index("idx_usage_events_user_id").on(table.userId), index("idx_usage_events_event_type").on(table.eventType)]);

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(), actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorUserName: text("actor_user_name").notNull().default(""), actorUserEmail: text("actor_user_email").notNull().default(""),
  actorRole: text("actor_role").notNull().default(""), action: text("action").notNull(), resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull().default(""), outcome: text("outcome").notNull().default("success"), details: jsonb("details_json").notNull().default({}),
  occurredAt: timestamptz("occurred_at"), eventDate: text("event_date").notNull(), userAgent: text("user_agent"), ipAddress: text("ip_address"),
}, (table) => [index("idx_audit_events_actor_user_id").on(table.actorUserId)]);

export const studentProfiles = pgTable("student_profiles", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profile: jsonb("profile_json").notNull(), createdAt: timestamptz("created_at"), updatedAt: timestamptz("updated_at"),
}, (table) => [uniqueIndex("student_profiles_user_id_unique").on(table.userId)]);

export const feedbackEntries = pgTable("feedback_entries", {
  id: serial("id").primaryKey(), userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""), userEmail: text("user_email").notNull().default(""), issueType: text("issue_type").notNull(),
  pageName: text("page_name").notNull(), description: text("description").notNull(), steps: text("steps").notNull().default(""), contact: text("contact").notNull().default(""),
  feedbackStatus: text("feedback_status").notNull().default("未处理"), adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamptz("created_at"), feedbackDate: text("feedback_date").notNull(), userAgent: text("user_agent"), ipAddress: text("ip_address"),
});

export const studentActivityPortfolios = pgTable("student_activity_portfolios", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationPlan: jsonb("application_plan_json").notNull().default({}), activities: jsonb("activities_json").notNull().default([]),
  competitions: jsonb("competitions_json").notNull().default([]), summerSchools: jsonb("summer_schools_json").notNull().default([]),
  recommendationLetters: jsonb("recommendation_letters_json").notNull().default({}), planningActions: jsonb("planning_actions_json").notNull().default([]),
  deepSeekNotes: jsonb("deepseek_notes_json").notNull().default([]), schoolSelectionVersions: jsonb("school_selection_versions_json").notNull().default([]),
  academicRecords: jsonb("academic_records_json").notNull().default({}), capabilityAssessment: jsonb("capability_assessment_json").notNull().default({}),
  createdAt: timestamptz("created_at"), updatedAt: timestamptz("updated_at"),
}, (table) => [uniqueIndex("student_activity_portfolios_user_id_unique").on(table.userId)]);

export const studentProgressPlanners = pgTable("student_progress_planners", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planner: jsonb("planner_json").notNull().default({}), createdAt: timestamptz("created_at"), updatedAt: timestamptz("updated_at"),
}, (table) => [uniqueIndex("student_progress_planners_user_id_unique").on(table.userId)]);

export const planningProjects = pgTable("planning_projects", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), currentDraft: jsonb("current_draft_json").notNull().default({}), createdAt: timestamptz("created_at"), updatedAt: timestamptz("updated_at"),
}, (table) => [index("idx_planning_projects_user_id").on(table.userId)]);

export const planningSnapshots = pgTable("planning_snapshots", {
  id: serial("id").primaryKey(), projectId: integer("project_id").notNull().references(() => planningProjects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), note: text("note").notNull().default(""),
  snapshot: jsonb("snapshot_json").notNull(), createdAt: timestamptz("created_at"),
}, (table) => [index("idx_planning_snapshots_project_id").on(table.projectId), index("idx_planning_snapshots_user_id").on(table.userId)]);

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull(), sourceType: text("source_type").notNull(), title: text("title").notNull(),
  content: text("content").notNull(), contentHash: text("content_hash").notNull(), sourceVersion: text("source_version").notNull(),
  updatedAt: timestamptz("updated_at"), confidence: integer("confidence").notNull().default(100), officialUrl: text("official_url"),
  embedding: vector("embedding", { dimensions: 1536 }), embeddingModelVersion: text("embedding_model_version"), metadata: jsonb("metadata_json").notNull().default({}),
}, (table) => [
  uniqueIndex("knowledge_documents_source_hash_unique").on(table.sourceId, table.contentHash),
  index("knowledge_documents_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export const knowledgeEntities = pgTable("knowledge_entities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  aliases: jsonb("aliases_json").notNull().default([]),
  metadata: jsonb("metadata_json").notNull().default({}),
  sourceVersion: text("source_version").notNull(),
  updatedAt: timestamptz("updated_at"),
}, (table) => [
  index("knowledge_entities_type_idx").on(table.entityType),
  index("knowledge_entities_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
  index("knowledge_entities_aliases_idx").using("gin", table.aliases),
]);

export const knowledgeRelations = pgTable("knowledge_relations", {
  id: text("id").primaryKey(),
  fromEntityId: text("from_entity_id").notNull().references(() => knowledgeEntities.id, { onDelete: "cascade" }),
  toEntityId: text("to_entity_id").notNull().references(() => knowledgeEntities.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(),
  sourceId: text("source_id").notNull().default(""),
  sourceVersion: text("source_version").notNull(),
  confidence: integer("confidence").notNull().default(80),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "string" }),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "string" }),
  officialUrl: text("official_url"),
  metadata: jsonb("metadata_json").notNull().default({}),
  updatedAt: timestamptz("updated_at"),
}, (table) => [
  index("knowledge_relations_from_idx").on(table.fromEntityId),
  index("knowledge_relations_to_idx").on(table.toEntityId),
  index("knowledge_relations_type_idx").on(table.relationType),
]);

export const backgroundJobs = pgTable("background_jobs", {
  id: text("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  queueName: text("queue_name").notNull(), jobType: text("job_type").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull(), attemptsMade: integer("attempts_made").notNull().default(0), result: jsonb("result_json"), error: jsonb("error_json"),
  createdAt: timestamptz("created_at"), updatedAt: timestamptz("updated_at"), completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, (table) => [uniqueIndex("background_jobs_user_idempotency_unique").on(table.userId, table.jobType, table.idempotencyKey)]);

export const objectRecords = pgTable("object_records", {
  id: text("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(), contentLength: bigint("content_length", { mode: "number" }).notNull(), contentHash: text("content_hash").notNull(),
  createdAt: timestamptz("created_at"), expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
}, (table) => [uniqueIndex("object_records_user_key_unique").on(table.userId, table.objectKey)]);

export const schemaMetadata = pgTable("schema_metadata", {
  key: text("key").primaryKey(), value: jsonb("value").notNull().default(sql`'{}'::jsonb`), updatedAt: timestamptz("updated_at"),
});
