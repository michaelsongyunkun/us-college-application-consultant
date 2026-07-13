import Database from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema/sqlite.js";
import type { ProductionRepositories } from "./production-contracts.js";

export function createSqliteRepositoryFixture({ databasePath = ":memory:", now = () => new Date() } = {}) {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  migrateSqliteProductionSchema(database);
  return {
    repositories: createSqliteProductionRepositories({ database, now }),
    close: async () => database.close(),
  };
}

export function createSqliteProductionRepositories({ database, now = () => new Date() }: any): ProductionRepositories {
  const db = drizzle(database, { schema });

  const repositories: ProductionRepositories = {
    users: {
      async create(input: any) {
        const timestamp = now().toISOString();
        return db.insert(schema.users).values({
          ...(input.id ? { id: Number(input.id) } : {}),
          email: String(input.email).trim().toLowerCase(),
          name: String(input.name),
          role: String(input.role || "user"),
          passwordHash: String(input.passwordHash),
          loginCount: Number(input.loginCount || 0),
          lastLoginAt: input.lastLoginAt || null,
          createdAt: input.createdAt || timestamp,
          updatedAt: input.updatedAt || timestamp,
        }).returning().get();
      },
      async getById(id) {
        return db.select().from(schema.users).where(eq(schema.users.id, Number(id))).get() || null;
      },
      async getByEmail(email) {
        return db.select().from(schema.users).where(eq(schema.users.email, String(email).trim().toLowerCase())).get() || null;
      },
    },
    sessions: {
      async create(input: any) {
        const timestamp = now().toISOString();
        return db.insert(schema.sessions).values({
          ...(input.id ? { id: Number(input.id) } : {}),
          userId: Number(input.userId),
          tokenHash: String(input.tokenHash),
          csrfTokenHash: input.csrfTokenHash ? String(input.csrfTokenHash) : null,
          expiresAt: String(input.expiresAt),
          createdAt: input.createdAt || timestamp,
        }).returning().get();
      },
      async getByTokenHash(tokenHash) {
        return db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).get() || null;
      },
      async deleteByTokenHash(tokenHash) {
        db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).run();
      },
    },
    profiles: {
      async get(userId) {
        const row = db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.userId, Number(userId))).get();
        return row ? { profile: row.profile, updatedAt: row.updatedAt } : null;
      },
      async upsert(userId, profile) {
        const timestamp = now().toISOString();
        db.insert(schema.studentProfiles).values({ userId: Number(userId), profile, createdAt: timestamp, updatedAt: timestamp })
          .onConflictDoUpdate({ target: schema.studentProfiles.userId, set: { profile, updatedAt: timestamp } }).run();
        return repositories.profiles.get(userId);
      },
    },
    activities: {
      async get(userId) {
        const row = db.select().from(schema.studentActivityPortfolios).where(eq(schema.studentActivityPortfolios.userId, Number(userId))).get();
        return row ? { portfolio: activityRowToPortfolio(row), updatedAt: row.updatedAt } : null;
      },
      async upsert(userId, portfolio) {
        const timestamp = now().toISOString();
        const values = activityPortfolioToRow(Number(userId), portfolio, timestamp);
        db.insert(schema.studentActivityPortfolios).values(values).onConflictDoUpdate({
          target: schema.studentActivityPortfolios.userId,
          set: { ...values, id: undefined, userId: undefined, createdAt: undefined },
        }).run();
        return repositories.activities.get(userId);
      },
    },
    progress: {
      async get(userId) {
        const row = db.select().from(schema.studentProgressPlanners).where(eq(schema.studentProgressPlanners.userId, Number(userId))).get();
        return row ? { planner: row.planner, updatedAt: row.updatedAt } : null;
      },
      async upsert(userId, planner) {
        const timestamp = now().toISOString();
        db.insert(schema.studentProgressPlanners).values({ userId: Number(userId), planner, createdAt: timestamp, updatedAt: timestamp })
          .onConflictDoUpdate({ target: schema.studentProgressPlanners.userId, set: { planner, updatedAt: timestamp } }).run();
        return repositories.progress.get(userId);
      },
    },
    plans: {
      async create(userId, input: any) {
        const timestamp = now().toISOString();
        const row = db.insert(schema.planningProjects).values({
          userId: Number(userId), name: String(input.name), currentDraft: input.draft || {}, createdAt: timestamp, updatedAt: timestamp,
        }).returning().get();
        return planRow(row);
      },
      async list(userId) {
        return db.select().from(schema.planningProjects).where(eq(schema.planningProjects.userId, Number(userId)))
          .orderBy(desc(schema.planningProjects.updatedAt), desc(schema.planningProjects.id)).all().map(planRow);
      },
      async getOwned(userId, planId) {
        const row = db.select().from(schema.planningProjects).where(and(
          eq(schema.planningProjects.userId, Number(userId)), eq(schema.planningProjects.id, Number(planId)),
        )).get();
        return row ? planRow(row) : null;
      },
      async createSnapshot(userId, planId, input: any) {
        if (!await repositories.plans.getOwned(userId, planId)) return null;
        const row = db.insert(schema.planningSnapshots).values({
          userId: Number(userId), projectId: Number(planId), note: String(input.note || ""), snapshot: input.snapshot || {}, createdAt: now().toISOString(),
        }).returning().get();
        return snapshotRow(row);
      },
      async getSnapshotOwned(userId, planId, snapshotId) {
        const row = db.select().from(schema.planningSnapshots).where(and(
          eq(schema.planningSnapshots.userId, Number(userId)),
          eq(schema.planningSnapshots.projectId, Number(planId)),
          eq(schema.planningSnapshots.id, Number(snapshotId)),
        )).get();
        return row ? snapshotRow(row) : null;
      },
    },
    analytics: {
      async recordUsage(input: any) {
        const occurredAt = input.occurredAt || now().toISOString();
        return db.insert(schema.usageEvents).values({
          userId: Number(input.userId), userName: String(input.userName || ""), userEmail: String(input.userEmail || ""),
          eventType: String(input.eventType), grade: input.grade || "", majorDirection: input.majorDirection || "",
          completionFields: Number(input.completionFields || 0), filledActivityCount: Number(input.filledActivityCount || 0),
          generatedActivityCount: Number(input.generatedActivityCount || 0), durationMs: Number(input.durationMs || 0),
          failureReason: input.failureReason || "", details: input.details || {}, occurredAt,
          eventDate: occurredAt.slice(0, 10), eventWeek: weekKey(new Date(occurredAt)), userAgent: input.userAgent || "", ipAddress: input.ipAddress || "",
        }).returning().get();
      },
      async listByUser(userId) {
        return db.select().from(schema.usageEvents).where(eq(schema.usageEvents.userId, Number(userId)))
          .orderBy(desc(schema.usageEvents.occurredAt), desc(schema.usageEvents.id)).all();
      },
    },
    audit: {
      async record(input: any) {
        const occurredAt = input.occurredAt || now().toISOString();
        return db.insert(schema.auditEvents).values({
          actorUserId: input.actorUserId ? Number(input.actorUserId) : null,
          actorUserName: String(input.actorUserName || ""), actorUserEmail: String(input.actorUserEmail || ""), actorRole: String(input.actorRole || ""),
          action: String(input.action), resourceType: String(input.resourceType), resourceId: String(input.resourceId || ""),
          outcome: input.outcome === "failure" ? "failure" : "success", details: input.details || {}, occurredAt,
          eventDate: occurredAt.slice(0, 10), userAgent: input.userAgent || "", ipAddress: input.ipAddress || "",
        }).returning().get();
      },
      async listByActor(userId) {
        return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorUserId, Number(userId)))
          .orderBy(desc(schema.auditEvents.occurredAt), desc(schema.auditEvents.id)).all();
      },
    },
    async transaction(callback) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(repositories);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return repositories;
}

export function migrateSqliteProductionSchema(database: any) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, login_count INTEGER NOT NULL DEFAULT 0, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, csrf_token_hash TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, user_name TEXT, user_email TEXT, occurred_at TEXT NOT NULL, login_date TEXT NOT NULL, login_week TEXT NOT NULL, status TEXT NOT NULL, user_agent TEXT, ip_address TEXT, failure_reason TEXT);
    CREATE TABLE IF NOT EXISTS usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_name TEXT NOT NULL, user_email TEXT NOT NULL, event_type TEXT NOT NULL, grade TEXT, major_direction TEXT, completion_fields INTEGER NOT NULL DEFAULT 0, filled_activity_count INTEGER NOT NULL DEFAULT 0, generated_activity_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, failure_reason TEXT, details_json TEXT, occurred_at TEXT NOT NULL, event_date TEXT NOT NULL, event_week TEXT NOT NULL, user_agent TEXT, ip_address TEXT);
    CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, actor_user_name TEXT NOT NULL DEFAULT '', actor_user_email TEXT NOT NULL DEFAULT '', actor_role TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT 'success', details_json TEXT, occurred_at TEXT NOT NULL, event_date TEXT NOT NULL, user_agent TEXT, ip_address TEXT);
    CREATE TABLE IF NOT EXISTS student_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, profile_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feedback_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, user_name TEXT NOT NULL DEFAULT '', user_email TEXT NOT NULL DEFAULT '', issue_type TEXT NOT NULL, page_name TEXT NOT NULL, description TEXT NOT NULL, steps TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', feedback_status TEXT NOT NULL DEFAULT '未处理', admin_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, feedback_date TEXT NOT NULL, user_agent TEXT, ip_address TEXT);
    CREATE TABLE IF NOT EXISTS student_activity_portfolios (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, application_plan_json TEXT NOT NULL, activities_json TEXT NOT NULL, competitions_json TEXT NOT NULL, summer_schools_json TEXT NOT NULL, recommendation_letters_json TEXT NOT NULL, planning_actions_json TEXT NOT NULL, deepseek_notes_json TEXT NOT NULL, school_selection_versions_json TEXT NOT NULL, academic_records_json TEXT NOT NULL, capability_assessment_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS student_progress_planners (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, planner_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS planning_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, current_draft_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS planning_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES planning_projects(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, note TEXT NOT NULL DEFAULT '', snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS knowledge_documents (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, source_version TEXT NOT NULL, updated_at TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 100, official_url TEXT, embedding_model_version TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', UNIQUE(source_id, content_hash));
    CREATE TABLE IF NOT EXISTS object_records (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, object_key TEXT NOT NULL, content_type TEXT NOT NULL, content_length INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, UNIQUE(user_id, object_key));
  `);
}

function activityPortfolioToRow(userId: number, portfolio: any, timestamp: string) {
  return {
    userId,
    applicationPlan: portfolio.applicationPlan || {}, activities: portfolio.activities || [], competitions: portfolio.competitions || [],
    summerSchools: portfolio.summerSchools || [], recommendationLetters: portfolio.recommendationLetters || {}, planningActions: portfolio.planningActions || [],
    deepSeekNotes: portfolio.deepSeekNotes || [], schoolSelectionVersions: portfolio.schoolSelectionVersions || [], academicRecords: portfolio.academicRecords || {},
    capabilityAssessment: portfolio.capabilityAssessment || {}, createdAt: timestamp, updatedAt: timestamp,
  };
}

function activityRowToPortfolio(row: any) {
  return {
    applicationPlan: row.applicationPlan, activities: row.activities, competitions: row.competitions, summerSchools: row.summerSchools,
    recommendationLetters: row.recommendationLetters, planningActions: row.planningActions, deepSeekNotes: row.deepSeekNotes,
    schoolSelectionVersions: row.schoolSelectionVersions, academicRecords: row.academicRecords, capabilityAssessment: row.capabilityAssessment,
  };
}

const planRow = (row: any) => ({ id: row.id, userId: row.userId, name: row.name, draft: row.currentDraft, createdAt: row.createdAt, updatedAt: row.updatedAt });
const snapshotRow = (row: any) => ({ id: row.id, planId: row.projectId, userId: row.userId, note: row.note, snapshot: row.snapshot, createdAt: row.createdAt });

function weekKey(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
