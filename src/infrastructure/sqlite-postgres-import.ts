import { createHash } from "node:crypto";

export const SQLITE_POSTGRES_TABLES = [
  table("users", ["id", "email", "password_hash", "role", "created_at", "updated_at"]),
  table("sessions", ["id", "user_id", "token_hash", "expires_at"]),
  table("password_reset_tokens", ["id", "user_id", "token_hash", "expires_at", "used_at"]),
  table("login_events", ["id", "user_id", "occurred_at", "status"]),
  table("usage_events", ["id", "user_id", "event_type", "details_json", "occurred_at"]),
  table("audit_events", ["id", "actor_user_id", "action", "resource_type", "resource_id", "details_json", "occurred_at"]),
  table("student_profiles", ["id", "user_id", "profile_json", "updated_at"]),
  table("feedback_entries", ["id", "user_id", "description", "feedback_status", "created_at"]),
  table("student_activity_portfolios", ["id", "user_id", "activities_json", "application_plan_json", "updated_at"]),
  table("student_progress_planners", ["id", "user_id", "planner_json", "updated_at"]),
  table("planning_projects", ["id", "user_id", "name", "current_draft_json", "updated_at"]),
  table("planning_snapshots", ["id", "project_id", "user_id", "snapshot_json", "created_at"]),
];

const JSON_COLUMNS = new Set([
  "details_json", "profile_json", "application_plan_json", "activities_json", "competitions_json", "summer_schools_json",
  "recommendation_letters_json", "planning_actions_json", "deepseek_notes_json", "school_selection_versions_json",
  "academic_records_json", "capability_assessment_json", "planner_json", "current_draft_json", "snapshot_json", "metadata_json",
]);

export function hashCriticalRows(rows: Record<string, any>[], fields: string[]) {
  const normalized = rows.map((row) => fields.map((field) => normalizeHashValue(row[field]))).sort(compareTuples);
  return createHash("sha256").update(stableStringify(normalized)).digest("hex");
}

export function normalizeSqliteValueForPostgres(column: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (!JSON_COLUMNS.has(column)) return value;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new Error(`Invalid JSON in ${column}`); }
}

export function compareMigrationValidation(source: any, target: any) {
  const mismatches: any[] = [];
  const tables = new Set([...Object.keys(source.rowCounts || {}), ...Object.keys(target.rowCounts || {})]);
  for (const tableName of tables) {
    if (source.rowCounts?.[tableName] !== target.rowCounts?.[tableName]) {
      mismatches.push({ type: "row_count", table: tableName, source: source.rowCounts?.[tableName] ?? null, target: target.rowCounts?.[tableName] ?? null });
    }
    if (source.criticalHashes?.[tableName] !== target.criticalHashes?.[tableName]) {
      mismatches.push({ type: "critical_hash", table: tableName, source: source.criticalHashes?.[tableName] ?? null, target: target.criticalHashes?.[tableName] ?? null });
    }
  }
  for (const violation of source.foreignKeyViolations || []) mismatches.push({ type: "source_foreign_key", violation });
  for (const violation of target.foreignKeyViolations || []) mismatches.push({ type: "target_foreign_key", violation });
  return { ok: mismatches.length === 0, mismatches };
}

export function createSqliteToPostgresImporter({ sqlite, pool, tables = SQLITE_POSTGRES_TABLES, now = () => new Date() }: any) {
  async function inspectSource() {
    const report = { rowCounts: {} as Record<string, number>, criticalHashes: {} as Record<string, string>, foreignKeyViolations: sqlite.pragma("foreign_key_check") };
    for (const definition of tables) {
      const rows = sqlite.prepare(`SELECT * FROM ${quoteSqliteIdentifier(definition.name)} ORDER BY id`).all();
      report.rowCounts[definition.name] = rows.length;
      report.criticalHashes[definition.name] = hashCriticalRows(rows, definition.criticalFields);
    }
    return report;
  }

  async function inspectTarget(client = pool) {
    const report = { rowCounts: {} as Record<string, number>, criticalHashes: {} as Record<string, string>, foreignKeyViolations: [] as any[] };
    for (const definition of tables) {
      const { rows } = await client.query(`SELECT * FROM ${quotePostgresIdentifier(definition.name)} ORDER BY id`);
      report.rowCounts[definition.name] = rows.length;
      report.criticalHashes[definition.name] = hashCriticalRows(rows, definition.criticalFields);
    }
    return report;
  }

  async function run({ dryRun = true, replace = false } = {}) {
    const startedAt = now().toISOString();
    const source = await inspectSource();
    if (source.foreignKeyViolations.length) {
      return { dryRun, ok: false, startedAt, completedAt: now().toISOString(), source, target: null, validation: { ok: false, mismatches: source.foreignKeyViolations.map((violation: any) => ({ type: "source_foreign_key", violation })) } };
    }
    if (dryRun) {
      return { dryRun: true, ok: true, startedAt, completedAt: now().toISOString(), source, plannedRows: Object.values(source.rowCounts).reduce((sum, count) => sum + count, 0) };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (replace) {
        await client.query(`TRUNCATE ${[...tables].reverse().map((entry) => quotePostgresIdentifier(entry.name)).join(", ")} RESTART IDENTITY CASCADE`);
      } else {
        const targetBefore = await inspectTarget(client);
        if (Object.values(targetBefore.rowCounts).some((count) => count > 0)) throw new Error("PostgreSQL target is not empty; use replace only after backup and maintenance lock.");
      }
      for (const definition of tables) {
        const rows = sqlite.prepare(`SELECT * FROM ${quoteSqliteIdentifier(definition.name)} ORDER BY id`).all();
        for (const row of rows) await insertRow(client, definition.name, row);
        await resetSerial(client, definition.name);
      }
      const target = await inspectTarget(client);
      const validation = compareMigrationValidation(source, target);
      if (!validation.ok) throw Object.assign(new Error("Migration validation failed; PostgreSQL transaction rolled back."), { validation, source, target });
      await client.query("COMMIT");
      return { dryRun: false, ok: true, startedAt, completedAt: now().toISOString(), source, target, validation };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { inspectSource, inspectTarget, run };
}

async function insertRow(client: any, tableName: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const values = columns.map((column) => normalizeSqliteValueForPostgres(column, row[column]));
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(`INSERT INTO ${quotePostgresIdentifier(tableName)} (${columns.map(quotePostgresIdentifier).join(", ")}) VALUES (${placeholders})`, values);
}

async function resetSerial(client: any, tableName: string) {
  await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quotePostgresIdentifier(tableName)}), 1), (SELECT COUNT(*) > 0 FROM ${quotePostgresIdentifier(tableName)}))`, [tableName]);
}

function table(name: string, criticalFields: string[]) { return { name, criticalFields }; }
function quotePostgresIdentifier(value: string) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error("Unsafe PostgreSQL identifier"); return `"${value}"`; }
function quoteSqliteIdentifier(value: string) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error("Unsafe SQLite identifier"); return `"${value}"`; }
function normalizeHashValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") { try { return JSON.parse(value); } catch { return value; } }
  return value;
}
function compareTuples(left: any[], right: any[]) { return stableStringify(left).localeCompare(stableStringify(right)); }
function stableStringify(value: any): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
