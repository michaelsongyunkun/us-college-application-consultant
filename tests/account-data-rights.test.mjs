import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-account-data-rights-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const server = createAppServer({ authDb });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const registrationResponse = await post("/api/auth/register", {
    email: "rights@example.com",
    name: "Rights Student",
    password: "password123",
  });
  assert.equal(registrationResponse.status, 200);
  const registration = await registrationResponse.json();
  const userId = registration.user.id;
  const cookie = registrationResponse.headers.get("set-cookie");

  await put("/api/student-profile", { profile: { grade: "11", intendedMajor: "Data Science" } }, cookie);
  const plansResponse = await get("/api/plans", cookie);
  const plan = (await plansResponse.json()).plans[0];
  await put(`/api/plans/${plan.id}`, { draft: { rawAnswer: "private plan", activities: [{ title: "Lab" }] } }, cookie);
  const snapshotResponse = await post(`/api/plans/${plan.id}/snapshots`, { note: "backup" }, cookie);
  const snapshot = (await snapshotResponse.json()).snapshot;
  await put(
    "/api/my-activities",
    {
      applicationPlan: { rea: [], ed1: [], ed2: [], ea: [], uc: [], rd: [], multiCountry: [] },
      activities: [{ activityName: "Robotics Lab", type: "research", outcome: "demo" }],
      competitions: [],
      summerSchools: [],
      recommendationLetters: { teacher1: { teacherName: "Ms. Rivera", materials: "brag sheet" } },
      planningActions: [{ text: "Verify deadlines", source: "manual" }],
      deepSeekNotes: [{ title: "AI review", content: "Sensitive saved AI note", source: "DeepSeek" }],
      academicRecords: {
        gpaScale: "",
        gpaRecords: [{ gradeLevel: "11", term: "Fall", gpa: "3.9" }],
        satTests: [{ totalScore: "1500", englishScore: "720", mathScore: "780", testDate: "2026-05" }],
        apExams: [],
      },
    },
    cookie,
  );
  await put(
    "/api/progress-planner",
    {
      tasks: [{ title: "Prepare recommendation packet", status: "in progress", progress: 40 }],
      checkIns: [{ date: "2026-06-18", summary: "Export/delete data-rights smoke" }],
    },
    cookie,
  );
  await post(
    "/api/feedback",
    {
      issueType: "Data rights",
      pageName: "Account",
      description: "Please include my account data in privacy export.",
      steps: "Open account settings.",
      contact: "student-contact",
    },
    cookie,
  );
  await post(
    "/api/analytics/usage-event",
    {
      eventType: "save_draft",
      profile: { grade: "11", majorDirection: "Data Science" },
      metrics: { completionFields: 2 },
      details: {},
    },
    cookie,
  );

  const exportResponse = await get("/api/account/export", cookie);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-disposition"), /consultant-account-export-/);
  const exportData = await exportResponse.json();
  assert.equal(exportData.account.email, "rights@example.com");
  assert.equal(exportData.planning.profile.profile.grade, "11");
  assert.equal(exportData.planning.plans[0].draft.rawAnswer, "private plan");
  assert.equal(exportData.planning.plans[0].snapshots[0].id, snapshot.id);
  assert.equal(exportData.portfolio.deepSeekNotes[0].content, "Sensitive saved AI note");
  assert.equal(exportData.portfolio.academicRecords.satTests[0].totalScore, "1500");
  assert.equal(exportData.progressPlanner.tasks[0].title, "Prepare recommendation packet");

  const badDeleteResponse = await del("/api/account", { confirmationEmail: "wrong@example.com" }, cookie);
  assert.equal(badDeleteResponse.status, 400);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(userId).count, 1);

  const deleteResponse = await del("/api/account", { confirmationEmail: "rights@example.com" }, cookie);
  assert.equal(deleteResponse.status, 200);
  assert.match(deleteResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(deleteResponse.headers.get("clear-site-data"), '"cookies"');
  assert.deepEqual((await deleteResponse.json()).ok, true);

  const deletedMeResponse = await get("/api/auth/me", cookie);
  assert.equal(deletedMeResponse.status, 401);
  const deletedExportResponse = await get("/api/account/export", cookie);
  assert.equal(deletedExportResponse.status, 401);

  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(userId).count, 0);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM student_profiles WHERE user_id = ?").get(userId).count, 0);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM planning_projects WHERE user_id = ?").get(userId).count, 0);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM planning_snapshots WHERE user_id = ?").get(userId).count, 0);
  assert.equal(
    authDb.db.prepare("SELECT COUNT(*) AS count FROM student_activity_portfolios WHERE user_id = ?").get(userId).count,
    0,
  );
  assert.equal(
    authDb.db.prepare("SELECT COUNT(*) AS count FROM student_progress_planners WHERE user_id = ?").get(userId).count,
    0,
  );
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM usage_events WHERE user_id = ?").get(userId).count, 0);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM feedback_entries WHERE user_email = ?").get("rights@example.com").count, 0);
  assert.equal(authDb.db.prepare("SELECT COUNT(*) AS count FROM login_events WHERE user_email = ?").get("rights@example.com").count, 0);

  const auditEvents = authDb.db
    .prepare(
      "SELECT action, resource_id AS resourceId, actor_user_name AS actorUserName, actor_user_email AS actorUserEmail FROM audit_events ORDER BY id",
    )
    .all();
  assert.ok(auditEvents.some(
    (event) =>
      event.action === "account.data_export" &&
      event.resourceId === "deleted" &&
      event.actorUserName === "Deleted user",
  ));
  assert.ok(auditEvents.some((event) => event.action === "account.delete" && event.actorUserName === "Deleted user"));
  assert.equal(auditEvents.some((event) => event.actorUserEmail === "rights@example.com"), false);
} finally {
  await new Promise((resolve) => server.close(resolve));
  authDb.close();
  await rm(tempDir, { recursive: true, force: true });
}

function get(path, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    headers: cookie ? { Cookie: buildCookieHeader(cookie) } : {},
  });
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

function del(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "DELETE",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
