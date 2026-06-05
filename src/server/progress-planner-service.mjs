import { normalizePlannerState } from "../domain/progress-planner.mjs";

export class ProgressPlannerError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ProgressPlannerError";
    this.statusCode = statusCode;
  }
}

export function createProgressPlannerService({ authDb, now = () => new Date() }) {
  const db = authDb.db;

  function getPlanner(user) {
    const row = db
      .prepare(
        `SELECT planner_json, updated_at
        FROM student_progress_planners
        WHERE user_id = ?`,
      )
      .get(requireUserId(user));
    if (!row) return emptyPlanner();
    return {
      ...parsePlanner(row.planner_json),
      updatedAt: row.updated_at,
    };
  }

  function savePlanner(user, payload = {}) {
    const userId = requireUserId(user);
    const planner = normalizePlannerState(payload, { now });
    const timestamp = now().toISOString();
    db.prepare(
      `INSERT INTO student_progress_planners (
        user_id,
        planner_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        planner_json = excluded.planner_json,
        updated_at = excluded.updated_at`,
    ).run(userId, JSON.stringify(planner), timestamp, timestamp);
    return getPlanner(user);
  }

  return {
    getPlanner,
    savePlanner,
  };
}

function emptyPlanner() {
  return {
    tasks: [],
    checkIns: [],
    updatedAt: null,
  };
}

function parsePlanner(serialized) {
  try {
    return normalizePlannerState(JSON.parse(serialized || "{}"));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ProgressPlannerError) {
      throw new ProgressPlannerError("Stored progress planner is invalid", 500);
    }
    throw error;
  }
}

function requireUserId(user) {
  const id = Number(user?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ProgressPlannerError("Not authenticated", 401);
  }
  return id;
}
