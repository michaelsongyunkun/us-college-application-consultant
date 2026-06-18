import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-feedback-admin-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const server = createAppServer({ authDb });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const studentRegistration = await post("/api/auth/register", {
    email: "feedback-student@example.com",
    name: "Feedback Student",
    password: "password123",
  });
  assert.equal(studentRegistration.status, 200);
  const studentCookie = studentRegistration.headers.get("set-cookie");

  const feedbackResponse = await post(
    "/api/feedback",
    {
      issueType: "功能异常",
      pageName: "生成规划",
      description: "点击生成规划后页面一直显示加载中，没有出现结果。",
      steps: "登录后填写背景信息，点击生成规划按钮。",
      contact: "student-wechat",
    },
    studentCookie,
  );
  assert.equal(feedbackResponse.status, 201);
  const feedbackResult = await feedbackResponse.json();
  assert.equal(feedbackResult.ok, true);
  assert.ok(feedbackResult.feedback.id);
  assert.ok(feedbackResult.feedback.createdAt);

  const shortFeedbackResponse = await post(
    "/api/feedback",
    {
      issueType: "功能异常",
      pageName: "生成规划",
      description: "太短",
    },
    studentCookie,
  );
  assert.equal(shortFeedbackResponse.status, 400);

  const forbiddenDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: buildCookieHeader(studentCookie) },
  });
  assert.equal(forbiddenDashboardResponse.status, 403);
  const forbiddenAuditExportResponse = await fetch(`${baseUrl}/api/admin/audit-log/export`, {
    headers: { Cookie: buildCookieHeader(studentCookie) },
  });
  assert.equal(forbiddenAuditExportResponse.status, 403);

  const adminRegistration = await post("/api/auth/register", {
    email: "feedback-admin@example.com",
    name: "Yunkun Song",
    password: "password123",
  });
  assert.equal(adminRegistration.status, 200);
  authDb.db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run("feedback-admin@example.com");
  const adminLogin = await post("/api/auth/login", {
    email: "feedback-admin@example.com",
    password: "password123",
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie");

  const dashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(Array.isArray(dashboard.feedbackEntries));
  assert.equal(dashboard.feedbackEntries.length, 1);
  assert.equal(dashboard.feedbackEntries[0].issueType, "功能异常");
  assert.equal(dashboard.feedbackEntries[0].pageName, "生成规划");
  assert.equal(dashboard.feedbackEntries[0].description, "点击生成规划后页面一直显示加载中，没有出现结果。");
  assert.equal(dashboard.feedbackEntries[0].steps, "登录后填写背景信息，点击生成规划按钮。");
  assert.equal(dashboard.feedbackEntries[0].contact, "[redacted]");
  assert.equal(dashboard.feedbackEntries[0].userName, "Feedback Student");
  assert.equal(dashboard.feedbackEntries[0].userEmail, "f***@example.com");
  assert.equal(dashboard.feedbackEntries[0].feedbackStatus, "未处理");
  assert.equal(dashboard.feedbackEntries[0].adminNote, "");
  assert.ok(dashboard.auditEvents.some(
    (event) =>
      event.action === "admin.dashboard.view" &&
      event.outcome === "success" &&
      event.actorUserName === "Yunkun Song",
  ));
  assert.ok(dashboard.auditEvents.some(
    (event) =>
      event.action === "admin.dashboard.view" &&
      event.outcome === "failure" &&
      event.actorUserName === "Feedback Student" &&
      event.details.reason === "forbidden",
  ));
  assert.ok(dashboard.auditEvents.some(
    (event) =>
      event.action === "admin.audit_log.export" &&
      event.outcome === "failure" &&
      event.actorUserName === "Feedback Student" &&
      event.details.reason === "forbidden",
  ));

  const forbiddenStatusUpdate = await put(
    `/api/admin/feedback/${dashboard.feedbackEntries[0].id}`,
    {
      feedbackStatus: "处理中",
      adminNote: "学生已补充截图",
    },
    studentCookie,
  );
  assert.equal(forbiddenStatusUpdate.status, 403);

  const statusUpdateResponse = await put(
    `/api/admin/feedback/${dashboard.feedbackEntries[0].id}`,
    {
      feedbackStatus: "处理中",
      adminNote: "学生已补充截图，排查生成流程。",
    },
    adminCookie,
  );
  assert.equal(statusUpdateResponse.status, 200);
  const statusUpdate = await statusUpdateResponse.json();
  assert.equal(statusUpdate.feedback.feedbackStatus, "处理中");
  assert.equal(statusUpdate.feedback.adminNote, "学生已补充截图，排查生成流程。");

  const auditDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(auditDashboardResponse.status, 200);
  const auditDashboard = await auditDashboardResponse.json();
  const feedbackAudit = auditDashboard.auditEvents.find(
    (event) =>
      event.action === "admin.feedback.update" &&
      event.outcome === "success" &&
      event.resourceId === String(dashboard.feedbackEntries[0].id),
  );
  assert.ok(feedbackAudit);
  assert.equal(feedbackAudit.details.feedbackStatus, statusUpdate.feedback.feedbackStatus);
  assert.equal(feedbackAudit.details.adminNoteChanged, true);
  assert.equal(JSON.stringify(feedbackAudit).includes(statusUpdate.feedback.adminNote), false);

  const auditExportResponse = await fetch(`${baseUrl}/api/admin/audit-log/export?query=admin.dashboard.view`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(auditExportResponse.status, 200);
  assert.match(auditExportResponse.headers.get("content-type"), /application\/json/);
  assert.match(auditExportResponse.headers.get("content-disposition"), /consultant-audit-log-\d{4}-\d{2}-\d{2}\.json/);
  const auditExport = await auditExportResponse.json();
  assert.equal(auditExport.retentionPolicy.policyVersion, "audit-log-retention-v1");
  assert.equal(auditExport.retentionPolicy.retentionDays, 365);
  assert.equal(auditExport.retentionPolicy.exportFormat, "json");
  assert.equal(auditExport.filters.query, "admin.dashboard.view");
  assert.equal(auditExport.eventCount, auditExport.auditEvents.length);
  assert.ok(auditExport.auditEvents.length >= 2);
  assert.ok(auditExport.auditEvents.every((event) => event.action === "admin.dashboard.view"));
  assert.equal(JSON.stringify(auditExport).includes("password123"), false);

  const postExportDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(postExportDashboardResponse.status, 200);
  const postExportDashboard = await postExportDashboardResponse.json();
  assert.ok(postExportDashboard.auditEvents.some(
    (event) =>
      event.action === "admin.audit_log.export" &&
      event.outcome === "success" &&
      event.actorUserName === "Yunkun Song" &&
      event.details.eventCount === auditExport.eventCount,
  ));

  const invalidStatusUpdate = await put(
    `/api/admin/feedback/${dashboard.feedbackEntries[0].id}`,
    {
      feedbackStatus: "已关闭",
    },
    adminCookie,
  );
  assert.equal(invalidStatusUpdate.status, 400);

  const filteredDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard?query=生成规划`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(filteredDashboardResponse.status, 200);
  const filteredDashboard = await filteredDashboardResponse.json();
  assert.equal(filteredDashboard.feedbackEntries.length, 1);
  assert.equal(filteredDashboard.feedbackEntries[0].feedbackStatus, "处理中");
  assert.equal(filteredDashboard.feedbackEntries[0].adminNote, "学生已补充截图，排查生成流程。");

  const emptyFilteredDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard?query=不存在`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(emptyFilteredDashboardResponse.status, 200);
  const emptyFilteredDashboard = await emptyFilteredDashboardResponse.json();
  assert.equal(emptyFilteredDashboard.feedbackEntries.length, 0);
} finally {
  await new Promise((resolve) => server.close(resolve));
  authDb.close();
  await rm(tempDir, { recursive: true, force: true });
}

function post(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function put(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "PUT",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
