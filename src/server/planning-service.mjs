import { normalizeSnapshotNote, stripSensitiveDraftFields } from "../shared/privacy-guards.mjs";
import { markdownToPlainText } from "../domain/agent-output-parser.mjs";

const DEFAULT_PLAN_NAME = "默认规划";
const MAX_PLAN_NAME_LENGTH = 80;

export class PlanningError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PlanningError";
    this.statusCode = statusCode;
  }
}

export function createPlanningService({ authDb, now = () => new Date() }) {
  const db = authDb.db;

  function getProfile(user) {
    const row = db
      .prepare("SELECT profile_json, updated_at FROM student_profiles WHERE user_id = ?")
      .get(requireUserId(user));
    if (!row) return { profile: {}, updatedAt: null };
    return {
      profile: parseObject(row.profile_json),
      updatedAt: row.updated_at,
    };
  }

  function saveProfile(user, profile) {
    const userId = requireUserId(user);
    const normalizedProfile = normalizeObject(profile, "Profile");
    const timestamp = isoNow(now);
    db.prepare(`
      INSERT INTO student_profiles (user_id, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        profile_json = excluded.profile_json,
        updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(normalizedProfile), timestamp, timestamp);
    return getProfile(user);
  }

  function listPlans(user) {
    const userId = requireUserId(user);
    ensureDefaultPlan(userId);
    return db
      .prepare(`
        SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
        FROM planning_projects
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
      `)
      .all(userId);
  }

  function createPlan(user, { name } = {}) {
    const userId = requireUserId(user);
    const normalizedName = normalizePlanName(name);
    const timestamp = isoNow(now);
    const result = db.prepare(`
      INSERT INTO planning_projects (user_id, name, current_draft_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, normalizedName, JSON.stringify(emptyDraft()), timestamp, timestamp);
    return getPlan(user, Number(result.lastInsertRowid));
  }

  function getPlan(user, planId) {
    const row = getOwnedPlanRow(requireUserId(user), planId);
    return serializePlan(row);
  }

  function savePlan(user, planId, payload = {}) {
    const userId = requireUserId(user);
    const current = getOwnedPlanRow(userId, planId);
    const name =
      Object.hasOwn(payload, "name") && payload.name !== undefined
        ? normalizePlanName(payload.name)
        : current.name;
    const draft =
      Object.hasOwn(payload, "draft") && payload.draft !== undefined
        ? normalizeDraft(payload.draft)
        : parseDraft(current.current_draft_json);
    db.prepare(`
      UPDATE planning_projects
      SET name = ?, current_draft_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(name, JSON.stringify(draft), isoNow(now), Number(planId), userId);
    return getPlan(user, planId);
  }

  function deletePlan(user, planId) {
    const userId = requireUserId(user);
    getOwnedPlanRow(userId, planId);
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM planning_projects WHERE user_id = ?")
      .get(userId);
    if (count <= 1) {
      throw new PlanningError("At least one planning project is required", 409);
    }
    db.prepare("DELETE FROM planning_projects WHERE id = ? AND user_id = ?").run(
      Number(planId),
      userId,
    );
    return { ok: true };
  }

  function listSnapshots(user, planId) {
    const userId = requireUserId(user);
    getOwnedPlanRow(userId, planId);
    return db
      .prepare(`
        SELECT id, note, created_at AS createdAt
        FROM planning_snapshots
        WHERE project_id = ? AND user_id = ?
        ORDER BY created_at DESC, id DESC
      `)
      .all(Number(planId), userId);
  }

  function createSnapshot(user, planId, { note = "" } = {}) {
    const userId = requireUserId(user);
    const plan = getPlan(user, planId);
    const profile = getProfile(user).profile;
    const result = db.prepare(`
      INSERT INTO planning_snapshots (project_id, user_id, note, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Number(planId),
      userId,
      normalizeSnapshotNote(note),
      JSON.stringify({ profile, draft: plan.draft }),
      isoNow(now),
    );
    return db
      .prepare("SELECT id, note, created_at AS createdAt FROM planning_snapshots WHERE id = ?")
      .get(Number(result.lastInsertRowid));
  }

  function restoreSnapshot(user, planId, snapshotId) {
    const userId = requireUserId(user);
    getOwnedPlanRow(userId, planId);
    const snapshotRow = db
      .prepare(`
        SELECT snapshot_json
        FROM planning_snapshots
        WHERE id = ? AND project_id = ? AND user_id = ?
      `)
      .get(Number(snapshotId), Number(planId), userId);
    if (!snapshotRow) throw new PlanningError("Snapshot not found", 404);
    const snapshot = parseObject(snapshotRow.snapshot_json);
    const restore = db.transaction(() => {
      saveProfile(user, normalizeObject(snapshot.profile, "Snapshot profile"));
      savePlan(user, planId, { draft: normalizeDraft(snapshot.draft) });
    });
    restore();
    return {
      profile: getProfile(user),
      plan: getPlan(user, planId),
    };
  }

  function deleteSnapshot(user, planId, snapshotId) {
    const userId = requireUserId(user);
    getOwnedPlanRow(userId, planId);
    const result = db
      .prepare(`
        DELETE FROM planning_snapshots
        WHERE id = ? AND project_id = ? AND user_id = ?
      `)
      .run(Number(snapshotId), Number(planId), userId);
    if (!result.changes) throw new PlanningError("Snapshot not found", 404);
    return { ok: true };
  }

  function listActivityImportSources(user) {
    const userId = requireUserId(user);
    ensureDefaultPlan(userId);
    const planRows = db
      .prepare(`
        SELECT id, name, current_draft_json, updated_at AS updatedAt
        FROM planning_projects
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
      `)
      .all(userId);

    return planRows.flatMap((plan) => {
      const currentSource = buildActivityImportSource({
        id: `plan-${plan.id}-current`,
        sourceType: "current_plan",
        planId: plan.id,
        planName: plan.name,
        label: `${plan.name} · 当前方案`,
        savedAt: plan.updatedAt,
        draft: parseDraft(plan.current_draft_json),
      });
      const snapshotSources = db
        .prepare(`
          SELECT id, note, snapshot_json, created_at AS createdAt
          FROM planning_snapshots
          WHERE project_id = ? AND user_id = ?
          ORDER BY created_at DESC, id DESC
        `)
        .all(plan.id, userId)
        .map((snapshot) => {
          const snapshotData = parseObject(snapshot.snapshot_json);
          return buildActivityImportSource({
            id: `snapshot-${snapshot.id}`,
            sourceType: "snapshot",
            planId: plan.id,
            snapshotId: snapshot.id,
            planName: plan.name,
            note: snapshot.note,
            label: `${plan.name} · ${snapshot.note || "未填写备注"}`,
            savedAt: snapshot.createdAt,
            draft: normalizeDraft(snapshotData.draft || {}),
          });
        });
      return [currentSource, ...snapshotSources].filter(Boolean);
    });
  }

  function ensureDefaultPlan(userId) {
    const existing = db
      .prepare("SELECT id FROM planning_projects WHERE user_id = ? LIMIT 1")
      .get(userId);
    if (existing) return;
    const timestamp = isoNow(now);
    db.prepare(`
      INSERT INTO planning_projects (user_id, name, current_draft_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, DEFAULT_PLAN_NAME, JSON.stringify(emptyDraft()), timestamp, timestamp);
  }

  function getOwnedPlanRow(userId, planId) {
    const id = Number(planId);
    if (!Number.isInteger(id) || id <= 0) throw new PlanningError("Plan not found", 404);
    const row = db
      .prepare("SELECT * FROM planning_projects WHERE id = ? AND user_id = ?")
      .get(id, userId);
    if (!row) throw new PlanningError("Plan not found", 404);
    return row;
  }

  return {
    getProfile,
    saveProfile,
    listPlans,
    createPlan,
    getPlan,
    savePlan,
    deletePlan,
    listSnapshots,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    listActivityImportSources,
  };
}

function emptyDraft() {
  return {
    activities: [],
    rawAnswer: "",
    narrative: "",
    competitionRecommendations: [],
    summerSchoolRecommendations: [],
    recommendationLetterStrategy: { items: [] },
    caseMatches: [],
  };
}

function normalizeDraft(value) {
  const draft = stripSensitiveDraftFields(normalizeObject(value, "Plan draft"));
  return { ...emptyDraft(), ...draft };
}

function parseDraft(serialized) {
  return normalizeDraft(parseObject(serialized));
}

function serializePlan(row) {
  return {
    id: row.id,
    name: row.name,
    draft: parseDraft(row.current_draft_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildActivityImportSource(source) {
  const activities = normalizeImportActivities(source.draft?.activities);
  if (!activities.length) return null;
  return {
    id: source.id,
    sourceType: source.sourceType,
    planId: source.planId,
    snapshotId: source.snapshotId,
    planName: source.planName,
    note: source.note || "",
    label: source.label,
    savedAt: source.savedAt,
    activities,
  };
}

function normalizeImportActivities(activities) {
  if (!Array.isArray(activities)) return [];
  return activities
    .slice(0, 10)
    .map((activity, index) => ({
      id: Number(activity?.id) || index + 1,
      type: normalizeText(activity?.type),
      activityName: normalizeText(activity?.activityName || activity?.name || activity?.title),
      description: normalizeText(activity?.executionDescription || activity?.description),
      timeStage: normalizeText(activity?.suggestedGrade || activity?.timeStage),
      status: "计划中",
    }))
    .filter((activity) =>
      [activity.type, activity.activityName, activity.description, activity.timeStage].some(Boolean),
    );
}

function normalizeText(value) {
  return markdownToPlainText(value);
}

function normalizeObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanningError(`${label} must be an object`, 400);
  }
  return value;
}

function parseObject(serialized) {
  try {
    return normalizeObject(JSON.parse(serialized), "Stored data");
  } catch (error) {
    if (error instanceof PlanningError) throw error;
    throw new PlanningError("Stored planning data is invalid", 500);
  }
}

function normalizePlanName(value) {
  const name = String(value ?? "").trim();
  if (!name) throw new PlanningError("Plan name is required", 400);
  if (name.length > MAX_PLAN_NAME_LENGTH) {
    throw new PlanningError(`Plan name cannot exceed ${MAX_PLAN_NAME_LENGTH} characters`, 400);
  }
  return name;
}

function requireUserId(user) {
  const id = Number(user?.id);
  if (!Number.isInteger(id) || id <= 0) throw new PlanningError("Not authenticated", 401);
  return id;
}

function isoNow(now) {
  return now().toISOString();
}
