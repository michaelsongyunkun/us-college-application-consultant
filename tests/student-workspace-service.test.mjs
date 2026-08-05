import assert from "node:assert/strict";
import { createStudentWorkspaceService, isStudentWorkspaceRoute } from "../src/server/student-workspace-service.ts";
import {
  buildPostgresUsageRecord,
  createPostgresWorkspaceRuntime,
} from "../src/repositories/postgres-student-workspace-repositories.ts";

const calls = [];
const repositories = {
  profiles: { get: () => ({ profile: {}, updatedAt: null }), save: (_user, profile) => ({ profile, updatedAt: null }) },
  activities: { get: () => ({ activities: [] }), save: () => ({ activities: [] }), listImportSources: () => [] },
  progress: { get: () => ({ tasks: [] }), save: () => ({ tasks: [] }) },
  plans: { list: () => [], create: () => ({ id: 1 }), get: () => ({ id: 1 }), save: () => ({ id: 1 }), delete: () => ({ ok: true }), listSnapshots: () => [], createSnapshot: () => ({ id: 2 }), deleteSnapshot: () => ({ ok: true }), restoreSnapshot: () => ({ plan: { id: 1 } }) },
  analytics: { record: (...args) => calls.push(["record", ...args]), audit: (...args) => calls.push(["audit", ...args]) },
};
const service = createStudentWorkspaceService({ repositories });
const user = { id: 1 };
assert.equal(isStudentWorkspaceRoute("/api/plans/1/snapshots/2/restore"), true);
assert.equal(isStudentWorkspaceRoute("/api/deepseek-plan"), false);
assert.equal((await service.handle({ method: "PUT", path: "/api/student-profile", user, readJson: async () => ({ profile: { grade: "11" } }), metadata: {} })).body.profile.grade, "11");
assert.equal((await service.handle({ method: "POST", path: "/api/plans", user, readJson: async () => ({ name: "Plan" }), metadata: {} })).statusCode, 201);
assert.equal((await service.handle({ method: "DELETE", path: "/api/plans/1", user, readJson: async () => ({}), metadata: {} })).body.ok, true);
assert.equal(calls[0][0], "audit");
await assert.rejects(() => service.handle({ method: "PUT", path: "/api/student-profile", user, readJson: async () => ({ profile: { interests: "x".repeat(2_001) } }), metadata: {} }));

const usageRecord = buildPostgresUsageRecord(
  { id: 7, name: "Real User", email: "real@example.com" },
  {
    eventType: "save_draft",
    profile: { grade: "10" },
    metrics: { durationMs: 25 },
    details: { userId: 999, userName: "Imposter", userEmail: "imposter@example.com" },
  },
  { userAgent: "Workspace Test", ipAddress: "127.0.0.1" },
);
assert.equal(usageRecord.userId, 7);
assert.equal(usageRecord.userName, "Real User");
assert.equal(usageRecord.userEmail, "real@example.com");

const postgresQueries = [];
const pool = {
  async connect() {
    return {
      async query(sql) {
        postgresQueries.push(sql);
        if (sql.includes("SELECT id FROM planning_projects")) return { rows: [{ id: 42 }] };
        return { rows: [] };
      },
      release() {},
    };
  },
  async query(sql) {
    postgresQueries.push(sql);
    if (sql.includes("ORDER BY updated_at DESC,id DESC LIMIT 1")) {
      return {
        rows: [{
          planId: 42,
          planName: "Latest plan",
          draft: { rawAnswer: "current only" },
          savedAt: "2026-08-06T00:00:00.000Z",
        }],
      };
    }
    return { rows: [] };
  },
};
const postgresRuntime = createPostgresWorkspaceRuntime({ pool });
const latestPlan = await postgresRuntime.planning.getLatestRagPlan({ id: 7 });
assert.equal(latestPlan.sourceType, "current_plan");
assert.equal(latestPlan.planId, 42);
assert.equal(latestPlan.draft.rawAnswer, "current only");
assert.equal(Object.hasOwn(latestPlan, "snapshotId"), false);
assert.equal(postgresQueries.some((sql) => sql.includes("planning_snapshots")), false);
