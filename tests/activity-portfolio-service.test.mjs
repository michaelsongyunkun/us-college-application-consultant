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
    applicationPlan: {
      rea: [],
      ed1: [],
      ed2: [],
      ea: [],
      uc: [],
      rd: [],
    },
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    academicRecords: {
      gpaScale: "",
      gpaRecords: [
        { gradeLevel: "9年级", term: "上学期", gpa: "" },
        { gradeLevel: "9年级", term: "下学期", gpa: "" },
        { gradeLevel: "10年级", term: "上学期", gpa: "" },
        { gradeLevel: "10年级", term: "下学期", gpa: "" },
        { gradeLevel: "11年级", term: "上学期", gpa: "" },
        { gradeLevel: "11年级", term: "下学期", gpa: "" },
        { gradeLevel: "12年级", term: "上学期", gpa: "" },
        { gradeLevel: "12年级", term: "下学期", gpa: "" },
      ],
      satTests: [],
      apExams: [],
    },
    updatedAt: null,
  });

  const saved = portfolios.savePortfolio(firstStudent, {
    applicationPlan: {
      rea: [],
      ed1: [{ school: "University of Chicago", major: "Economics" }],
      ed2: [{ school: "New York University", major: "Business" }],
      ea: [
        { school: "Massachusetts Institute of Technology", major: "Electrical Engineering" },
        { school: "University of Michigan--Ann Arbor", major: "Data Science" },
      ],
      uc: [{ school: "University of California, Los Angeles", major: "Applied Math" }],
      rd: [{ school: "Harvard University", major: "History" }],
    },
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
    academicRecords: {
      gpaScale: "4.0分制",
      gpaRecords: [
        { gradeLevel: "9年级", term: "上学期", gpa: "3.80" },
        { gradeLevel: "9年级", term: "下学期", gpa: "3.92" },
      ],
      satTests: [
        {
          totalScore: "1510",
          englishScore: "730",
          mathScore: "780",
          testDate: "2026-03-14",
        },
      ],
      apExams: [
        { courseName: "AP Calculus BC（微积分 BC）", score: "5", examYear: "2026" },
        { courseName: "AP Biology（生物）", score: "未出分", examYear: "2026" },
      ],
    },
  });

  assert.equal(saved.applicationPlan.rea.length, 0);
  assert.equal(saved.applicationPlan.ed1.length, 1);
  assert.equal(saved.applicationPlan.ed1[0].school, "University of Chicago");
  assert.equal(saved.applicationPlan.ed2.length, 1);
  assert.equal(saved.applicationPlan.ea.length, 2);
  assert.equal(saved.applicationPlan.uc[0].major, "Applied Math");
  assert.equal(saved.applicationPlan.rd[0].school, "Harvard University");
  assert.equal(saved.activities.length, 10, "课外活动最多保存 10 项。");
  assert.equal(saved.activities[0].activityName, "Activity 1");
  assert.equal(saved.activities[0].type, "科研");
  assert.equal(saved.competitions.length, 1);
  assert.equal(saved.competitions[0].competitionName, "USACO");
  assert.equal(saved.summerSchools.length, 1);
  assert.equal(saved.summerSchools[0].programName, "Summer Research");
  assert.equal(saved.recommendationLetters.teacher1.teacherName, "Ms. Lin");
  assert.deepEqual(saved.recommendationLetters.preparedMaterials, ["简历", "活动清单"]);
  assert.equal(saved.academicRecords.gpaRecords.length, 2);
  assert.equal(saved.academicRecords.gpaScale, "4.0分制");
  assert.equal(saved.academicRecords.gpaRecords[0].gradeLevel, "9年级");
  assert.equal(saved.academicRecords.satTests[0].totalScore, "1510");
  assert.equal(saved.academicRecords.satTests[0].englishScore, "730");
  assert.equal(saved.academicRecords.satTests[0].mathScore, "780");
  assert.equal(saved.academicRecords.satTests[0].testDate, "2026-03-14");
  assert.equal(saved.academicRecords.apExams[0].courseName, "AP Calculus BC（微积分 BC）");
  assert.equal(saved.academicRecords.apExams[1].score, "未出分");
  assert.equal(saved.updatedAt, "2026-05-28T00:00:00.000Z");

  const reloaded = portfolios.getPortfolio(firstStudent);
  assert.deepEqual(reloaded.applicationPlan, saved.applicationPlan);
  assert.deepEqual(reloaded.activities, saved.activities);
  assert.deepEqual(reloaded.academicRecords, saved.academicRecords);
  assert.equal(reloaded.recommendationLetters.notes, "6 月更新材料");
  assert.deepEqual(portfolios.getPortfolio(secondStudent), {
    applicationPlan: {
      rea: [],
      ed1: [],
      ed2: [],
      ea: [],
      uc: [],
      rd: [],
    },
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    academicRecords: {
      gpaScale: "",
      gpaRecords: [
        { gradeLevel: "9年级", term: "上学期", gpa: "" },
        { gradeLevel: "9年级", term: "下学期", gpa: "" },
        { gradeLevel: "10年级", term: "上学期", gpa: "" },
        { gradeLevel: "10年级", term: "下学期", gpa: "" },
        { gradeLevel: "11年级", term: "上学期", gpa: "" },
        { gradeLevel: "11年级", term: "下学期", gpa: "" },
        { gradeLevel: "12年级", term: "上学期", gpa: "" },
        { gradeLevel: "12年级", term: "下学期", gpa: "" },
      ],
      satTests: [],
      apExams: [],
    },
    updatedAt: null,
  });

  const conflictSaved = portfolios.savePortfolio(secondStudent, {
    applicationPlan: {
      rea: [
        { school: "Princeton University", major: "Computer Science" },
        { school: "Harvard University", major: "Economics" },
      ],
      ed1: [{ school: "University of Chicago", major: "Economics" }],
    },
  });
  assert.equal(conflictSaved.applicationPlan.rea.length, 1, "REA 最多保存 1 所。");
  assert.equal(conflictSaved.applicationPlan.rea[0].school, "Princeton University");
  assert.equal(conflictSaved.applicationPlan.ed1.length, 0, "REA 与 ED1 不能同时保留。");

  assert.throws(
    () => portfolios.savePortfolio({}, { activities: [] }),
    (error) => error instanceof ActivityPortfolioError && error.statusCode === 401,
  );
} finally {
  authDb?.close();
  await rm(tempDir, { recursive: true, force: true });
}
