import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-server-auth-"));
const databasePath = join(tempDir, "auth.sqlite");
const sentMessages = [];
const authDb = createAuthDatabase({ databasePath });

function getSessionTokenFromSetCookie(setCookie) {
  return setCookie.match(/consultant_session=([^;]+)/)?.[1] || "";
}

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
  assert.equal(blockedPrompt.headers.get("x-content-type-options"), "nosniff");
  assert.equal(blockedPrompt.headers.get("x-frame-options"), "DENY");

  const blockedResourceLibrary = await fetch(`${baseUrl}/resource-library.html`, { redirect: "manual" });
  assert.equal(blockedResourceLibrary.status, 302);
  assert.equal(blockedResourceLibrary.headers.get("location"), "/?next=%2Fresource-library.html");

  const blockedSchoolEncyclopedia = await fetch(`${baseUrl}/school-encyclopedia.html`, { redirect: "manual" });
  assert.equal(blockedSchoolEncyclopedia.status, 302);
  assert.equal(
    blockedSchoolEncyclopedia.headers.get("location"),
    "/?next=%2Fschool-encyclopedia.html",
  );

  const blockedMajorEncyclopedia = await fetch(`${baseUrl}/major-encyclopedia.html`, { redirect: "manual" });
  assert.equal(blockedMajorEncyclopedia.status, 302);
  assert.equal(
    blockedMajorEncyclopedia.headers.get("location"),
    "/?next=%2Fmajor-encyclopedia.html",
  );

  const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(faviconResponse.status, 200);
  assert.equal(faviconResponse.headers.get("content-type"), "image/svg+xml;charset=utf-8");
  assert.equal(faviconResponse.headers.get("x-content-type-options"), "nosniff");

  const publicLoginModeResponse = await fetch(`${baseUrl}/?auth=login`);
  assert.equal(publicLoginModeResponse.status, 200);
  const publicLoginModeHtml = await publicLoginModeResponse.text();
  assert.match(publicLoginModeHtml, /<h2 id="auth-title">登录<\/h2>/);
  assert.match(publicLoginModeHtml, /<form id="authForm" class="auth-form" method="post" action="\/api\/auth\/login">/);
  assert.match(publicLoginModeHtml, /<label id="authNameField" class="is-hidden">/);
  assert.match(publicLoginModeHtml, /<button id="authSubmitButton" type="submit">登录<\/button>/);
  assert.match(publicLoginModeHtml, /<a id="authModeButton"[^>]*href="\/\?auth=register"[^>]*>没有账号？注册<\/a>/);

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

  const authenticatedHomeResponse = await fetch(`${baseUrl}/`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authenticatedHomeResponse.status, 200);
  assert.match(authenticatedHomeResponse.headers.get("vary") || "", /Cookie/i);
  const authenticatedHomeHtml = await authenticatedHomeResponse.text();
  const authenticatedAuthShellTag = authenticatedHomeHtml.match(/<section id="authShell"[^>]*>/)?.[0] || "";
  const authenticatedAppShellTag = authenticatedHomeHtml.match(/<main id="appShell"[^>]*>/)?.[0] || "";
  assert.match(
    authenticatedAuthShellTag,
    /\bis-hidden\b/u,
    "Authenticated home should not briefly show the logged-out shell before client auth resolves.",
  );
  assert.doesNotMatch(
    authenticatedAppShellTag,
    /\bis-hidden\b/u,
    "Authenticated home should render the command center shell immediately.",
  );
  const authenticatedIndexResponse = await fetch(`${baseUrl}/index.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authenticatedIndexResponse.status, 200);
  const authenticatedIndexHtml = await authenticatedIndexResponse.text();
  assert.match(
    authenticatedIndexHtml.match(/<section id="authShell"[^>]*>/)?.[0] || "",
    /\bis-hidden\b/u,
    "Authenticated logo navigation to index.html should keep the logged-out shell hidden.",
  );
  assert.doesNotMatch(
    authenticatedIndexHtml.match(/<main id="appShell"[^>]*>/)?.[0] || "",
    /\bis-hidden\b/u,
    "Authenticated logo navigation to index.html should show the command center shell immediately.",
  );

  const promptResponse = await fetch(`${baseUrl}/api/prompt`, {
    headers: { Cookie: cookie },
  });
  assert.equal(promptResponse.status, 200);

  const resourceLibraryResponse = await fetch(`${baseUrl}/resource-library.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(resourceLibraryResponse.status, 200);
  assert.equal(resourceLibraryResponse.headers.get("referrer-policy"), "strict-origin-when-cross-origin");

  const schoolEncyclopediaResponse = await fetch(`${baseUrl}/school-encyclopedia.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(schoolEncyclopediaResponse.status, 200);

  const majorEncyclopediaResponse = await fetch(`${baseUrl}/major-encyclopedia.html`, {
    headers: { Cookie: cookie },
  });
  assert.equal(majorEncyclopediaResponse.status, 200);

  const schoolDatasetResponse = await fetch(`${baseUrl}/data/schools.md`, {
    headers: { Cookie: cookie },
  });
  assert.equal(schoolDatasetResponse.status, 200);

  const internationalSchoolDatasetResponse = await fetch(`${baseUrl}/data/international-schools.md`, {
    headers: { Cookie: cookie },
  });
  assert.equal(internationalSchoolDatasetResponse.status, 200);

  const otherRegionSchoolDatasetResponse = await fetch(`${baseUrl}/data/other-region-schools.md`, {
    headers: { Cookie: cookie },
  });
  assert.equal(otherRegionSchoolDatasetResponse.status, 200);

  const majorDatasetResponse = await fetch(`${baseUrl}/data/majors.md`, {
    headers: { Cookie: cookie },
  });
  assert.equal(majorDatasetResponse.status, 200);

  for (const eventType of [
    "parse_codex_answer",
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

  const duplicateFirstLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password: "password123",
    }),
  });
  assert.equal(duplicateFirstLoginResponse.status, 200);
  const duplicateFirstToken = getSessionTokenFromSetCookie(duplicateFirstLoginResponse.headers.get("set-cookie"));
  assert.ok(duplicateFirstToken);

  const duplicateSecondLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password: "password123",
    }),
  });
  assert.equal(duplicateSecondLoginResponse.status, 200);
  const duplicateSecondToken = getSessionTokenFromSetCookie(duplicateSecondLoginResponse.headers.get("set-cookie"));
  assert.ok(duplicateSecondToken);

  const staleFirstLogoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: `consultant_session=${duplicateFirstToken}`,
    },
  });
  assert.equal(staleFirstLogoutResponse.status, 200);

  const mixedCookieMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Cookie: `consultant_session=${duplicateSecondToken}; consultant_session=${duplicateFirstToken}`,
    },
  });
  assert.equal(
    mixedCookieMeResponse.status,
    200,
    "A stale duplicate session cookie should not block a valid current session.",
  );

  const duplicateLogoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: `consultant_session=${duplicateFirstToken}; consultant_session=${duplicateSecondToken}`,
    },
  });
  assert.equal(duplicateLogoutResponse.status, 200);
  assert.match(duplicateLogoutResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.match(duplicateLogoutResponse.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.equal(duplicateLogoutResponse.headers.get("clear-site-data"), '"cookies"');

  const duplicateFirstMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: `consultant_session=${duplicateFirstToken}` },
  });
  assert.equal(duplicateFirstMeResponse.status, 401);

  const duplicateSecondMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: `consultant_session=${duplicateSecondToken}` },
  });
  assert.equal(duplicateSecondMeResponse.status, 401);

  const formLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password: "password123",
    }),
  });
  assert.equal(formLoginResponse.status, 200);
  const formSessionToken = getSessionTokenFromSetCookie(formLoginResponse.headers.get("set-cookie"));
  assert.ok(formSessionToken);

  const formLogoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Accept: "text/html",
      Cookie: `consultant_session=${formSessionToken}`,
    },
    redirect: "manual",
  });
  assert.equal(formLogoutResponse.status, 303);
  assert.equal(formLogoutResponse.headers.get("location"), "/");
  assert.match(formLogoutResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(formLogoutResponse.headers.get("clear-site-data"), '"cookies"');

  const formLoggedOutMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: `consultant_session=${formSessionToken}` },
  });
  assert.equal(formLoggedOutMeResponse.status, 401);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(logoutResponse.headers.get("clear-site-data"), '"cookies"');

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
  assert.ok(
    dashboard.usageCategorySummary.some(
      (item) => item.category === "导出与下载" && item.count >= 3,
    ),
  );
  assert.equal(dashboard.overview.activeUsers, 1);
  assert.equal(dashboard.overview.aiActions, 5);
  assert.equal(dashboard.overview.saveActions, 7);
  assert.equal(dashboard.overview.exportActions, 6);
  assert.equal(dashboard.overview.recommendationActions, 8);
  assert.equal(dashboard.overview.failureEvents, 6);

  const exportedReportResponse = await fetch(`${baseUrl}/api/admin/login-dashboard?eventType=export_svg`, {
    headers: { Cookie: adminLoginResponse.headers.get("set-cookie") },
  });
  assert.equal(exportedReportResponse.status, 200);
  const exportedReportDashboard = await exportedReportResponse.json();
  assert.deepEqual(exportedReportDashboard.usageEvents.map((event) => event.eventType), ["export_svg"]);
  assert.equal(exportedReportDashboard.overview.aiActions, 5);

} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

const nativeFormTempDir = await mkdtemp(join(tmpdir(), "consultant-native-form-auth-"));
const nativeFormServer = createAppServer({
  databasePath: join(nativeFormTempDir, "auth.sqlite"),
  rateLimits: {},
});

try {
  await new Promise((resolve) => nativeFormServer.listen(0, "127.0.0.1", resolve));
  const { port } = nativeFormServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const nativeRegisterResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "native-form@example.com",
      name: "Native Form",
      password: "password123",
    }),
  });
  assert.equal(nativeRegisterResponse.status, 200);

  const nativeLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: "native-form@example.com",
      password: "password123",
    }),
    redirect: "manual",
  });
  assert.equal(nativeLoginResponse.status, 303);
  assert.equal(nativeLoginResponse.headers.get("location"), "/");
  assert.match(nativeLoginResponse.headers.get("set-cookie"), /consultant_session=/);

  const nativeLoginMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: nativeLoginResponse.headers.get("set-cookie") },
  });
  assert.equal(nativeLoginMeResponse.status, 200);
} finally {
  await new Promise((resolve) => nativeFormServer.close(resolve));
  await rm(nativeFormTempDir, { recursive: true, force: true });
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
