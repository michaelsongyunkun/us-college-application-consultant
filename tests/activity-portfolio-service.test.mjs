import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { createAuthService } from "../src/server/auth-service.mjs";
import {
  ActivityPortfolioError,
  createActivityPortfolioService,
} from "../src/server/activity-portfolio-service.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-activity-portfolio-"));
let authDb;

try {
  let tick = 0;
  authDb = createAuthDatabase({ databasePath: join(tempDir, "activity-portfolio.sqlite") });
  const auth = createAuthService({ authDb });
  const portfolios = createActivityPortfolioService({
    authDb,
    now: () => new Date(`2026-05-28T00:00:0${tick++}.000Z`),
  });
  const firstStudent = auth.register({
    name: "First Student",
    email: "first-portfolio@example.com",
    password: "password123",
  }).user;
  const secondStudent = auth.register({
    name: "Second Student",
    email: "second-portfolio@example.com",
    password: "password123",
  }).user;

  assert.deepEqual(portfolios.getPortfolio(firstStudent), {
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    updatedAt: null,
  });

  const saved = portfolios.savePortfolio(firstStudent, {
    activities: Array.from({ length: 12 }, (_, index) => ({
      activityName: `Activity ${index + 1}`,
      type: index === 0 ? "科研" : "",
      status: index === 0 ? "已完成" : "",
    })),
    competitions: [
      {
        competitionName: "USACO",
        subject: "计算机",
        yearGrade: "10 年级",
        award: "Silver",
        contribution: "独立完成",
        proofLink: "https://example.com/usaco",
        status: "已获奖",
      },
    ],
    summerSchools: [
      {
        programName: "Summer Research",
        organizer: "Example University",
        direction: "AI",
        participationTime: "2025 夏",
        status: "已完成",
        output: "Poster",
        proofLink: "https://example.com/summer",
      },
    ],
    recommendationLetters: {
      counselorStatus: "已沟通",
      teacher1: {
        subject: "数学",
        teacherName: "Ms. Lin",
        relationshipStrength: "强",
        materials: "活动清单",
      },
      preparedMaterials: ["简历", "活动清单"],
      notes: "6 月更新材料",
    },
  });

  assert.equal(saved.activities.length, 10, "课外活动最多保存 10 项。");
  assert.equal(saved.activities[0].activityName, "Activity 1");
  assert.equal(saved.activities[0].type, "科研");
  assert.equal(saved.competitions.length, 1);
  assert.equal(saved.competitions[0].competitionName, "USACO");
  assert.equal(saved.summerSchools.length, 1);
  assert.equal(saved.summerSchools[0].programName, "Summer Research");
  assert.equal(saved.recommendationLetters.teacher1.teacherName, "Ms. Lin");
  assert.deepEqual(saved.recommendationLetters.preparedMaterials, ["简历", "活动清单"]);
  assert.equal(saved.updatedAt, "2026-05-28T00:00:00.000Z");

  const reloaded = portfolios.getPortfolio(firstStudent);
  assert.deepEqual(reloaded.activities, saved.activities);
  assert.equal(reloaded.recommendationLetters.notes, "6 月更新材料");
  assert.deepEqual(portfolios.getPortfolio(secondStudent), {
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    updatedAt: null,
  });

  assert.throws(
    () => portfolios.savePortfolio({}, { activities: [] }),
    (error) => error instanceof ActivityPortfolioError && error.statusCode === 401,
  );
} finally {
  authDb?.close();
  await rm(tempDir, { recursive: true, force: true });
}
