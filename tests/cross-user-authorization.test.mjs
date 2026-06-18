import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { buildCookieHeader, csrfHeaders, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-cross-user-authz-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const server = createAppServer({ authDb });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const ownerRegistration = await post("/api/auth/register", {
    email: "owner@example.com",
    name: "Owner Student",
    password: "password123",
  });
  assert.equal(ownerRegistration.status, 200);
  const ownerCookie = ownerRegistration.headers.get("set-cookie");

  const intruderRegistration = await post("/api/auth/register", {
    email: "intruder@example.com",
    name: "Intruder Student",
    password: "password123",
  });
  assert.equal(intruderRegistration.status, 200);
  const intruderCookie = intruderRegistration.headers.get("set-cookie");

  await put("/api/student-profile", {
    profile: { grade: "11", intendedMajor: "Neuroscience", school: "Owner High" },
  }, ownerCookie);
  await put("/api/my-activities", {
    applicationPlan: {
      rea: [],
      ed1: [{ school: "Owner University", major: "Neuroscience" }],
      ed2: [],
      ea: [],
      uc: [],
      rd: [],
      multiCountry: [],
    },
    activities: [{ activityName: "Owner Research", type: "Research", outcome: "Poster" }],
    competitions: [],
    summerSchools: [],
    recommendationLetters: { teacher1: { teacherName: "Owner Teacher" } },
    planningActions: [{ text: "Owner action", source: "manual" }],
    deepSeekNotes: [{ title: "Owner AI note", content: "Private owner content", source: "DeepSeek" }],
    academicRecords: { gpaRecords: [{ gradeLevel: "11", term: "Fall", gpa: "3.95" }] },
  }, ownerCookie);
  await put("/api/progress-planner", {
    tasks: [{ title: "Owner private task", status: "in progress", progress: 45 }],
    checkIns: [{ date: "2026-06-18", summary: "Owner private check-in" }],
  }, ownerCookie);
  const ownerPlans = await getJson("/api/plans", ownerCookie);
  const ownerPlanId = ownerPlans.plans[0].id;
  await put(`/api/plans/${ownerPlanId}`, {
    draft: { rawAnswer: "owner private plan", activities: [{ title: "Owner Debate" }] },
  }, ownerCookie);
  const ownerSnapshotResponse = await post(
    `/api/plans/${ownerPlanId}/snapshots`,
    { note: "owner snapshot" },
    ownerCookie,
  );
  assert.equal(ownerSnapshotResponse.status, 201);
  const ownerSnapshotId = (await ownerSnapshotResponse.json()).snapshot.id;

  const ownerFeedbackResponse = await post("/api/feedback", {
    issueType: "Privacy",
    pageName: "Planner",
    description: "Owner private feedback should not be moderated by normal users.",
    steps: "Submit feedback as the owner.",
    contact: "owner-contact",
  }, ownerCookie);
  assert.equal(ownerFeedbackResponse.status, 201);
  const ownerFeedbackId = (await ownerFeedbackResponse.json()).feedback.id;

  const intruderProfile = await getJson("/api/student-profile", intruderCookie);
  assert.deepEqual(intruderProfile, { profile: {}, updatedAt: null });
  await put("/api/student-profile", {
    profile: { grade: "9", intendedMajor: "Mathematics", school: "Intruder High" },
  }, intruderCookie);
  const ownerProfileAfterIntruderWrite = await getJson("/api/student-profile", ownerCookie);
  assert.equal(ownerProfileAfterIntruderWrite.profile.intendedMajor, "Neuroscience");
  assert.equal(ownerProfileAfterIntruderWrite.profile.school, "Owner High");

  const intruderPortfolio = await getJson("/api/my-activities", intruderCookie);
  assert.equal(intruderPortfolio.activities.length, 0);
  assert.equal(intruderPortfolio.deepSeekNotes.length, 0);
  await put("/api/my-activities", {
    applicationPlan: { rea: [], ed1: [], ed2: [], ea: [], uc: [], rd: [], multiCountry: [] },
    activities: [{ activityName: "Intruder Activity", type: "Club" }],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    planningActions: [],
    deepSeekNotes: [],
  }, intruderCookie);
  const ownerPortfolioAfterIntruderWrite = await getJson("/api/my-activities", ownerCookie);
  assert.equal(ownerPortfolioAfterIntruderWrite.activities[0].activityName, "Owner Research");
  assert.equal(ownerPortfolioAfterIntruderWrite.deepSeekNotes[0].content, "Private owner content");

  const intruderImportSources = await getJson("/api/my-activities/import-sources", intruderCookie);
  assert.deepEqual(intruderImportSources, { sources: [] });

  const intruderPlanner = await getJson("/api/progress-planner", intruderCookie);
  assert.deepEqual(intruderPlanner, { tasks: [], checkIns: [], updatedAt: null });
  await put("/api/progress-planner", {
    tasks: [{ title: "Intruder own task", status: "todo", progress: 5 }],
    checkIns: [],
  }, intruderCookie);
  const ownerPlannerAfterIntruderWrite = await getJson("/api/progress-planner", ownerCookie);
  assert.equal(ownerPlannerAfterIntruderWrite.tasks[0].title, "Owner private task");
  assert.equal(ownerPlannerAfterIntruderWrite.checkIns[0].summary, "Owner private check-in");

  const intruderPlans = await getJson("/api/plans", intruderCookie);
  assert.equal(intruderPlans.plans.length, 1);
  assert.notEqual(intruderPlans.plans[0].id, ownerPlanId);
  assert.equal(intruderPlans.plans.some((plan) => plan.id === ownerPlanId), false);

  await assertStatus("GET owner plan by another user", get(`/api/plans/${ownerPlanId}`, intruderCookie), 404);
  await assertStatus("PUT owner plan by another user", put(`/api/plans/${ownerPlanId}`, {
    draft: { rawAnswer: "intruder overwrite attempt" },
  }, intruderCookie), 404);
  await assertStatus("DELETE owner plan by another user", remove(`/api/plans/${ownerPlanId}`, intruderCookie), 404);
  await assertStatus(
    "LIST owner snapshots by another user",
    get(`/api/plans/${ownerPlanId}/snapshots`, intruderCookie),
    404,
  );
  await assertStatus(
    "CREATE owner snapshot by another user",
    post(`/api/plans/${ownerPlanId}/snapshots`, { note: "intruder snapshot" }, intruderCookie),
    404,
  );
  await assertStatus(
    "RESTORE owner snapshot by another user",
    post(`/api/plans/${ownerPlanId}/snapshots/${ownerSnapshotId}/restore`, {}, intruderCookie),
    404,
  );
  await assertStatus(
    "DELETE owner snapshot by another user",
    remove(`/api/plans/${ownerPlanId}/snapshots/${ownerSnapshotId}`, intruderCookie),
    404,
  );

  const ownerPlanAfterIntruderAttempts = await getJson(`/api/plans/${ownerPlanId}`, ownerCookie);
  assert.equal(ownerPlanAfterIntruderAttempts.plan.draft.rawAnswer, "owner private plan");
  const ownerSnapshotsAfterIntruderAttempts = await getJson(`/api/plans/${ownerPlanId}/snapshots`, ownerCookie);
  assert.equal(ownerSnapshotsAfterIntruderAttempts.snapshots.length, 1);
  assert.equal(ownerSnapshotsAfterIntruderAttempts.snapshots[0].id, ownerSnapshotId);

  await assertStatus("Admin dashboard by normal user", get("/api/admin/login-dashboard", intruderCookie), 403);
  await assertStatus(
    "Admin feedback moderation by normal user",
    put(`/api/admin/feedback/${ownerFeedbackId}`, {
      feedbackStatus: "处理中",
      adminNote: "normal user should not update this",
    }, intruderCookie),
    403,
  );
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

function remove(path, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "DELETE",
    headers: csrfHeaders(cookie),
  });
}

async function getJson(path, cookie = "") {
  const response = await get(path, cookie);
  assert.equal(response.status, 200, `${path} should return 200.`);
  return response.json();
}

async function assertStatus(label, responsePromise, expectedStatus) {
  const response = await responsePromise;
  assert.equal(response.status, expectedStatus, label);
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
