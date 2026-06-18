import assert from "node:assert/strict";
import {
  DEFAULT_AUDIT_LOG_RETENTION_POLICY,
  buildAdminAuditExportDetails,
  buildAdminDashboardAuditDetails,
  createAdminOperationsService,
  didAdminNoteChange,
  getAuditLogRetentionPolicy,
  parseAdminDashboardFilters,
} from "../src/server/admin-operations-service.mjs";

const admin = { id: 3, name: "Admin User", role: "admin" };
const metadata = { ipAddress: "127.0.0.1", userAgent: "node-test" };
const calls = [];
const exportedAt = "2026-06-18T12:00:00.000Z";
const backupStatus = {
  directory: "backups/sqlite",
  exists: true,
  latestBackupFile: "auth-20260618.sqlite",
  latestBackupAt: "2026-06-18T00:00:00.000Z",
  ageHours: 1,
};

const service = createAdminOperationsService({
  auth: {
    recordAuditEvent(event) {
      calls.push(["auth.recordAuditEvent", event]);
    },
    getLoginDashboard(payload) {
      calls.push(["auth.getLoginDashboard", payload]);
      if (payload.filters.query === "audit") {
        return {
          users: [],
          feedbackEntries: [],
          filters: payload.filters,
          auditEvents: [
            {
              id: 1,
              action: "admin.dashboard.view",
              outcome: "success",
              actorUserName: "Admin User",
            },
          ],
        };
      }
      return { users: [], feedbackEntries: [], filters: payload.filters };
    },
    updateFeedbackEntry(payload) {
      calls.push(["auth.updateFeedbackEntry", payload]);
      return {
        id: Number(payload.feedbackId),
        feedbackStatus: payload.payload.feedbackStatus || "open",
        adminNote: payload.payload.adminNote || "",
      };
    },
  },
  metrics: {
    snapshot(payload) {
      calls.push(["metrics.snapshot", payload]);
      return { ok: true, backup: payload.backupStatus };
    },
  },
  getBackupStatus() {
    calls.push(["getBackupStatus"]);
    return backupStatus;
  },
  now: () => new Date(exportedAt),
});

const filters = parseAdminDashboardFilters(new URLSearchParams({
  query: "planning",
  status: "open",
  fromDate: "2026-06-01",
  toDate: "2026-06-18",
  eventType: "admin.feedback.update",
}));
assert.deepEqual(filters, {
  query: "planning",
  status: "open",
  fromDate: "2026-06-01",
  toDate: "2026-06-18",
  eventType: "admin.feedback.update",
});
assert.deepEqual(parseAdminDashboardFilters({ query: "student", status: "closed" }), {
  query: "student",
  status: "closed",
  fromDate: "",
  toDate: "",
  eventType: "",
});
assert.deepEqual(buildAdminDashboardAuditDetails(filters), {
  hasQuery: true,
  status: "open",
  fromDate: "2026-06-01",
  toDate: "2026-06-18",
  eventType: "admin.feedback.update",
});
assert.deepEqual(buildAdminAuditExportDetails(filters, "2"), {
  hasQuery: true,
  status: "open",
  fromDate: "2026-06-01",
  toDate: "2026-06-18",
  eventType: "admin.feedback.update",
  eventCount: 2,
});
assert.deepEqual(getAuditLogRetentionPolicy(), DEFAULT_AUDIT_LOG_RETENTION_POLICY);
assert.notEqual(getAuditLogRetentionPolicy(), getAuditLogRetentionPolicy());

const dashboard = service.getLoginDashboard({
  admin,
  searchParams: new URLSearchParams("query=planning&status=open"),
  metadata,
});
assert.deepEqual(dashboard, {
  users: [],
  feedbackEntries: [],
  filters: {
    query: "planning",
    status: "open",
    fromDate: "",
    toDate: "",
    eventType: "",
  },
});
assert.deepEqual(calls.slice(0, 2), [
  [
    "auth.recordAuditEvent",
    {
      actor: admin,
      action: "admin.dashboard.view",
      resourceType: "admin_dashboard",
      details: {
        hasQuery: true,
        status: "open",
        fromDate: "",
        toDate: "",
        eventType: "",
      },
      metadata,
    },
  ],
  [
    "auth.getLoginDashboard",
    {
      requester: admin,
      filters: {
        query: "planning",
        status: "open",
        fromDate: "",
        toDate: "",
        eventType: "",
      },
    },
  ],
]);

assert.deepEqual(service.getOpsMetrics(), { ok: true, backup: backupStatus });
assert.deepEqual(calls.slice(2, 4), [
  ["getBackupStatus"],
  ["metrics.snapshot", { backupStatus }],
]);

const feedback = service.updateFeedbackEntry({
  admin,
  feedbackId: "12",
  payload: { feedbackStatus: "in_progress", adminNote: "Need follow-up" },
  metadata,
});
assert.deepEqual(feedback, {
  id: 12,
  feedbackStatus: "in_progress",
  adminNote: "Need follow-up",
});
assert.deepEqual(calls.slice(4), [
  [
    "auth.updateFeedbackEntry",
    {
      requester: admin,
      feedbackId: "12",
      payload: { feedbackStatus: "in_progress", adminNote: "Need follow-up" },
    },
  ],
  [
    "auth.recordAuditEvent",
    {
      actor: admin,
      action: "admin.feedback.update",
      resourceType: "feedback_entry",
      resourceId: "12",
      details: {
        feedbackStatus: "in_progress",
        adminNoteChanged: true,
      },
      metadata,
    },
  ],
]);

const auditExport = service.exportAuditLog({
  admin,
  searchParams: new URLSearchParams("query=audit&fromDate=2026-06-01&toDate=2026-06-18"),
  metadata,
});
assert.deepEqual(auditExport, {
  exportedAt,
  retentionPolicy: DEFAULT_AUDIT_LOG_RETENTION_POLICY,
  filters: {
    query: "audit",
    status: "",
    fromDate: "2026-06-01",
    toDate: "2026-06-18",
    eventType: "",
  },
  eventCount: 1,
  auditEvents: [
    {
      id: 1,
      action: "admin.dashboard.view",
      outcome: "success",
      actorUserName: "Admin User",
    },
  ],
});
assert.deepEqual(calls.slice(6), [
  [
    "auth.getLoginDashboard",
    {
      requester: admin,
      filters: {
        query: "audit",
        status: "",
        fromDate: "2026-06-01",
        toDate: "2026-06-18",
        eventType: "",
      },
    },
  ],
  [
    "auth.recordAuditEvent",
    {
      actor: admin,
      action: "admin.audit_log.export",
      resourceType: "audit_log",
      details: {
        hasQuery: true,
        status: "",
        fromDate: "2026-06-01",
        toDate: "2026-06-18",
        eventType: "",
        eventCount: 1,
      },
      metadata,
    },
  ],
]);

assert.equal(didAdminNoteChange({ adminNote: "" }), true);
assert.equal(didAdminNoteChange({ feedbackStatus: "closed" }), false);
