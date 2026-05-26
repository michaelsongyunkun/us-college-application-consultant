import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../auth-db.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-server-auth-"));
const databasePath = join(tempDir, "auth.sqlite");
const sentMessages = [];
const authDb = createAuthDatabase({ databasePath });

const server = createAppServer({
  authDb,
  appBaseUrl: "http://127.0.0.1:4177",
  mailer: {
    async sendPasswordResetEmail(message) {
      sentMessages.push(message);
    },
  },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const blockedPrompt = await fetch(`${baseUrl}/api/prompt`);
  assert.equal(blockedPrompt.status, 401);

  const blockedResourceLibrary = await fetch(`${baseUrl}/resource-library.html`);
  assert.equal(blockedResourceLibrary.status, 401);

  const blockedSchoolEncyclopedia = await fetch(`${baseUrl}/school-encyclopedia.html`);
  assert.equal(blockedSchoolEncyclopedia.status, 401);

  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      name: "Student User",
      password: "password123",
    }),
  });
  assert.equal(registrationResponse.status, 200);

  const cookie = registrationResponse.headers.get("set-cookie");
  assert.match(cookie, /consultant_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const registration = await registrationResponse.json();
  assert.equal(registration.user.email, "student@example.com");
  assert.equal(registration.user.role, "user");

  const forbiddenDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: cookie },
  });
  assert.equal(forbiddenDashboardResponse.status, 403);

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(meResponse.status, 200);
  const me = await meResponse.json();
  assert.equal(me.user.email, "student@example.com");

  const promptResponse = await fetch(`${baseUrl}/api/prompt`, {
    headers: { Cookie: cookie },
  });
  assert.equal(promptResponse.status, 200);

  const resourceLibraryResponse = await fetch(`${baseUrl}/resource-library.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(resourceLibraryResponse.status, 200);

  const schoolEncyclopediaResponse = await fetch(`${baseUrl}/school-encyclopedia.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(schoolEncyclopediaResponse.status, 200);

  const schoolDatasetResponse = await fetch(`${baseUrl}/data/schools.md`, {
    headers: { Cookie: cookie },
  });
  assert.equal(schoolDatasetResponse.status, 200);

  for (const eventType of [
    "parse_codex_answer",
    "export_json",
    "export_word",
    "save_draft",
    "clear_draft",
    "generate_plan_success",
    "generate_plan_failure",
    "build_codex_task",
    "copy_codex_task",
    "refresh_competitions",
    "refresh_summer_schools",
    "course_helper_visit",
    "refresh_ap_recommendations",
  ]) {
    const trackResponse = await fetch(`${baseUrl}/api/analytics/usage-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        eventType,
        profile: {
          grade: "10年级",
          majorDirection: "计算机科学",
        },
        metrics: {
          completionFields: 5,
          filledActivityCount: 3,
          generatedActivityCount: 10,
          durationMs: 1200,
        },
        details: {
          failureReason: eventType.endsWith("_failure") ? "test failure" : "",
        },
      }),
    });
    assert.equal(trackResponse.status, 200);
  }

  for (let index = 0; index < 5; index += 1) {
    const repeatedLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com",
        password: "password123",
      }),
    });
    assert.equal(repeatedLoginResponse.status, 200);
    assert.match(repeatedLoginResponse.headers.get("set-cookie"), /consultant_session=/);
  }

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);

  const loggedOutMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(loggedOutMeResponse.status, 401);

  const resetRequestResponse = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student@example.com" }),
  });
  assert.equal(resetRequestResponse.status, 200);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "student@example.com");
  assert.match(sentMessages[0].resetUrl, /resetToken=/);

  const resetToken = new URL(sentMessages[0].resetUrl).searchParams.get("resetToken");
  assert.ok(resetToken);

  const resetPasswordResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: resetToken,
      password: "reset-password123",
    }),
  });
  assert.equal(resetPasswordResponse.status, 200);

  const resetLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password: "reset-password123",
    }),
  });
  assert.equal(resetLoginResponse.status, 200);

  const missingResetResponse = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "missing@example.com" }),
  });
  assert.equal(missingResetResponse.status, 200);
  assert.equal(sentMessages.length, 1);

  const adminRegistrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      name: "Yunkun Song",
      password: "password123",
    }),
  });
  assert.equal(adminRegistrationResponse.status, 200);
  const adminRegistration = await adminRegistrationResponse.json();
  assert.equal(adminRegistration.user.role, "user");

  const impersonatedAdminDashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard`, {
    headers: { Cookie: adminRegistrationResponse.headers.get("set-cookie") },
  });
  assert.equal(impersonatedAdminDashboardResponse.status, 403);

  authDb.db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run("admin@example.com");
  const adminLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      password: "password123",
    }),
  });
  assert.equal(adminLoginResponse.status, 200);

  const dashboardResponse = await fetch(`${baseUrl}/api/admin/login-dashboard?status=success`, {
    headers: { Cookie: adminLoginResponse.headers.get("set-cookie") },
  });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.users.some((user) => user.name === "Yunkun Song"));
  assert.ok(dashboard.events.every((event) => event.status === "success"));
  assert.ok(Array.isArray(dashboard.dailyActivity));
  assert.ok(Array.isArray(dashboard.weeklyActivity));
  assert.ok(
    dashboard.usageSummary.some(
      (item) => item.eventType === "parse_codex_answer" && item.count >= 1,
    ),
  );
  assert.ok(dashboard.usageEvents.some((event) => event.grade === "10年级"));
  assert.ok(dashboard.usageEvents.some((event) => event.majorDirection === "计算机科学"));
  assert.ok(dashboard.usageEvents.some((event) => event.completionFields === 5));
  assert.ok(dashboard.usageEvents.some((event) => event.filledActivityCount === 3));
  assert.ok(dashboard.usageEvents.some((event) => event.generatedActivityCount === 10));
  assert.ok(dashboard.usageEvents.some((event) => event.failureReason === "test failure"));
  assert.equal(dashboard.overview.activeUsers, 1);
  assert.equal(dashboard.overview.planGenerations, 1);
  assert.equal(dashboard.overview.wordExports, 1);
  assert.equal(dashboard.overview.recommendationRefreshes, 2);

  const exportedReportResponse = await fetch(`${baseUrl}/api/admin/login-dashboard?eventType=export_word`, {
    headers: { Cookie: adminLoginResponse.headers.get("set-cookie") },
  });
  assert.equal(exportedReportResponse.status, 200);
  const exportedReportDashboard = await exportedReportResponse.json();
  assert.deepEqual(exportedReportDashboard.usageEvents.map((event) => event.eventType), ["export_word"]);
  assert.equal(exportedReportDashboard.overview.planGenerations, 1);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

const protectionTempDir = await mkdtemp(join(tmpdir(), "consultant-server-protection-"));
const protectedServer = createAppServer({
  databasePath: join(protectionTempDir, "auth.sqlite"),
  maxRequestBodyBytes: 100,
  rateLimits: {
    "/api/auth/login": { maxRequests: 1, windowMs: 60_000 },
  },
});

try {
  await new Promise((resolve) => protectedServer.listen(0, "127.0.0.1", resolve));
  const { port } = protectedServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const malformedResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(malformedResponse.status, 400);
  assert.equal((await malformedResponse.json()).error, "Invalid JSON body");

  const oversizedResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "x@example.com", name: "x".repeat(120), password: "password123" }),
  });
  assert.equal(oversizedResponse.status, 413);

  const firstLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "missing@example.com", password: "password123" }),
  });
  assert.equal(firstLoginResponse.status, 401);

  const rateLimitedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "missing@example.com", password: "password123" }),
  });
  assert.equal(rateLimitedResponse.status, 429);
} finally {
  await new Promise((resolve) => protectedServer.close(resolve));
  await rm(protectionTempDir, { recursive: true, force: true });
}
