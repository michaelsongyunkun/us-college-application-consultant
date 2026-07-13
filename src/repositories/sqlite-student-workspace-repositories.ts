import type { StudentWorkspaceRepositories } from "./contracts.js";
import { withSpanSync } from "../server/production-observability.js";

export function createSqliteStudentWorkspaceRepositories({ planning, activityPortfolio, progressPlanner, auth }: any): StudentWorkspaceRepositories {
  return {
    profiles: {
      get: (user) => dbSpan("student_profile.get", () => planning.getProfile(user)),
      save: (user, profile) => dbSpan("student_profile.save", () => planning.saveProfile(user, profile)),
    },
    activities: {
      get: (user) => dbSpan("activity_portfolio.get", () => activityPortfolio.getPortfolio(user)),
      save: (user, payload) => dbSpan("activity_portfolio.save", () => activityPortfolio.savePortfolio(user, payload)),
      listImportSources: (user) => dbSpan("activity_import_sources.list", () => planning.listActivityImportSources(user)),
    },
    progress: {
      get: (user) => dbSpan("progress_planner.get", () => progressPlanner.getPlanner(user)),
      save: (user, payload) => dbSpan("progress_planner.save", () => progressPlanner.savePlanner(user, payload)),
    },
    plans: {
      list: (user) => dbSpan("planning_version.list", () => planning.listPlans(user)),
      create: (user, payload) => dbSpan("planning_version.create", () => planning.createPlan(user, payload)),
      get: (user, planId) => dbSpan("planning_version.get", () => planning.getPlan(user, planId)),
      save: (user, planId, payload) => dbSpan("planning_version.save", () => planning.savePlan(user, planId, payload)),
      delete: (user, planId) => dbSpan("planning_version.delete", () => planning.deletePlan(user, planId)),
      listSnapshots: (user, planId) => dbSpan("planning_snapshot.list", () => planning.listSnapshots(user, planId)),
      createSnapshot: (user, planId, payload) => dbSpan("planning_snapshot.create", () => planning.createSnapshot(user, planId, payload)),
      deleteSnapshot: (user, planId, snapshotId) => dbSpan("planning_snapshot.delete", () => planning.deleteSnapshot(user, planId, snapshotId)),
      restoreSnapshot: (user, planId, snapshotId) => dbSpan("planning_snapshot.restore", () => planning.restoreSnapshot(user, planId, snapshotId)),
    },
    analytics: {
      record(user, event, metadata) {
        auth.recordUsageEvent({ user, ...event, metadata });
      },
      audit: (input) => auth.recordAuditEvent(input),
    },
  };
}

function dbSpan<T>(operation: string, task: () => T): T {
  return withSpanSync("db.sqlite", { "db.system": "sqlite", "db.operation.name": operation }, task);
}
