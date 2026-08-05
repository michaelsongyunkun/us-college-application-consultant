import { normalizePlannerState } from "../domain/progress-planner.mjs";
import { normalizeSnapshotNote } from "../shared/privacy-guards.mjs";
import { emptyPortfolio, normalizePortfolio } from "../server/activity-portfolio-service.mjs";
import { AuthError, USAGE_EVENT_TYPES } from "../server/auth-service.mjs";
import { PlanningError, emptyDraft, normalizeDraft, normalizePlanName } from "../server/planning-service.mjs";
import { createPostgresProductionRepositories } from "./postgres-production-repositories.js";

export function createPostgresWorkspaceRuntime({ pool, now = () => new Date() }: any) {
  const core = createPostgresProductionRepositories({ pool, now });

  const planning = {
    async getProfile(user: any) { return await core.profiles.get(requireUserId(user)) || { profile: {}, updatedAt: null }; },
    async saveProfile(user: any, profile: any) { return core.profiles.upsert(requireUserId(user), profile); },
    async listPlans(user: any) { await ensureDefaultPlan(user); const { rows } = await pool.query('SELECT id, name, created_at AS "createdAt", updated_at AS "updatedAt" FROM planning_projects WHERE user_id=$1 ORDER BY updated_at DESC, id DESC', [requireUserId(user)]); return rows; },
    async createPlan(user: any, { name }: any = {}) {
      return core.plans.create(requireUserId(user), { name: normalizePlanName(name), draft: emptyDraft() });
    },
    async getPlan(user: any, planId: any) {
      const row = await core.plans.getOwned(requireUserId(user), Number(planId));
      if (!row) throw new PlanningError("Planning project not found", 404);
      return row;
    },
    async savePlan(user: any, planId: any, payload: any = {}) {
      const userId = requireUserId(user);
      const current = await planning.getPlan(user, planId);
      const name = Object.hasOwn(payload, "name") ? normalizePlanName(payload.name) : current.name;
      const draft = Object.hasOwn(payload, "draft") ? normalizeDraft(payload.draft) : current.draft;
      const { rows } = await pool.query('UPDATE planning_projects SET name=$1, current_draft_json=$2, updated_at=$3 WHERE id=$4 AND user_id=$5 RETURNING id, user_id AS "userId", name, current_draft_json AS draft, created_at AS "createdAt", updated_at AS "updatedAt"', [name, draft, now().toISOString(), Number(planId), userId]);
      return rows[0];
    },
    async deletePlan(user: any, planId: any) {
      const userId = requireUserId(user);
      await planning.getPlan(user, planId);
      const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM planning_projects WHERE user_id=$1", [userId]);
      if (rows[0].count <= 1) throw new PlanningError("At least one planning project is required", 409);
      await pool.query("DELETE FROM planning_projects WHERE id=$1 AND user_id=$2", [Number(planId), userId]);
      return { ok: true };
    },
    async listSnapshots(user: any, planId: any) {
      const userId = requireUserId(user); await planning.getPlan(user, planId);
      const { rows } = await pool.query('SELECT id, note, created_at AS "createdAt" FROM planning_snapshots WHERE project_id=$1 AND user_id=$2 ORDER BY created_at DESC, id DESC', [Number(planId), userId]);
      return rows;
    },
    async createSnapshot(user: any, planId: any, { note = "" }: any = {}) {
      const userId = requireUserId(user);
      const [plan, profile] = await Promise.all([planning.getPlan(user, planId), planning.getProfile(user)]);
      const { rows } = await pool.query('INSERT INTO planning_snapshots (project_id,user_id,note,snapshot_json,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id,note,created_at AS "createdAt"', [Number(planId), userId, normalizeSnapshotNote(note), { profile: profile.profile, draft: plan.draft }, now().toISOString()]);
      return rows[0];
    },
    async deleteSnapshot(user: any, planId: any, snapshotId: any) {
      const userId = requireUserId(user); await planning.getPlan(user, planId);
      const result = await pool.query("DELETE FROM planning_snapshots WHERE id=$1 AND project_id=$2 AND user_id=$3", [Number(snapshotId), Number(planId), userId]);
      if (!result.rowCount) throw new PlanningError("Snapshot not found", 404);
      return { ok: true };
    },
    async restoreSnapshot(user: any, planId: any, snapshotId: any) {
      const userId = requireUserId(user); await planning.getPlan(user, planId);
      const { rows } = await pool.query("SELECT snapshot_json FROM planning_snapshots WHERE id=$1 AND project_id=$2 AND user_id=$3", [Number(snapshotId), Number(planId), userId]);
      if (!rows[0]) throw new PlanningError("Snapshot not found", 404);
      const snapshot = rows[0].snapshot_json;
      const client = await pool.connect();
      const timestamp = now().toISOString();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO student_profiles (user_id,profile_json,created_at,updated_at) VALUES ($1,$2,$3,$3) ON CONFLICT (user_id) DO UPDATE SET profile_json=EXCLUDED.profile_json,updated_at=EXCLUDED.updated_at", [userId, snapshot.profile || {}, timestamp]);
        await client.query("UPDATE planning_projects SET current_draft_json=$1, updated_at=$2 WHERE id=$3 AND user_id=$4", [normalizeDraft(snapshot.draft || {}), timestamp, Number(planId), userId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
      return { profile: await planning.getProfile(user), plan: await planning.getPlan(user, planId) };
    },
    async listActivityImportSources(user: any) {
      const userId = requireUserId(user); await ensureDefaultPlan(user);
      const { rows } = await pool.query('SELECT id,name,current_draft_json AS draft,updated_at AS "updatedAt" FROM planning_projects WHERE user_id=$1 ORDER BY updated_at DESC,id DESC', [userId]);
      return rows.map((plan: any) => ({ id: `plan-${plan.id}-current`, sourceType: "current_plan", planId: plan.id, planName: plan.name, label: `${plan.name} · 当前方案`, savedAt: plan.updatedAt, draft: plan.draft }));
    },
    async listRagBackups(user: any) {
      const userId = requireUserId(user); await ensureDefaultPlan(user);
      const { rows: plans } = await pool.query('SELECT id AS "planId",name AS "planName",current_draft_json AS draft,updated_at AS "savedAt" FROM planning_projects WHERE user_id=$1 ORDER BY updated_at DESC,id DESC', [userId]);
      const { rows: snapshots } = await pool.query('SELECT s.id AS "snapshotId",s.project_id AS "planId",p.name AS "planName",s.note,s.snapshot_json->\'draft\' AS draft,s.created_at AS "savedAt" FROM planning_snapshots s JOIN planning_projects p ON p.id=s.project_id WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id DESC', [userId]);
      return [...plans.map((entry: any) => ({ ...entry, sourceType: "current_plan" })), ...snapshots.map((entry: any) => ({ ...entry, sourceType: "snapshot" }))];
    },
    async getLatestRagPlan(user: any) {
      const userId = requireUserId(user); await ensureDefaultPlan(user);
      const { rows } = await pool.query('SELECT id AS "planId",name AS "planName",current_draft_json AS draft,updated_at AS "savedAt" FROM planning_projects WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1', [userId]);
      return rows[0] ? { ...rows[0], sourceType: "current_plan" } : null;
    },
    async exportUserData(user: any) { return { profile: await planning.getProfile(user), plans: await planning.listPlans(user), ragBackups: await planning.listRagBackups(user) }; },
  };

  const activityPortfolio = {
    async getPortfolio(user: any) { return (await core.activities.get(requireUserId(user)))?.portfolio || emptyPortfolio(); },
    async savePortfolio(user: any, payload: any = {}) { return (await core.activities.upsert(requireUserId(user), normalizePortfolio(payload))).portfolio; },
  };
  const progressPlanner = {
    async getPlanner(user: any) { return (await core.progress.get(requireUserId(user)))?.planner || { tasks: [], checkIns: [], updatedAt: null }; },
    async savePlanner(user: any, payload: any = {}) { return (await core.progress.upsert(requireUserId(user), normalizePlannerState(payload, { now }))).planner; },
  };

  const repositories = {
    profiles: { get: planning.getProfile, save: planning.saveProfile },
    activities: { get: activityPortfolio.getPortfolio, save: activityPortfolio.savePortfolio, listImportSources: planning.listActivityImportSources },
    progress: { get: progressPlanner.getPlanner, save: progressPlanner.savePlanner },
    plans: {
      list: planning.listPlans, create: planning.createPlan, get: planning.getPlan, save: planning.savePlan, delete: planning.deletePlan,
      listSnapshots: planning.listSnapshots, createSnapshot: planning.createSnapshot, deleteSnapshot: planning.deleteSnapshot, restoreSnapshot: planning.restoreSnapshot,
    },
    analytics: {
      async record(user: any, event: any, metadata: any) {
        if (!USAGE_EVENT_TYPES.has(event?.eventType)) throw new AuthError("Unsupported usage event", 400);
        await core.analytics.recordUsage(buildPostgresUsageRecord(user, event, metadata));
      },
      async audit(input: any) { await core.audit.record({ actorUserId: input.actor?.id, actorUserName: input.actor?.name, actorUserEmail: input.actor?.email, actorRole: input.actor?.role, action: input.action, resourceType: input.resourceType, resourceId: input.resourceId, outcome: input.outcome, details: input.details, ...input.metadata }); },
    },
  };

  async function ensureDefaultPlan(user: any) {
    const userId = requireUserId(user);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise the check-and-create pair per user. A regular SELECT followed
      // by INSERT allows concurrent requests to create duplicate default plans.
      await client.query("SELECT pg_advisory_xact_lock($1, $2)", [762019, userId]);
      const { rows } = await client.query("SELECT id FROM planning_projects WHERE user_id=$1 LIMIT 1", [userId]);
      if (!rows.length) {
        const timestamp = now().toISOString();
        await client.query(
          "INSERT INTO planning_projects (user_id,name,current_draft_json,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)",
          [userId, "默认规划", emptyDraft(), timestamp],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { core, repositories, planning, activityPortfolio, progressPlanner };
}

export function buildPostgresUsageRecord(user: any, event: any, metadata: any = {}) {
  const metrics = event?.metrics || {};
  const details = event?.details || {};
  return {
    eventType: event?.eventType,
    grade: event?.profile?.grade,
    majorDirection: event?.profile?.majorDirection,
    completionFields: metrics.completionFields,
    filledActivityCount: metrics.filledActivityCount,
    generatedActivityCount: metrics.generatedActivityCount,
    durationMs: metrics.durationMs,
    failureReason: details.failureReason,
    details,
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
  };
}

function requireUserId(user: any) { const id = Number(user?.id); if (!Number.isInteger(id) || id <= 0) throw new PlanningError("Not authenticated", 401); return id; }
