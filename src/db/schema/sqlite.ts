import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const jsonText = (name: string) => text(name, { mode: "json" }).$type<Record<string, any> | any[]>();
const isoText = (name: string) => text(name).notNull();

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: text("last_login_at"),
  createdAt: isoText("created_at"),
  updatedAt: isoText("updated_at"),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  csrfTokenHash: text("csrf_token_hash"),
  expiresAt: isoText("expires_at"),
  createdAt: isoText("created_at"),
}, (table) => [
  uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  index("idx_sessions_expires_at").on(table.expiresAt),
]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: isoText("expires_at"),
  usedAt: text("used_at"),
  createdAt: isoText("created_at"),
}, (table) => [uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash)]);

export const loginEvents = sqliteTable("login_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name"),
  userEmail: text("user_email"),
  occurredAt: isoText("occurred_at"),
  loginDate: text("login_date").notNull(),
  loginWeek: text("login_week").notNull(),
  status: text("status").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  failureReason: text("failure_reason"),
}, (table) => [index("idx_login_events_user_id").on(table.userId)]);

export const usageEvents = sqliteTable("usage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  userEmail: text("user_email").notNull(),
  eventType: text("event_type").notNull(),
  grade: text("grade"),
  majorDirection: text("major_direction"),
  completionFields: integer("completion_fields").notNull().default(0),
  filledActivityCount: integer("filled_activity_count").notNull().default(0),
  generatedActivityCount: integer("generated_activity_count").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  failureReason: text("failure_reason"),
  details: jsonText("details_json"),
  occurredAt: isoText("occurred_at"),
  eventDate: text("event_date").notNull(),
  eventWeek: text("event_week").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
}, (table) => [
  index("idx_usage_events_user_id").on(table.userId),
  index("idx_usage_events_event_type").on(table.eventType),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorUserName: text("actor_user_name").notNull().default(""),
  actorUserEmail: text("actor_user_email").notNull().default(""),
  actorRole: text("actor_role").notNull().default(""),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull().default(""),
  outcome: text("outcome").notNull().default("success"),
  details: jsonText("details_json"),
  occurredAt: isoText("occurred_at"),
  eventDate: text("event_date").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
}, (table) => [index("idx_audit_events_actor_user_id").on(table.actorUserId)]);

export const studentProfiles = sqliteTable("student_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profile: jsonText("profile_json").notNull(),
  createdAt: isoText("created_at"),
  updatedAt: isoText("updated_at"),
}, (table) => [uniqueIndex("student_profiles_user_id_unique").on(table.userId)]);

export const feedbackEntries = sqliteTable("feedback_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  userEmail: text("user_email").notNull().default(""),
  issueType: text("issue_type").notNull(),
  pageName: text("page_name").notNull(),
  description: text("description").notNull(),
  steps: text("steps").notNull().default(""),
  contact: text("contact").notNull().default(""),
  feedbackStatus: text("feedback_status").notNull().default("未处理"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: isoText("created_at"),
  feedbackDate: text("feedback_date").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
});

export const studentActivityPortfolios = sqliteTable("student_activity_portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationPlan: jsonText("application_plan_json").notNull(),
  activities: jsonText("activities_json").notNull(),
  competitions: jsonText("competitions_json").notNull(),
  summerSchools: jsonText("summer_schools_json").notNull(),
  recommendationLetters: jsonText("recommendation_letters_json").notNull(),
  planningActions: jsonText("planning_actions_json").notNull(),
  deepSeekNotes: jsonText("deepseek_notes_json").notNull(),
  schoolSelectionVersions: jsonText("school_selection_versions_json").notNull(),
  academicRecords: jsonText("academic_records_json").notNull(),
  capabilityAssessment: jsonText("capability_assessment_json").notNull(),
  createdAt: isoText("created_at"),
  updatedAt: isoText("updated_at"),
}, (table) => [uniqueIndex("student_activity_portfolios_user_id_unique").on(table.userId)]);

export const studentProgressPlanners = sqliteTable("student_progress_planners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planner: jsonText("planner_json").notNull(),
  createdAt: isoText("created_at"),
  updatedAt: isoText("updated_at"),
}, (table) => [uniqueIndex("student_progress_planners_user_id_unique").on(table.userId)]);

export const planningProjects = sqliteTable("planning_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currentDraft: jsonText("current_draft_json").notNull(),
  createdAt: isoText("created_at"),
  updatedAt: isoText("updated_at"),
}, (table) => [index("idx_planning_projects_user_id").on(table.userId)]);

export const planningSnapshots = sqliteTable("planning_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => planningProjects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  snapshot: jsonText("snapshot_json").notNull(),
  createdAt: isoText("created_at"),
}, (table) => [
  index("idx_planning_snapshots_project_id").on(table.projectId),
  index("idx_planning_snapshots_user_id").on(table.userId),
]);

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  sourceVersion: text("source_version").notNull(),
  updatedAt: isoText("updated_at"),
  confidence: integer("confidence").notNull().default(100),
  officialUrl: text("official_url"),
  embeddingModelVersion: text("embedding_model_version"),
  metadata: jsonText("metadata_json").notNull().default(sql`'{}'`),
}, (table) => [uniqueIndex("knowledge_documents_source_hash_unique").on(table.sourceId, table.contentHash)]);

export const objectRecords = sqliteTable("object_records", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  contentLength: integer("content_length").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: isoText("created_at"),
  expiresAt: text("expires_at"),
}, (table) => [uniqueIndex("object_records_user_key_unique").on(table.userId, table.objectKey)]);
