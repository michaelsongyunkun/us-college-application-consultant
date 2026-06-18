import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  applyPendingMigrations,
  recordMigrationAppliedIfMissing,
} from "./sqlite-migrations.mjs";

const AUTH_SCHEMA_BASELINE_MIGRATION = {
  id: "0001_auth_sqlite_baseline",
  description: "Current SQLite auth, planning, portfolio, analytics, and feedback schema.",
  up() {},
  down: dropAuthSchema,
};

export const AUTH_DATABASE_MIGRATIONS = [AUTH_SCHEMA_BASELINE_MIGRATION];

const USAGE_EVENT_TYPES = [
  "parse_codex_answer",
  "parse_codex_failure",
  "export_json",
  "export_svg",
  "export_word",
  "save_draft",
  "clear_draft",
  "generate_plan_success",
  "generate_plan_failure",
  "generate_deepseek_plan_success",
  "generate_deepseek_plan_failure",
  "build_codex_task",
  "copy_codex_task",
  "refresh_competitions",
  "refresh_summer_schools",
  "refresh_case_matches",
  "course_helper_visit",
  "refresh_ap_recommendations",
  "data_load_failure",
  "deepseek_rag_question_success",
  "deepseek_rag_question_failure",
  "deepseek_review_export",
  "deepseek_review_save",
  "deepseek_answer_save",
  "school_selection_generate_success",
  "school_selection_generate_failure",
  "school_selection_save",
  "school_selection_export_svg",
  "school_selection_export_word",
  "portfolio_save",
  "portfolio_import_activity",
  "gpa_sync_portfolio",
  "resource_filter_applied",
  "resource_load_more",
  "school_detail_open",
  "major_match_success",
  "major_match_failure",
];

function usageEventTypeSqlList() {
  return USAGE_EVENT_TYPES.map((eventType) => `'${eventType}'`).join(",\n          ");
}

export function createAuthDatabase({ databasePath }) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
      password_hash TEXT NOT NULL,
      login_count INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token_hash TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      user_email TEXT,
      occurred_at TEXT NOT NULL,
      login_date TEXT NOT NULL,
      login_week TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
      user_agent TEXT,
      ip_address TEXT,
      failure_reason TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (
        event_type IN (
          ${usageEventTypeSqlList()}
        )
      ),
      grade TEXT,
      major_direction TEXT,
      completion_fields INTEGER NOT NULL DEFAULT 0,
      filled_activity_count INTEGER NOT NULL DEFAULT 0,
      generated_activity_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT,
      details_json TEXT,
      occurred_at TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_week TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_user_name TEXT NOT NULL DEFAULT '',
      actor_user_email TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      details_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      event_date TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      issue_type TEXT NOT NULL,
      page_name TEXT NOT NULL,
      description TEXT NOT NULL,
      steps TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      feedback_status TEXT NOT NULL DEFAULT '未处理',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      feedback_date TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS student_activity_portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      application_plan_json TEXT NOT NULL DEFAULT '{}',
      activities_json TEXT NOT NULL,
      competitions_json TEXT NOT NULL,
      summer_schools_json TEXT NOT NULL,
      recommendation_letters_json TEXT NOT NULL,
      planning_actions_json TEXT NOT NULL DEFAULT '[]',
      deepseek_notes_json TEXT NOT NULL DEFAULT '[]',
      school_selection_versions_json TEXT NOT NULL DEFAULT '[]',
      academic_records_json TEXT NOT NULL DEFAULT '{}',
      capability_assessment_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_progress_planners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      planner_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS planning_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      current_draft_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS planning_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES planning_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
      ON password_reset_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
      ON password_reset_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_login_events_occurred_at ON login_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_login_events_status ON login_events(status);
    CREATE INDEX IF NOT EXISTS idx_login_events_user_id ON login_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_usage_events_occurred_at ON usage_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id ON audit_events(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_entries_user_id ON feedback_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_entries_created_at ON feedback_entries(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_entries_feedback_date ON feedback_entries(feedback_date);
    CREATE INDEX IF NOT EXISTS idx_student_activity_portfolios_user_id
      ON student_activity_portfolios(user_id);
    CREATE INDEX IF NOT EXISTS idx_student_progress_planners_user_id
      ON student_progress_planners(user_id);
    CREATE INDEX IF NOT EXISTS idx_planning_projects_user_id ON planning_projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_planning_snapshots_project_id ON planning_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_planning_snapshots_user_id ON planning_snapshots(user_id);
  `);

  ensureColumn(db, "users", "login_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "last_login_at", "TEXT");
  ensureColumn(db, "sessions", "csrf_token_hash", "TEXT");
  ensureColumn(db, "usage_events", "completion_fields", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "usage_events", "filled_activity_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "usage_events", "generated_activity_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "usage_events", "duration_ms", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "usage_events", "failure_reason", "TEXT");
  ensureColumn(db, "usage_events", "details_json", "TEXT");
  ensureColumn(db, "feedback_entries", "feedback_status", "TEXT NOT NULL DEFAULT '未处理'");
  ensureColumn(db, "feedback_entries", "admin_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    db,
    "student_activity_portfolios",
    "application_plan_json",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(
    db,
    "student_activity_portfolios",
    "academic_records_json",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(
    db,
    "student_activity_portfolios",
    "planning_actions_json",
    "TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    db,
    "student_activity_portfolios",
    "deepseek_notes_json",
    "TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    db,
    "student_activity_portfolios",
    "school_selection_versions_json",
    "TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    db,
    "student_activity_portfolios",
    "capability_assessment_json",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  migrateUsageEventsConstraint(db);
  recordMigrationAppliedIfMissing(db, AUTH_SCHEMA_BASELINE_MIGRATION);
  applyPendingMigrations(db, AUTH_DATABASE_MIGRATIONS);
  return {
    db,
    close() {
      db.close();
    },
  };
}

function dropAuthSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS planning_snapshots;
    DROP TABLE IF EXISTS planning_projects;
    DROP TABLE IF EXISTS student_progress_planners;
    DROP TABLE IF EXISTS student_activity_portfolios;
    DROP TABLE IF EXISTS feedback_entries;
    DROP TABLE IF EXISTS student_profiles;
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS usage_events;
    DROP TABLE IF EXISTS login_events;
    DROP TABLE IF EXISTS password_reset_tokens;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}

function migrateUsageEventsConstraint(db) {
  const table = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'")
    .get();
  if (!table?.sql) return;
  if (USAGE_EVENT_TYPES.every((eventType) => table.sql.includes(`'${eventType}'`))) return;

  db.exec(`
    ALTER TABLE usage_events RENAME TO usage_events_old;

    CREATE TABLE usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (
        event_type IN (
          ${usageEventTypeSqlList()}
        )
      ),
      grade TEXT,
      major_direction TEXT,
      completion_fields INTEGER NOT NULL DEFAULT 0,
      filled_activity_count INTEGER NOT NULL DEFAULT 0,
      generated_activity_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT,
      details_json TEXT,
      occurred_at TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_week TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO usage_events (
      id,
      user_id,
      user_name,
      user_email,
      event_type,
      grade,
      major_direction,
      completion_fields,
      filled_activity_count,
      generated_activity_count,
      duration_ms,
      failure_reason,
      details_json,
      occurred_at,
      event_date,
      event_week,
      user_agent,
      ip_address
    )
    SELECT
      id,
      user_id,
      user_name,
      user_email,
      event_type,
      grade,
      major_direction,
      completion_fields,
      filled_activity_count,
      generated_activity_count,
      duration_ms,
      failure_reason,
      details_json,
      occurred_at,
      event_date,
      event_week,
      user_agent,
      ip_address
    FROM usage_events_old;

    DROP TABLE usage_events_old;

    CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_usage_events_occurred_at ON usage_events(occurred_at);
  `);
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
}
