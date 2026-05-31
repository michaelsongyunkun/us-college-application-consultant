import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { createAuthService } from "../src/server/auth-service.mjs";
import { PlanningError, createPlanningService } from "../src/server/planning-service.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-planning-"));
let authDb;

try {
  authDb = createAuthDatabase({ databasePath: join(tempDir, "planning.sqlite") });
  const auth = createAuthService({ authDb });
  const planning = createPlanningService({ authDb });
  const student = auth.register({
    name: "Student One",
    email: "one@example.com",
    password: "password123",
  }).user;
  const otherStudent = auth.register({
    name: "Student Two",
    email: "two@example.com",
    password: "password123",
  }).user;

  assert.deepEqual(planning.getProfile(student), { profile: {}, updatedAt: null });
  const profile = planning.saveProfile(student, {
    grade: "11",
    intendedMajor: "Computer Science",
  });
  assert.equal(profile.profile.grade, "11");
  assert.ok(profile.updatedAt);

  const initialPlans = planning.listPlans(student);
  assert.equal(initialPlans.length, 1);
  assert.equal(initialPlans[0].name, "默认规划");
  const defaultPlan = planning.getPlan(student, initialPlans[0].id);
  assert.deepEqual(defaultPlan.draft.activities, []);

  const draft = {
    activities: [
      {
        type: "科研",
        activityName: "**社区空气质量研究**",
        executionDescription: "**问题**：社区空气质量数据不足。**行动**：设计传感器采样并写成报告。",
        suggestedGrade: "10 年级暑假",
      },
    ],
    rawAnswer: "answer",
    narrative: "narrative",
    competitionRecommendations: [{ name: "Contest" }],
    summerSchoolRecommendations: [],
    recommendationLetterStrategy: { items: [{ role: "Teacher" }] },
    caseMatches: [],
  };
  const savedPlan = planning.savePlan(student, defaultPlan.id, {
    name: "冲刺规划",
    draft,
  });
  assert.equal(savedPlan.name, "冲刺规划");
  assert.equal(savedPlan.draft.rawAnswer, "answer");
  const sensitiveDraftPlan = planning.savePlan(student, defaultPlan.id, {
    draft: { ...draft, apiKey: "sk-request", OPENAI_API_KEY: "sk-env" },
  });
  assert.equal(Object.hasOwn(sensitiveDraftPlan.draft, "apiKey"), false);
  assert.equal(Object.hasOwn(sensitiveDraftPlan.draft, "OPENAI_API_KEY"), false);

  const secondPlan = planning.createPlan(student, { name: "保底规划" });
  assert.equal(planning.listPlans(student).length, 2);
  assert.throws(
    () => planning.createPlan(student, { name: " ".repeat(4) }),
    (error) => error instanceof PlanningError && error.statusCode === 400,
  );

  const snapshot = planning.createSnapshot(student, savedPlan.id, { note: "提交前版本" });
  assert.equal(snapshot.note, "提交前版本");
  assert.equal(planning.listSnapshots(student, savedPlan.id).length, 1);

  const importSources = planning.listActivityImportSources(student);
  assert.equal(importSources.length, 2);
  assert.equal(importSources[0].sourceType, "current_plan");
  assert.equal(importSources[0].planName, "冲刺规划");
  assert.equal(importSources[0].activities[0].activityName, "社区空气质量研究");
  assert.equal(importSources[0].activities[0].description, "问题：社区空气质量数据不足。行动：设计传感器采样并写成报告。");
  assert.equal(importSources[0].activities[0].timeStage, "10 年级暑假");
  assert.equal(importSources[1].sourceType, "snapshot");
  assert.equal(importSources[1].snapshotId, snapshot.id);
  assert.equal(importSources[1].activities[0].status, "计划中");
  assert.deepEqual(planning.listActivityImportSources(otherStudent), []);

  planning.saveProfile(student, { grade: "12", intendedMajor: "History" });
  planning.savePlan(student, savedPlan.id, { draft: { activities: [], rawAnswer: "changed" } });
  const restored = planning.restoreSnapshot(student, savedPlan.id, snapshot.id);
  assert.equal(restored.profile.profile.grade, "11");
  assert.equal(restored.plan.draft.rawAnswer, "answer");
  assert.equal(restored.plan.name, "冲刺规划");
  assert.equal(planning.listSnapshots(student, savedPlan.id).length, 1);

  const browserAutofillSnapshot = planning.createSnapshot(student, savedPlan.id, {
    note: "3152482377@qq.com",
  });
  assert.equal(browserAutofillSnapshot.note, "");
  assert.deepEqual(planning.deleteSnapshot(student, savedPlan.id, browserAutofillSnapshot.id), {
    ok: true,
  });

  const removableSnapshot = planning.createSnapshot(student, savedPlan.id, { note: "删除版本" });
  assert.deepEqual(planning.deleteSnapshot(student, savedPlan.id, removableSnapshot.id), { ok: true });
  assert.equal(
    planning.listSnapshots(student, savedPlan.id).some((item) => item.id === removableSnapshot.id),
    false,
  );
  assert.equal(planning.getProfile(student).profile.grade, "11");
  assert.equal(planning.getPlan(student, savedPlan.id).draft.rawAnswer, "answer");

  assert.throws(
    () => planning.getPlan(otherStudent, savedPlan.id),
    (error) => error instanceof PlanningError && error.statusCode === 404,
  );
  assert.throws(
    () => planning.listSnapshots(otherStudent, savedPlan.id),
    (error) => error instanceof PlanningError && error.statusCode === 404,
  );
  assert.throws(
    () => planning.deleteSnapshot(otherStudent, savedPlan.id, snapshot.id),
    (error) => error instanceof PlanningError && error.statusCode === 404,
  );
  assert.throws(
    () => planning.deleteSnapshot(student, secondPlan.id, snapshot.id),
    (error) => error instanceof PlanningError && error.statusCode === 404,
  );

  assert.deepEqual(planning.deletePlan(student, secondPlan.id), { ok: true });
  assert.throws(
    () => planning.deletePlan(student, savedPlan.id),
    (error) => error instanceof PlanningError && error.statusCode === 409,
  );
} finally {
  authDb?.close();
  await rm(tempDir, { recursive: true, force: true });
}
