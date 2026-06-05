import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-server-my-activities-"));
const server = createAppServer({ databasePath: join(tempDir, "my-activities.sqlite") });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const blockedApi = await fetch(`${serverUrl()}/api/my-activities`);
  assert.equal(blockedApi.status, 401);

  const blockedPage = await fetch(`${serverUrl()}/my-activities.html`, { redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/?next=%2Fmy-activities.html");

  const firstRegistration = await post("/api/auth/register", {
    email: "activities-a@example.com",
    name: "Activities A",
    password: "password123",
  });
  const firstCookie = firstRegistration.headers.get("set-cookie");

  const blockedImportSources = await fetch(`${serverUrl()}/api/my-activities/import-sources`);
  assert.equal(blockedImportSources.status, 401);

  const emptyPortfolio = await get("/api/my-activities", firstCookie);
  assert.equal(emptyPortfolio.status, 200);
  assert.deepEqual(await emptyPortfolio.json(), {
    applicationPlan: {
      rea: [],
      ed1: [],
      ed2: [],
      ea: [],
      uc: [],
      rd: [],
      multiCountry: [],
    },
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    planningActions: [],
    deepSeekNotes: [],
    schoolSelectionVersions: [],
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
      standardizedPlan: {},
    },
    updatedAt: null,
  });

  const protectedPage = await get("/my-activities.html", firstCookie);
  assert.equal(protectedPage.status, 200);
  assert.match(await protectedPage.text(), /我的申请/);

  const plansResponse = await get("/api/plans", firstCookie);
  const firstPlanId = (await plansResponse.json()).plans[0].id;
  await put(
    `/api/plans/${firstPlanId}`,
    {
      draft: {
        activities: [
          {
            type: "公益",
            activityName: "社区科普社",
            executionDescription: "组织社区科学工作坊",
            suggestedGrade: "10 年级中",
          },
        ],
      },
    },
    firstCookie,
  );
  await post(`/api/plans/${firstPlanId}/snapshots`, { note: "导入测试备份" }, firstCookie);
  const importSources = await get("/api/my-activities/import-sources", firstCookie);
  assert.equal(importSources.status, 200);
  const importSourceData = await importSources.json();
  assert.equal(importSourceData.sources.length, 2);
  assert.equal(importSourceData.sources[0].activities[0].activityName, "社区科普社");
  assert.equal(importSourceData.sources[0].activities[0].description, "组织社区科学工作坊");
  assert.equal(importSourceData.sources[1].sourceType, "snapshot");

  const savedResponse = await put(
    "/api/my-activities",
    {
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
        multiCountry: [
          { school: "University of Waterloo", major: "Computer Science" },
          { school: "ETH Zurich", major: "Engineering" },
        ],
      },
      activities: [
        {
          activityName: "社区科普社",
          type: "公益",
          timeStage: "10 年级上",
          role: "负责人",
          description: "组织社区科学工作坊",
          outcome: "覆盖 80 名学生",
          proofLink: "https://example.com/activity",
          status: "已完成",
        },
      ],
      competitions: [
        {
          competitionName: "Physics Bowl",
          subject: "物理",
          yearGrade: "11 年级",
          award: "Regional Top 10",
          contribution: "个人参赛",
          proofLink: "https://example.com/competition",
          status: "已获奖",
        },
      ],
      summerSchools: [
        {
          programName: "YYGS",
          organizer: "Yale",
          direction: "Politics",
          participationTime: "2025 夏",
          status: "已录取",
          output: "政策 brief",
          proofLink: "https://example.com/summer",
        },
      ],
      recommendationLetters: {
        counselorStatus: "已约沟通",
        teacher1: {
          subject: "英语",
          teacherName: "Ms. Carter",
          relationshipStrength: "强",
          materials: "简历、活动清单",
        },
        teacher2: {
          subject: "物理",
          teacherName: "Mr. Lee",
          relationshipStrength: "中",
          materials: "项目说明",
        },
        outsideRecommender: {
          identity: "实验室导师",
          relationship: "暑期科研导师",
          scenario: "补充推荐信",
        },
        preparedMaterials: ["简历", "活动清单", "项目说明"],
        notes: "申请季前再更新成绩单",
      },
      planningActions: [
        { text: "核验 ED 截止日期", source: "问DeepSeek" },
        { text: "补充 Robotics Portfolio 成果证明", source: "美本选校系统" },
      ],
      deepSeekNotes: [
        {
          title: "选校策略摘要",
          content: "ED1 保持稳定主线，EA 与 RD 分层覆盖。",
          source: "美本选校系统",
        },
      ],
      schoolSelectionVersions: [
        {
          versionName: "均衡版",
          summary: "ED1 保持稳定主线，EA 与 RD 分层覆盖。",
          selectionJson: JSON.stringify({ summary: "ED1 保持稳定主线" }),
        },
      ],
      academicRecords: {
        gpaScale: "100分制",
        gpaRecords: [
          { gradeLevel: "9年级", term: "上学期", gpa: "92" },
          { gradeLevel: "9年级", term: "下学期", gpa: "94" },
        ],
        satTests: [
          {
            totalScore: "1480",
            englishScore: "700",
            mathScore: "780",
            testDate: "2026-03-14",
          },
        ],
        apExams: [
          { courseName: "AP Calculus BC（微积分 BC）", score: "5", examYear: "2026" },
          { courseName: "AP Biology（生物）", score: "未出分", examYear: "2026" },
        ],
        standardizedPlan: {
          input: {
            grade: "11年级",
            preferredExam: "sat",
            weeklyStudyHours: "8",
          },
          route: {
            summary: "SAT 主线 + TOEFL 补齐",
            primaryExam: "SAT",
            planVariant: "parallel_required",
            adaptationFactors: ["目标学校存在必交政策", "语言成绩缺失，需要并行安排"],
            sectionFocus: [{ exam: "SAT", section: "EBRW / 阅读与文法", priority: "高", reason: "阅读差距较大" }],
            decisionGates: [{ label: "并行线检查", trigger: "第 1 月结束", action: "保留 SAT 主线，同时固定语言考试窗口" }],
            timeBudgetWarning: "每周备考时间处于 5-8 小时区间，需要固定分配。",
            priorities: [{ exam: "SAT", level: "高", reason: "目标学校存在必交政策" }],
            nextActions: ["核验学校官网标化政策"],
          },
          savedAt: "2026-06-05T00:00:00.000Z",
        },
      },
    },
    firstCookie,
  );
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.applicationPlan.ed1[0].school, "University of Chicago");
  assert.equal(saved.applicationPlan.ea.length, 2);
  assert.equal(saved.applicationPlan.uc[0].major, "Applied Math");
  assert.equal(saved.applicationPlan.multiCountry[1].school, "ETH Zurich");
  assert.equal(saved.activities[0].activityName, "社区科普社");
  assert.equal(saved.competitions[0].competitionName, "Physics Bowl");
  assert.equal(saved.summerSchools[0].programName, "YYGS");
  assert.equal(saved.recommendationLetters.teacher1.teacherName, "Ms. Carter");
  assert.equal(saved.planningActions[0].text, "核验 ED 截止日期");
  assert.equal(saved.deepSeekNotes[0].title, "选校策略摘要");
  assert.equal(saved.schoolSelectionVersions[0].versionName, "均衡版");
  assert.equal(saved.academicRecords.gpaScale, "100分制");
  assert.equal(saved.academicRecords.gpaRecords[0].gpa, "92");
  assert.equal(saved.academicRecords.satTests[0].totalScore, "1480");
  assert.equal(saved.academicRecords.apExams[1].score, "未出分");
  assert.equal(saved.academicRecords.standardizedPlan.route.primaryExam, "SAT");
  assert.equal(saved.academicRecords.standardizedPlan.route.planVariant, "parallel_required");
  assert.equal(saved.academicRecords.standardizedPlan.route.adaptationFactors[1], "语言成绩缺失，需要并行安排");
  assert.equal(saved.academicRecords.standardizedPlan.route.sectionFocus[0].section, "EBRW / 阅读与文法");
  assert.equal(saved.academicRecords.standardizedPlan.route.decisionGates[0].action, "保留 SAT 主线，同时固定语言考试窗口");
  assert.match(saved.academicRecords.standardizedPlan.route.timeBudgetWarning, /固定分配/);
  assert.deepEqual(saved.academicRecords.standardizedPlan.route.nextActions, ["核验学校官网标化政策"]);
  assert.ok(saved.updatedAt);

  const reloaded = await get("/api/my-activities", firstCookie);
  const reloadedPortfolio = await reloaded.json();
  assert.equal(reloadedPortfolio.activities[0].outcome, "覆盖 80 名学生");
  assert.deepEqual(reloadedPortfolio.applicationPlan, saved.applicationPlan);
  assert.deepEqual(reloadedPortfolio.planningActions, saved.planningActions);
  assert.deepEqual(reloadedPortfolio.deepSeekNotes, saved.deepSeekNotes);
  assert.deepEqual(reloadedPortfolio.schoolSelectionVersions, saved.schoolSelectionVersions);
  assert.deepEqual(reloadedPortfolio.academicRecords, saved.academicRecords);

  const secondRegistration = await post("/api/auth/register", {
    email: "activities-b@example.com",
    name: "Activities B",
    password: "password123",
  });
  const secondCookie = secondRegistration.headers.get("set-cookie");
  const secondPortfolio = await get("/api/my-activities", secondCookie);
  assert.deepEqual(await secondPortfolio.json(), {
    applicationPlan: {
      rea: [],
      ed1: [],
      ed2: [],
      ea: [],
      uc: [],
      rd: [],
      multiCountry: [],
    },
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    planningActions: [],
    deepSeekNotes: [],
    schoolSelectionVersions: [],
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
      standardizedPlan: {},
    },
    updatedAt: null,
  });
  const secondImportSources = await get("/api/my-activities/import-sources", secondCookie);
  assert.deepEqual(await secondImportSources.json(), { sources: [] });
} finally {
  await new Promise((resolve) => server.close(resolve));
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
  return fetch(`${serverUrl()}${path}`, { headers: { Cookie: cookie } });
}

function jsonHeaders(cookie) {
  return { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) };
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
