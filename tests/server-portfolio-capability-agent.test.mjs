import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-capability-agent-"));
const calls = [];
const agentAssessment = {
  overallSummary: "档案主线已经初步形成，下一步应补强成果证据和推荐信素材。",
  radarScores: [
    dimension("academicReadiness", 78, "SAT 1510 与 AP 记录可支持学术准备度判断"),
    dimension("directionConsistency", 82, "机器人公益、科研项目和竞赛共同指向工程应用"),
    dimension("activityDepth", 76, "核心活动写明了角色、任务和持续推进"),
    dimension("outcomeImpact", 70, "已有 demo、技术文档和服务人数"),
    dimension("leadershipInitiative", 74, "活动中体现了发起和组织信号"),
    dimension("competitiveExperience", 68, "Physics Bowl 与夏校记录提供外部竞争信号"),
    dimension("materialsReadiness", 66, "推荐信素材已有初步准备"),
  ],
  strengths: ["机器人公益项目有明确主线", "SAT 和 AP 记录增强学术可信度", "核心活动已有成果说明"],
  gaps: ["证明材料链接还不够完整", "推荐信素材包需要继续细化", "竞赛贡献需要更具体"],
  actions30Days: ["补齐核心活动证明链接", "整理推荐信素材包", "把竞赛贡献改写为个人动作"],
};

const server = createAppServer({
  databasePath: join(tempDir, "capability-agent.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "capability-agent-secret",
    DEEPSEEK_CAPABILITY_ASSESSMENT_MODEL: "Deepseek V4 Flash",
  },
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(agentAssessment) } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const blockedApi = await post("/api/portfolio-capability-assessment", {});
  assert.equal(blockedApi.status, 401);

  const registration = await post("/api/auth/register", {
    email: "capability-agent@example.com",
    name: "Capability Agent",
    password: "password123",
  });
  const cookie = registration.headers.get("set-cookie");

  const response = await post(
    "/api/portfolio-capability-assessment",
    {
      applicationPlan: {
        ed1: [{ school: "Forbidden School Needle", major: "Computer Science" }],
        rea: [],
        ed2: [],
        ea: [],
        uc: [],
        rd: [],
        multiCountry: [],
      },
      schoolSelectionVersions: [
        {
          versionName: "Forbidden Selection Version Needle",
          summary: "Do not leak this selection summary.",
          selectionJson: JSON.stringify({ school: "Forbidden School Needle" }),
        },
      ],
      academicRecords: {
        courseSystem: "其他课程体系",
        gpaScale: "4.0分制",
        gpaRecords: [{ gradeLevel: "11年级", term: "上学期", gpa: "3.92" }],
        satTests: [{ totalScore: "1510", englishScore: "730", mathScore: "780", testDate: "2026-03-14" }],
        apExams: [{ courseName: "AP Computer Science A", score: "5", examYear: "2026" }],
      },
      activities: [
        {
          activityName: "Robotics Community Lab",
          type: "工程公益",
          timeStage: "10-11年级",
          role: "发起人",
          description: "带队开发辅助导航机器人原型。",
          outcome: "完成 demo、技术文档并服务 80 名学生。",
          proofLink: "https://example.com/robotics",
          status: "已完成",
        },
      ],
      competitions: [
        {
          competitionName: "Physics Bowl",
          subject: "物理",
          yearGrade: "11年级",
          award: "Regional Top 10",
          contribution: "个人参赛并完成赛后复盘。",
          proofLink: "https://example.com/physics",
          status: "已获奖",
        },
      ],
      summerSchools: [
        {
          programName: "YYGS",
          organizer: "Yale",
          direction: "Engineering",
          participationTime: "2025 夏",
          status: "已录取",
          output: "Research brief",
          proofLink: "https://example.com/yygs",
        },
      ],
      recommendationLetters: {
        counselorStatus: "已约沟通",
        teacher1: { subject: "Physics", teacherName: "Mr. Lee", relationshipStrength: "强" },
        preparedMaterials: ["简历", "活动清单", "项目说明"],
      },
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.capabilityAssessment.generatedBy, "deepseek-capability-agent");
  assert.equal(body.portfolio.capabilityAssessment.generatedBy, "deepseek-capability-agent");
  assert.equal(body.portfolio.capabilityAssessment.radarScores.length, 7);
  assert.equal(body.portfolio.applicationPlan.ed1[0].school, "Forbidden School Needle");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  const sentPayload = JSON.parse(calls[0].options.body);
  assert.equal(sentPayload.model, "deepseek-v4-flash");
  assert.equal(sentPayload.messages[0].role, "system");
  assert.match(sentPayload.messages[0].content, /严禁输出院校推荐/);
  assert.match(sentPayload.messages[0].content, /score 表示该维度“可验证申请证据的充分度”/);
  assert.match(sentPayload.messages[0].content, /0-20 基本无可用证据/);
  assert.match(sentPayload.messages[0].content, /量化成果、奖项\/筛选性项目结果/);
  assert.match(sentPayload.messages[0].content, /不要为了雷达图好看而拉平/);
  assert.match(sentPayload.messages[1].content, /Robotics Community Lab/);
  assert.match(sentPayload.messages[1].content, /Physics Bowl/);
  assert.equal(sentPayload.messages[1].content.includes("Forbidden School Needle"), false);
  assert.equal(sentPayload.messages[1].content.includes("Forbidden Selection Version Needle"), false);
  assert.equal(String(calls[0].options.headers.Authorization).includes("capability-agent-secret"), true);
  assert.equal(JSON.stringify(body).includes("capability-agent-secret"), false);

  const reloaded = await get("/api/my-activities", cookie);
  const reloadedPortfolio = await reloaded.json();
  assert.equal(reloadedPortfolio.capabilityAssessment.generatedBy, "deepseek-capability-agent");
  assert.equal(reloadedPortfolio.capabilityAssessment.overallSummary, body.capabilityAssessment.overallSummary);

  const jobResponse = await post(
    "/api/portfolio-capability-assessment-jobs",
    {
      academicRecords: {
        courseSystem: "Other",
        gpaScale: "4.0",
        gpaRecords: [{ gradeLevel: "11", term: "Fall", gpa: "3.92" }],
      },
      activities: [
        {
          activityName: "Robotics Community Lab",
          type: "Engineering",
          description: "Prototype assistive navigation robot.",
          outcome: "Completed demo and technical writeup.",
        },
      ],
      competitions: [],
      summerSchools: [],
      recommendationLetters: {},
    },
    cookie,
  );
  assert.equal(jobResponse.status, 202);
  const createdJob = await jobResponse.json();
  assert.match(createdJob.jobId, /^[a-f0-9-]{36}$/);
  const completedJob = await waitForJob(
    "/api/portfolio-capability-assessment-jobs",
    createdJob.jobId,
    cookie,
  );
  assert.equal(completedJob.status, "completed");
  assert.equal(completedJob.result.capabilityAssessment.generatedBy, "deepseek-capability-agent");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function dimension(key, score, evidence) {
  return {
    key,
    score,
    confidence: "medium",
    evidence: [evidence],
    missing: ["需要补充更多证明材料"],
    nextAction: "补齐可验证的成果证据。",
  };
}

function post(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function get(path, cookie) {
  return fetch(`${serverUrl()}${path}`, { headers: { Cookie: cookie } });
}

async function waitForJob(endpoint, jobId, cookie) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await get(`${endpoint}/${encodeURIComponent(jobId)}`, cookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    if (body.status === "completed" || body.status === "failed") return body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${endpoint} job did not finish in time.`);
}

function jsonHeaders(cookie) {
  return { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) };
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
