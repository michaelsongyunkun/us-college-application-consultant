import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { buildCookieHeader, csrfHeaders, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-server-planning-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "planning.sqlite") });
const server = createAppServer({ authDb });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const blockedProfile = await fetch(`${baseUrl}/api/student-profile`);
  assert.equal(blockedProfile.status, 401);

  const firstRegistration = await post("/api/auth/register", {
    email: "first@example.com",
    name: "First Student",
    password: "password123",
  });
  const firstCookie = firstRegistration.headers.get("set-cookie");

  const emptyProfile = await get("/api/student-profile", firstCookie);
  assert.deepEqual(await emptyProfile.json(), { profile: {}, updatedAt: null });

  const plansResponse = await get("/api/plans", firstCookie);
  assert.equal(plansResponse.status, 200);
  const { plans } = await plansResponse.json();
  assert.equal(plans.length, 1);
  assert.equal(plans[0].name, "默认规划");

  const profileResponse = await put(
    "/api/student-profile",
    { profile: { grade: "11", intendedMajor: "Economics" } },
    firstCookie,
  );
  assert.equal(profileResponse.status, 200);
  assert.equal((await profileResponse.json()).profile.grade, "11");

  const planResponse = await put(
    `/api/plans/${plans[0].id}`,
    { draft: { activities: [{ title: "Debate" }], rawAnswer: "original" } },
    firstCookie,
  );
  assert.equal(planResponse.status, 200);
  assert.equal((await planResponse.json()).plan.draft.rawAnswer, "original");

  const snapshotResponse = await post(
    `/api/plans/${plans[0].id}/snapshots`,
    { note: "Application version" },
    firstCookie,
  );
  assert.equal(snapshotResponse.status, 201);
  const { snapshot } = await snapshotResponse.json();

  await put(
    "/api/student-profile",
    { profile: { grade: "12", intendedMajor: "Art" } },
    firstCookie,
  );
  await put(`/api/plans/${plans[0].id}`, { draft: { rawAnswer: "changed" } }, firstCookie);
  const restoreResponse = await post(
    `/api/plans/${plans[0].id}/snapshots/${snapshot.id}/restore`,
    {},
    firstCookie,
  );
  assert.equal(restoreResponse.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.profile.profile.grade, "11");
  assert.equal(restored.plan.draft.rawAnswer, "original");

  const deleteSnapshot = await remove(
    `/api/plans/${plans[0].id}/snapshots/${snapshot.id}`,
    firstCookie,
  );
  assert.equal(deleteSnapshot.status, 200);
  assert.deepEqual(await deleteSnapshot.json(), { ok: true });
  const deleteSnapshotAgain = await remove(
    `/api/plans/${plans[0].id}/snapshots/${snapshot.id}`,
    firstCookie,
  );
  assert.equal(deleteSnapshotAgain.status, 404);
  const planAfterSnapshotDelete = await get(`/api/plans/${plans[0].id}`, firstCookie);
  assert.equal((await planAfterSnapshotDelete.json()).plan.draft.rawAnswer, "original");
  const profileAfterSnapshotDelete = await get("/api/student-profile", firstCookie);
  assert.equal((await profileAfterSnapshotDelete.json()).profile.grade, "11");

  const extraPlanResponse = await post("/api/plans", { name: "第二规划" }, firstCookie);
  assert.equal(extraPlanResponse.status, 201);
  const extraPlan = (await extraPlanResponse.json()).plan;
  assert.equal(extraPlan.name, "第二规划");
  const deleteExtra = await remove(`/api/plans/${extraPlan.id}`, firstCookie);
  assert.equal(deleteExtra.status, 200);
  const deleteLast = await remove(`/api/plans/${plans[0].id}`, firstCookie);
  assert.equal(deleteLast.status, 409);

  const secondRegistration = await post("/api/auth/register", {
    email: "second@example.com",
    name: "Second Student",
    password: "password123",
  });
  const secondCookie = secondRegistration.headers.get("set-cookie");
  const hiddenPlan = await get(`/api/plans/${plans[0].id}`, secondCookie);
  assert.equal(hiddenPlan.status, 404);

  const auditEvents = authDb.db
    .prepare(
      `SELECT action, resource_type AS resourceType, resource_id AS resourceId, details_json AS detailsJson
       FROM audit_events
       ORDER BY id`,
    )
    .all();
  assert.ok(auditEvents.some(
    (event) => event.action === "plan.snapshot.restore" && event.resourceId === String(snapshot.id),
  ));
  assert.ok(auditEvents.some(
    (event) => event.action === "plan.snapshot.delete" && event.resourceId === String(snapshot.id),
  ));
  assert.ok(auditEvents.some(
    (event) => event.action === "plan.delete" && event.resourceId === String(extraPlan.id),
  ));
  const restoreAudit = auditEvents.find((event) => event.action === "plan.snapshot.restore");
  assert.equal(JSON.parse(restoreAudit.detailsJson).planId, String(plans[0].id));
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

function put(path, payload, cookie) {
  return fetch(`${serverUrl()}${path}`, {
    method: "PUT",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function get(path, cookie) {
  return fetch(`${serverUrl()}${path}`, { headers: { Cookie: buildCookieHeader(cookie) } });
}

function remove(path, cookie) {
  return fetch(`${serverUrl()}${path}`, { method: "DELETE", headers: csrfHeaders(cookie) });
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
