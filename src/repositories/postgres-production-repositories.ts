import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema/postgres.js";
import type { ProductionRepositories } from "./production-contracts.js";

export function createPostgresProductionRepositories({ pool, now = () => new Date() }: { pool: Pool; now?: () => Date }): ProductionRepositories {
  const db = drizzle(pool, { schema });
  return buildRepositories(db, now, async (callback: (repositories: ProductionRepositories) => Promise<unknown>) => db.transaction(async (tx) => callback(buildRepositories(tx, now, null))));
}

function buildRepositories(db: any, now: () => Date, transactionRunner: any): ProductionRepositories {
  const repositories: any = {
    users: {
      async create(input: any) {
        const timestamp = now().toISOString();
        return (await db.insert(schema.users).values({
          ...(input.id ? { id: Number(input.id) } : {}), email: String(input.email).trim().toLowerCase(), name: String(input.name),
          role: String(input.role || "user"), passwordHash: String(input.passwordHash), loginCount: Number(input.loginCount || 0),
          lastLoginAt: input.lastLoginAt || null, createdAt: input.createdAt || timestamp, updatedAt: input.updatedAt || timestamp,
        }).returning())[0];
      },
      async getById(id: number) { return (await db.select().from(schema.users).where(eq(schema.users.id, Number(id))).limit(1))[0] || null; },
      async getByEmail(email: string) { return (await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).limit(1))[0] || null; },
    },
    sessions: {
      async create(input: any) {
        return (await db.insert(schema.sessions).values({ ...(input.id ? { id: Number(input.id) } : {}), userId: Number(input.userId), tokenHash: String(input.tokenHash),
          csrfTokenHash: input.csrfTokenHash || null, expiresAt: String(input.expiresAt), createdAt: input.createdAt || now().toISOString() }).returning())[0];
      },
      async getByTokenHash(tokenHash: string) { return (await db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).limit(1))[0] || null; },
      async deleteByTokenHash(tokenHash: string) { await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)); },
    },
    profiles: {
      async get(userId: number) {
        const row = (await db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.userId, Number(userId))).limit(1))[0];
        return row ? { profile: row.profile, updatedAt: row.updatedAt } : null;
      },
      async upsert(userId: number, profile: any) {
        const timestamp = now().toISOString();
        await db.insert(schema.studentProfiles).values({ userId: Number(userId), profile, createdAt: timestamp, updatedAt: timestamp })
          .onConflictDoUpdate({ target: schema.studentProfiles.userId, set: { profile, updatedAt: timestamp } });
        return repositories.profiles.get(userId);
      },
    },
    activities: {
      async get(userId: number) {
        const row = (await db.select().from(schema.studentActivityPortfolios).where(eq(schema.studentActivityPortfolios.userId, Number(userId))).limit(1))[0];
        return row ? { portfolio: activityRowToPortfolio(row), updatedAt: row.updatedAt } : null;
      },
      async upsert(userId: number, portfolio: any) {
        const timestamp = now().toISOString();
        const values = activityPortfolioToRow(Number(userId), portfolio, timestamp);
        const { userId: _userId, createdAt: _createdAt, ...updates } = values;
        await db.insert(schema.studentActivityPortfolios).values(values).onConflictDoUpdate({ target: schema.studentActivityPortfolios.userId, set: updates });
        return repositories.activities.get(userId);
      },
    },
    progress: {
      async get(userId: number) {
        const row = (await db.select().from(schema.studentProgressPlanners).where(eq(schema.studentProgressPlanners.userId, Number(userId))).limit(1))[0];
        return row ? { planner: row.planner, updatedAt: row.updatedAt } : null;
      },
      async upsert(userId: number, planner: any) {
        const timestamp = now().toISOString();
        await db.insert(schema.studentProgressPlanners).values({ userId: Number(userId), planner, createdAt: timestamp, updatedAt: timestamp })
          .onConflictDoUpdate({ target: schema.studentProgressPlanners.userId, set: { planner, updatedAt: timestamp } });
        return repositories.progress.get(userId);
      },
    },
    plans: {
      async create(userId: number, input: any) {
        const timestamp = now().toISOString();
        return planRow((await db.insert(schema.planningProjects).values({ userId: Number(userId), name: String(input.name), currentDraft: input.draft || {}, createdAt: timestamp, updatedAt: timestamp }).returning())[0]);
      },
      async list(userId: number) {
        return (await db.select().from(schema.planningProjects).where(eq(schema.planningProjects.userId, Number(userId))).orderBy(desc(schema.planningProjects.updatedAt), desc(schema.planningProjects.id))).map(planRow);
      },
      async getOwned(userId: number, planId: number) {
        const row = (await db.select().from(schema.planningProjects).where(and(eq(schema.planningProjects.userId, Number(userId)), eq(schema.planningProjects.id, Number(planId)))).limit(1))[0];
        return row ? planRow(row) : null;
      },
      async createSnapshot(userId: number, planId: number, input: any) {
        if (!await repositories.plans.getOwned(userId, planId)) return null;
        return snapshotRow((await db.insert(schema.planningSnapshots).values({ userId: Number(userId), projectId: Number(planId), note: String(input.note || ""), snapshot: input.snapshot || {}, createdAt: now().toISOString() }).returning())[0]);
      },
      async getSnapshotOwned(userId: number, planId: number, snapshotId: number) {
        const row = (await db.select().from(schema.planningSnapshots).where(and(eq(schema.planningSnapshots.userId, Number(userId)), eq(schema.planningSnapshots.projectId, Number(planId)), eq(schema.planningSnapshots.id, Number(snapshotId)))).limit(1))[0];
        return row ? snapshotRow(row) : null;
      },
    },
    analytics: {
      async recordUsage(input: any) {
        const occurredAt = input.occurredAt || now().toISOString();
        return (await db.insert(schema.usageEvents).values({ userId: Number(input.userId), userName: String(input.userName || ""), userEmail: String(input.userEmail || ""),
          eventType: String(input.eventType), grade: input.grade || "", majorDirection: input.majorDirection || "", completionFields: Number(input.completionFields || 0),
          filledActivityCount: Number(input.filledActivityCount || 0), generatedActivityCount: Number(input.generatedActivityCount || 0), durationMs: Number(input.durationMs || 0),
          failureReason: input.failureReason || "", details: input.details || {}, occurredAt, eventDate: occurredAt.slice(0, 10), eventWeek: weekKey(new Date(occurredAt)),
          userAgent: input.userAgent || "", ipAddress: input.ipAddress || "" }).returning())[0];
      },
      async listByUser(userId: number) { return db.select().from(schema.usageEvents).where(eq(schema.usageEvents.userId, Number(userId))).orderBy(desc(schema.usageEvents.occurredAt), desc(schema.usageEvents.id)); },
    },
    audit: {
      async record(input: any) {
        const occurredAt = input.occurredAt || now().toISOString();
        return (await db.insert(schema.auditEvents).values({ actorUserId: input.actorUserId ? Number(input.actorUserId) : null, actorUserName: String(input.actorUserName || ""),
          actorUserEmail: String(input.actorUserEmail || ""), actorRole: String(input.actorRole || ""), action: String(input.action), resourceType: String(input.resourceType),
          resourceId: String(input.resourceId || ""), outcome: input.outcome === "failure" ? "failure" : "success", details: input.details || {}, occurredAt,
          eventDate: occurredAt.slice(0, 10), userAgent: input.userAgent || "", ipAddress: input.ipAddress || "" }).returning())[0];
      },
      async listByActor(userId: number) { return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorUserId, Number(userId))).orderBy(desc(schema.auditEvents.occurredAt), desc(schema.auditEvents.id)); },
    },
    async transaction(callback: any) {
      if (!transactionRunner) return callback(repositories);
      return transactionRunner(callback);
    },
  };
  return repositories;
}

function activityPortfolioToRow(userId: number, portfolio: any, timestamp: string) {
  return { userId, applicationPlan: portfolio.applicationPlan || {}, activities: portfolio.activities || [], competitions: portfolio.competitions || [], summerSchools: portfolio.summerSchools || [],
    recommendationLetters: portfolio.recommendationLetters || {}, planningActions: portfolio.planningActions || [], deepSeekNotes: portfolio.deepSeekNotes || [],
    schoolSelectionVersions: portfolio.schoolSelectionVersions || [], academicRecords: portfolio.academicRecords || {}, capabilityAssessment: portfolio.capabilityAssessment || {},
    createdAt: timestamp, updatedAt: timestamp };
}
function activityRowToPortfolio(row: any) { return { applicationPlan: row.applicationPlan, activities: row.activities, competitions: row.competitions, summerSchools: row.summerSchools,
  recommendationLetters: row.recommendationLetters, planningActions: row.planningActions, deepSeekNotes: row.deepSeekNotes, schoolSelectionVersions: row.schoolSelectionVersions,
  academicRecords: row.academicRecords, capabilityAssessment: row.capabilityAssessment }; }
const planRow = (row: any) => ({ id: row.id, userId: row.userId, name: row.name, draft: row.currentDraft, createdAt: row.createdAt, updatedAt: row.updatedAt });
const snapshotRow = (row: any) => ({ id: row.id, planId: row.projectId, userId: row.userId, note: row.note, snapshot: row.snapshot, createdAt: row.createdAt });
function weekKey(date: Date) { const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1)); const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7); return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`; }
