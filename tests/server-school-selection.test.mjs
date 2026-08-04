import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { AI_QUALITY_VERSIONS } from "../src/server/ai-quality.mjs";
import { SCHOOL_SELECTION_GRAPH_VERSION } from "../src/server/langgraph-school-selection-workflow.mjs";
import { createMetricsStore } from "../src/server/observability.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-school-selection-"));
const calls = [];
const metrics = createMetricsStore();
const selection = {
  summary: "选校组合以 ED1 稳定主线，EA 与 RD 分层覆盖。",
  strategy: {
    earlyStrategy: "ED1 用高意愿匹配校控制风险。",
    ucStrategy: "UC 选择 6 个校区覆盖数据科学与工程方向。",
    rdStrategy: "RD 用冲刺、匹配、稳妥三层覆盖。",
  },
  rounds: {
    rea: [],
    ed1: [school("University of Chicago")],
    ed2: [school("New York University")],
    ea: [
      school("University of Michigan--Ann Arbor"),
      school("Georgia Institute of Technology"),
      school("University of Illinois Urbana-Champaign"),
      school("University of Wisconsin--Madison"),
    ],
    rd: [
      school("Harvard University"),
      school("Princeton University"),
      school("Cornell University"),
      school("Duke University"),
      school("Northwestern University"),
      school("Rice University"),
      school("Boston University"),
      school("Northeastern University"),
    ],
    uc: [
      school("University of California, Berkeley"),
      school("University of California, Los Angeles"),
      school("University of California, San Diego"),
      school("University of California, Irvine"),
      school("University of California, Davis"),
      school("University of California, Santa Barbara"),
    ],
  },
  nextActions: ["确认 ED 承诺", "核验 UC 专业限制"],
};

const server = createAppServer({
  databasePath: join(tempDir, "school-selection.sqlite"),
  metrics,
  env: {
    DEEPSEEK_API_KEY: "server-school-selection-secret",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  },
  deepSeekSchoolSelectionLlmClient: createMockSchoolSelectionLlmClient(calls),
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const blockedApi = await post("/api/school-selection", {
    nationality: "中国",
    highSchoolRegion: "中国大陆高中",
  });
  assert.equal(blockedApi.status, 401);
  const blockedJob = await post("/api/school-selection-jobs", {
    nationality: "中国",
    highSchoolRegion: "中国大陆高中",
  });
  assert.equal(blockedJob.status, 401);

  const blockedPage = await fetch(`${serverUrl()}/school-selection.html`, { redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/?next=%2Fschool-selection.html");

  const registration = await post("/api/auth/register", {
    email: "school-selection@example.com",
    name: "School Selection",
    password: "password123",
  });
  const cookie = registration.headers.get("set-cookie");

  const page = await get("/school-selection.html", cookie);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /美本选校系统/);

  await put(
    "/api/my-activities",
    {
      applicationPlan: { rea: [], ed1: [], ed2: [], ea: [], uc: [], rd: [], multiCountry: [] },
      activities: [{ activityName: "Robotics Portfolio Lab", type: "research", outcome: "Demo" }],
      competitions: [],
      summerSchools: [],
      recommendationLetters: {},
      academicRecords: {
        gpaScale: "4.0制",
        gpaRecords: [{ gradeLevel: "10年级", term: "上学期", gpa: "3.9" }],
        satTests: [{ totalScore: "1510", englishScore: "730", mathScore: "780" }],
        apExams: [],
      },
    },
    cookie,
  );

  const response = await post(
    "/api/school-selection",
    {
      nationality: "中国",
      highSchoolRegion: "中国大陆高中",
      preferences: "希望申请数据科学。",
      targetMajor: "Data Science",
      edRiskTolerance: "均衡",
      budgetSensitivity: "中等",
      deepSeekApiKey: "request-key-should-be-ignored",
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.selection.rounds.ed1[0].school, "University of Chicago");
  assert.equal(body.selection.rounds.ed1[0].admissionProbability, "12%-18%");
  assert.match(body.selection.rounds.ed1[0].gaps.join(" "), /录取友好度为 5\/10/);
  assert.match(body.selection.strategy.earlyStrategy, /ED1/);
  assert.equal(body.selection.rounds.uc.length, 6);
  assert.equal(JSON.stringify(body).includes("server-school-selection-secret"), false);
  assert.equal(JSON.stringify(body).includes("request-key-should-be-ignored"), false);
  assert.equal(body.quality.metadata.feature, "school-selection");
  assert.equal(body.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.schoolSelectionPrompt);
  assert.equal(body.quality.metadata.model, "deepseek-v4-flash");
  assert.equal(body.quality.metadata.sourceSetVersion, AI_QUALITY_VERSIONS.schoolSelectionSourceSet);
  assert.equal(body.quality.metadata.parserVersion, AI_QUALITY_VERSIONS.schoolSelectionParser);
  assert.equal(body.quality.metadata.workflowVersion, SCHOOL_SELECTION_GRAPH_VERSION);
  assert.ok(body.quality.citations.some((citation) => citation.sourceType === "school-encyclopedia"));
  const metricsAfterDirect = metrics.snapshot();
  assert.equal(metricsAfterDirect.ai.byFeature["school-selection"].totalCalls, 1);
  assert.equal(metricsAfterDirect.graph.byWorkflow[SCHOOL_SELECTION_GRAPH_VERSION].totalRuns, 1);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(metricsAfterDirect.graph.byWorkflow[SCHOOL_SELECTION_GRAPH_VERSION].byNode)
        .map(([node, value]) => [node, [value.totalCalls, value.failedCalls]]),
    ),
    {
      loadContext: [1, 0],
      draftSelection: [1, 0],
      calibrateSelection: [1, 0],
      evaluateQuality: [1, 0],
      finalizeResponse: [1, 0],
    },
  );

  const sentPayload = calls[0];
  assert.equal(sentPayload.model, "deepseek-v4-flash");
  assert.equal(sentPayload.maxTokens, 9000);
  assert.equal(sentPayload.timeoutMs, 120_000);
  assert.equal(sentPayload.maxAttempts, 1);
  assert.equal(sentPayload.temperature, 0.2);
  assert.match(sentPayload.messages[1].content, /中国大陆高中/);
  assert.match(sentPayload.messages[1].content, /Data Science/);
  assert.match(sentPayload.messages[1].content, /预算敏感度/);
  assert.match(sentPayload.messages[1].content, /均衡/);
  assert.match(sentPayload.messages[1].content, /Robotics Portfolio Lab/);
  assert.match(sentPayload.messages[1].content, /1510/);

  const jobResponse = await post(
    "/api/school-selection-jobs",
    {
      nationality: "中国",
      highSchoolRegion: "中国大陆高中",
      preferences: "希望申请数据科学。",
      targetMajor: "Data Science",
      edRiskTolerance: "均衡",
      budgetSensitivity: "中等",
    },
    cookie,
  );
  assert.equal(jobResponse.status, 202);
  const createdJob = await jobResponse.json();
  assert.match(createdJob.jobId, /^[a-f0-9-]{36}$/);
  assert.equal(createdJob.status, "pending");

  const completedJob = await waitForSchoolSelectionJob(createdJob.jobId, cookie);
  assert.equal(completedJob.status, "completed");
  assert.equal(completedJob.result.selection.rounds.ed1[0].school, "University of Chicago");
  assert.equal(completedJob.result.selection.rounds.ed1[0].admissionProbability, "12%-18%");
  assert.equal(completedJob.result.selection.rounds.uc.length, 6);
  assert.equal(completedJob.result.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.schoolSelectionPrompt);
  assert.equal(completedJob.result.quality.metadata.workflowVersion, SCHOOL_SELECTION_GRAPH_VERSION);
  const metricsAfterJob = metrics.snapshot();
  assert.equal(metricsAfterJob.ai.byFeature["school-selection"].totalCalls, 2);
  assert.equal(metricsAfterJob.graph.byWorkflow[SCHOOL_SELECTION_GRAPH_VERSION].totalRuns, 2);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function school(name) {
  return {
    school: name,
    major: "Data Science",
    riskLevel: "medium",
    admissionProbability: "18%-28%",
    matchReason: `${name} matches the portfolio.`,
    gaps: ["核验要求"],
    nextAction: "检查官网。",
  };
}

function createMockSchoolSelectionLlmClient(callLog) {
  return {
    async invoke(options) {
      callLog.push({
        model: options.model,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
        temperature: options.temperature,
        messages: options.messages,
        signal: options.signal,
      });
      return {
        content: JSON.stringify(selection),
        model: options.model,
      };
    },
  };
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

async function waitForSchoolSelectionJob(jobId, cookie) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await get(`/api/school-selection-jobs/${encodeURIComponent(jobId)}`, cookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    if (body.status === "completed" || body.status === "failed") return body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("School selection job did not finish in time.");
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
