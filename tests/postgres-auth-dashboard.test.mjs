import assert from "node:assert/strict";
import { createPostgresAuthService } from "../src/server/postgres-auth-service.ts";

const queries = [];
const allUsageSummary = [
  { eventType: "generate_deepseek_plan_success", count: 2 },
  { eventType: "save_draft", count: 3 },
  { eventType: "export_word", count: 1 },
  { eventType: "refresh_competitions", count: 4 },
  { eventType: "data_load_failure", count: 2 },
];
const pool = {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/gu, " ").trim();
    queries.push({ sql: normalized, params });
    if (normalized.includes("FROM users")) {
      return { rows: [{ id: 1, name: "Student User", email: "student@example.com", role: "user", loginCount: 2 }] };
    }
    if (normalized.includes("FROM login_events") && normalized.includes("GROUP BY login_date")) {
      return { rows: [{ date: "2026-07-12", status: "failure", count: 1 }] };
    }
    if (normalized.includes("FROM login_events") && normalized.includes("GROUP BY login_week")) {
      return { rows: [{ week: "2026-W28", status: "failure", count: 1 }] };
    }
    if (normalized.includes("FROM login_events") && normalized.includes("COUNT(*)")) {
      return { rows: [{ count: 1 }] };
    }
    if (normalized.includes("FROM login_events")) {
      return { rows: [{ id: 10, userId: 1, userName: "Student User", userEmail: "student@example.com", status: "failure", occurredAt: "2026-07-12T10:00:00.000Z" }] };
    }
    if (normalized.includes("FROM usage_events") && normalized.includes("COUNT(DISTINCT user_id)")) {
      return { rows: [{ count: 2 }] };
    }
    if (normalized.includes("FROM usage_events") && normalized.includes("GROUP BY event_type")) {
      return {
        rows: normalized.includes("event_type =")
          ? allUsageSummary.filter((item) => item.eventType === "export_word")
          : allUsageSummary,
      };
    }
    if (normalized.includes("FROM usage_events")) {
      return { rows: [{ id: 20, userId: 1, userName: "Student User", userEmail: "student@example.com", eventType: "export_word", occurredAt: "2026-07-12T11:00:00.000Z", details: {} }] };
    }
    if (normalized.includes("FROM feedback_entries")) return { rows: [] };
    if (normalized.includes("FROM audit_events")) return { rows: [] };
    throw new Error(`Unexpected dashboard query: ${normalized}`);
  },
};

const auth = createPostgresAuthService({ pool });
await assert.rejects(
  () => auth.recordUsageEvent({ user: { id: 1 }, eventType: "unsupported_event" }),
  (error) => error?.statusCode === 400 && error?.message === "Unsupported usage event",
);
const dashboard = await auth.getLoginDashboard({
  requester: { id: 99, role: "admin" },
  filters: {
    query: "student",
    status: "failure",
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
    eventType: "export_word",
  },
});

assert.deepEqual(dashboard.overview, {
  activeUsers: 2,
  aiActions: 2,
  saveActions: 3,
  exportActions: 1,
  recommendationActions: 4,
  failureEvents: 3,
});
assert.deepEqual(dashboard.dailyActivity, [{ date: "2026-07-12", status: "failure", count: 1 }]);
assert.deepEqual(dashboard.weeklyActivity, [{ week: "2026-W28", status: "failure", count: 1 }]);
assert.deepEqual(dashboard.usageSummary, [{ eventType: "export_word", count: 1, category: "导出与下载" }]);
assert.deepEqual(dashboard.usageCategorySummary, [{ category: "导出与下载", count: 1 }]);

const loginEventsQuery = queries.find((entry) => entry.sql.includes("FROM login_events") && entry.sql.includes("ORDER BY occurred_at"));
assert.match(loginEventsQuery.sql, /status =/u);
assert.match(loginEventsQuery.sql, /login_date >=/u);
assert.match(loginEventsQuery.sql, /login_date <=/u);
assert.ok(loginEventsQuery.params.includes("failure"));

const usageEventsQuery = queries.find((entry) => entry.sql.includes("FROM usage_events") && entry.sql.includes("ORDER BY occurred_at"));
assert.match(usageEventsQuery.sql, /event_type =/u);
assert.ok(usageEventsQuery.params.includes("export_word"));
