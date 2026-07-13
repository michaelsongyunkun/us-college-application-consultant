import { getLatestBackupStatus } from "./observability.mjs";

export const DEFAULT_AUDIT_LOG_RETENTION_POLICY = Object.freeze({
  policyVersion: "audit-log-retention-v1",
  retentionDays: 365,
  exportFormat: "json",
  maxExportedEvents: 200,
  automaticPruning: false,
  redaction: "Audit exports use the same masked dashboard payload returned to admins.",
});

export function createAdminOperationsService({
  auth,
  metrics,
  getBackupStatus = () => getLatestBackupStatus(),
  now = () => new Date(),
} = {}) {
  function getLoginDashboard({ admin, searchParams = new URLSearchParams(), metadata = {} } = {}) {
    const filters = parseAdminDashboardFilters(searchParams);
    const audit = auth.recordAuditEvent({
      actor: admin,
      action: "admin.dashboard.view",
      resourceType: "admin_dashboard",
      details: buildAdminDashboardAuditDetails(filters),
      metadata,
    });
    return chainMaybe(audit, () => auth.getLoginDashboard({ requester: admin, filters }));
  }

  function getOpsMetrics() {
    return metrics.snapshot({
      backupStatus: getBackupStatus(),
    });
  }

  function exportAuditLog({ admin, searchParams = new URLSearchParams(), metadata = {} } = {}) {
    const filters = parseAdminDashboardFilters(searchParams);
    const dashboard = auth.getLoginDashboard({
      requester: admin,
      filters,
    });
    return chainMaybe(dashboard, (resolvedDashboard) => {
      const auditEvents = Array.isArray(resolvedDashboard.auditEvents) ? resolvedDashboard.auditEvents : [];
      const audit = auth.recordAuditEvent({ actor: admin, action: "admin.audit_log.export", resourceType: "audit_log", details: buildAdminAuditExportDetails(filters, auditEvents.length), metadata });
      return chainMaybe(audit, () => ({ exportedAt: now().toISOString(), retentionPolicy: getAuditLogRetentionPolicy(), filters, eventCount: auditEvents.length, auditEvents }));
    });
  }

  function updateFeedbackEntry({ admin, feedbackId, payload = {}, metadata = {} } = {}) {
    const feedback = auth.updateFeedbackEntry({
      requester: admin,
      feedbackId,
      payload,
    });
    return chainMaybe(feedback, (resolvedFeedback) => chainMaybe(auth.recordAuditEvent({
      actor: admin, action: "admin.feedback.update", resourceType: "feedback_entry", resourceId: feedbackId,
      details: { feedbackStatus: resolvedFeedback.feedbackStatus, adminNoteChanged: didAdminNoteChange(payload) }, metadata,
    }), () => resolvedFeedback));
  }

  return { getLoginDashboard, getOpsMetrics, exportAuditLog, updateFeedbackEntry };
}

function chainMaybe(value, callback) { return value && typeof value.then === "function" ? value.then(callback) : callback(value); }

export function parseAdminDashboardFilters(searchParams = new URLSearchParams()) {
  return {
    query: readSearchParam(searchParams, "query"),
    status: readSearchParam(searchParams, "status"),
    fromDate: readSearchParam(searchParams, "fromDate"),
    toDate: readSearchParam(searchParams, "toDate"),
    eventType: readSearchParam(searchParams, "eventType"),
  };
}

export function buildAdminDashboardAuditDetails(filters = {}) {
  return {
    hasQuery: Boolean(filters.query),
    status: filters.status || "",
    fromDate: filters.fromDate || "",
    toDate: filters.toDate || "",
    eventType: filters.eventType || "",
  };
}

export function buildAdminAuditExportDetails(filters = {}, eventCount = 0) {
  return {
    ...buildAdminDashboardAuditDetails(filters),
    eventCount: Number.isFinite(Number(eventCount)) ? Number(eventCount) : 0,
  };
}

export function getAuditLogRetentionPolicy() {
  return { ...DEFAULT_AUDIT_LOG_RETENTION_POLICY };
}

export function didAdminNoteChange(payload = {}) {
  return Object.hasOwn(payload, "adminNote");
}

function readSearchParam(searchParams, key) {
  if (searchParams && typeof searchParams.get === "function") return searchParams.get(key) || "";
  return searchParams?.[key] || "";
}
