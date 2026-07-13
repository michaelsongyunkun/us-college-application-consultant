import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { AI_QUALITY_VERSIONS } from "../src/server/ai-quality.mjs";
import {
  ensureExternalResourceVerification,
  findPlanningNarrativeConstraintError,
} from "../src/server/deepseek-plan-service.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-plan-"));
const calls = [];
const deepSeekAnswer = buildPlanAnswer(15);

const verifiedExternalResult = ensureExternalResourceVerification({
  activities: [
    { activityName: "参加美国数学竞赛 AMC10/12", executionDescription: "完成报名并参赛", type: "学术", suggestedGrade: "10" },
    { activityName: "本地社区观察", executionDescription: "记录社区问题", type: "兴趣", suggestedGrade: "10" },
  ],
  narrative: "测试",
});
assert.match(verifiedExternalResult.activities[0].executionDescription, /待核验：名称、资格、截止日期、成本/u);
assert.equal(verifiedExternalResult.activities[1].executionDescription, "记录社区问题");
assert.match(
  findPlanningNarrativeConstraintError("起步组合：活动1、活动2、活动3、活动4、活动5，合计6小时。"),
  /超过4项/u,
);
assert.equal(
  findPlanningNarrativeConstraintError("起步组合：活动1、活动2、活动3、活动4，合计6小时。"),
  "",
);
assert.match(
  findPlanningNarrativeConstraintError("起步组合：1. 科研；2. 社区；3. 写作；4. 社团；5. 竞赛。"),
  /超过4项/u,
);
assert.match(
  findPlanningNarrativeConstraintError("起步组合（共5项，总周投入6小时）：①科研；②社区；③写作；④社团；⑤竞赛。"),
  /超过4项/u,
);
assert.equal(
  findPlanningNarrativeConstraintError("起步组合（共4项，总周投入6小时）：①科研；②社区；③写作；④社团。"),
  "",
);
assert.equal(
  findPlanningNarrativeConstraintError("起步组合：活动1、活动2、活动3、活动4；后续活动5明确延后。"),
  "",
);

function buildPlanAnswer(count, narrative = "以AI教育公益为Spike，形成技术能力与社区影响的闭环。") {
  const rows = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return `| ${id} | 学术突破 | AI教育公益研究 ${id} | 问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具 ${id}；影响：服务80名学生 | 10-11 |`;
  }).join("\n");
  return `### 输出列表（严格按表格填写）
| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|------|------------------|----------------------|--------------------------------------|----------|
${rows}

### 【活动叙事逻辑解读】
${narrative}`;
}

const server = createAppServer({
  databasePath: join(tempDir, "deepseek.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "env-deepseek-secret",
    DEEPSEEK_MODEL: "Deepseek V4 pro",
  },
  deepSeekPlanLlmClient: createMockPlanLlmClient(calls),
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const registration = await post("/api/auth/register", {
    email: "deepseek@example.com",
    name: "DeepSeek Student",
    password: "password123",
  });
  const cookie = registration.headers.get("set-cookie");

  const response = await post(
    "/api/deepseek-plan",
    {
      profile: { grade: "10年级", majorDirection: "AI教育" },
      activities: [],
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, deepSeekAnswer);
  assert.equal(body.parsed.activities.length, 15);
  assert.equal(body.parsed.activities[0].activityName, "AI教育公益研究 1");
  assert.equal(JSON.stringify(body).includes("env-deepseek-secret"), false);
  assert.equal(body.quality.metadata.feature, "deepseek-plan");
  assert.equal(body.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.deepseekPlanPrompt);
  assert.equal(body.quality.metadata.model, "deepseek-v4-flash");
  assert.equal(body.quality.metadata.parserVersion, AI_QUALITY_VERSIONS.deepseekPlanParser);

  assert.equal(calls.length, 1);
  const sentPayload = calls[0];
  assert.equal(sentPayload.model, "deepseek-v4-flash");
  assert.equal(sentPayload.temperature, 0.4);
  assert.equal(sentPayload.maxTokens, 6500);
  assert.equal(sentPayload.timeoutMs, 75_000);
  assert.equal(sentPayload.messages[0].role, "system");
  assert.equal(sentPayload.messages[1].role, "user");
  assert.match(sentPayload.messages[1].content, /恰好15项/);
  assert.match(sentPayload.messages[1].content, /10年级/);
  assert.match(sentPayload.messages[1].content, /待核验：名称、资格、截止日期、成本/);
  assert.match(sentPayload.messages[1].content, /起步组合最多4项/u);

  const jobResponse = await post(
    "/api/deepseek-plan-jobs",
    {
      profile: { grade: "10骞寸骇", majorDirection: "AI鏁欒偛" },
      activities: [],
    },
    cookie,
  );
  assert.equal(jobResponse.status, 202);
  const createdJob = await jobResponse.json();
  assert.match(createdJob.jobId, /^[a-f0-9-]{36}$/);
  assert.equal(createdJob.status, "pending");
  const completedJob = await waitForJob("/api/deepseek-plan-jobs", createdJob.jobId, cookie);
  assert.equal(completedJob.status, "completed");
  assert.equal(completedJob.result.answer, deepSeekAnswer);
  assert.equal(completedJob.result.parsed.activities.length, 15);
  assert.equal(completedJob.result.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.deepseekPlanPrompt);

  const longResponse = await post(
    "/api/deepseek-plan",
    {
      profile: {
        grade: "10年级",
        majorDirection: "Data Science",
        interests: "I".repeat(8000),
        existingActivities: "E".repeat(8000),
      },
      activities: Array.from({ length: 15 }, (_, index) => ({
        type: `Type ${index + 1}`,
        activityName: `Activity ${index + 1} ${"N".repeat(2000)}`,
        executionDescription: `Description ${index + 1} ${"D".repeat(5000)}`,
        suggestedGrade: "10-11",
      })),
    },
    cookie,
  );
  assert.equal(longResponse.status, 200);
  const longPayload = calls.at(-1);
  assert.ok(longPayload.messages[1].content.length < 35_000);
  assert.doesNotMatch(longPayload.messages[1].content, /D{2000}|I{2000}|N{1000}/);

  const retryCalls = [];
  const retryServer = createAppServer({
    databasePath: join(tempDir, "deepseek-plan-retry.sqlite"),
    env: {
      DEEPSEEK_API_KEY: "env-deepseek-secret",
    },
    deepSeekPlanLlmClient: createMockPlanLlmClient(
      retryCalls,
      (callNumber) => (callNumber === 1 ? buildPlanAnswer(1) : buildPlanAnswer(15)),
    ),
  });
  try {
    await new Promise((resolve) => retryServer.listen(0, "127.0.0.1", resolve));
    const retryRegistration = await fetch(`${serverUrl(retryServer)}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "deepseek-plan-retry@example.com",
        name: "DeepSeek Retry",
        password: "password123",
      }),
    });
    const retryCookie = retryRegistration.headers.get("set-cookie");
    const retryResponse = await fetch(`${serverUrl(retryServer)}/api/deepseek-plan`, {
      method: "POST",
      headers: jsonHeaders(retryCookie),
      body: JSON.stringify({
        profile: { grade: "10年级", majorDirection: "AI教育" },
        activities: [],
      }),
    });
    assert.equal(retryResponse.status, 200);
    assert.equal((await retryResponse.json()).parsed.activities.length, 15);
    assert.equal(retryCalls.length, 2);
    assert.equal(retryCalls[0].temperature, 0.4);
    assert.equal(retryCalls[1].temperature, 0.2);
    assert.match(retryCalls[1].messages[1].content, /未通过解析校验/);
  } finally {
    await new Promise((resolve) => retryServer.close(resolve));
  }

  const narrativeRetryCalls = [];
  const narrativeRetryServer = createAppServer({
    databasePath: join(tempDir, "deepseek-plan-narrative-retry.sqlite"),
    env: {
      DEEPSEEK_API_KEY: "env-deepseek-secret",
    },
    deepSeekPlanLlmClient: createMockPlanLlmClient(
      narrativeRetryCalls,
      (callNumber) => buildPlanAnswer(
        15,
        callNumber === 1
          ? "起步组合：活动1、活动2、活动3、活动4、活动5，合计6小时。"
          : "起步组合：活动1、活动2、活动3、活动4，合计6小时；其余候选明确延后。",
      ),
    ),
  });
  try {
    await new Promise((resolve) => narrativeRetryServer.listen(0, "127.0.0.1", resolve));
    const narrativeRetryRegistration = await fetch(`${serverUrl(narrativeRetryServer)}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "deepseek-plan-narrative-retry@example.com",
        name: "DeepSeek Narrative Retry",
        password: "password123",
      }),
    });
    const narrativeRetryCookie = narrativeRetryRegistration.headers.get("set-cookie");
    const narrativeRetryResponse = await fetch(`${serverUrl(narrativeRetryServer)}/api/deepseek-plan`, {
      method: "POST",
      headers: jsonHeaders(narrativeRetryCookie),
      body: JSON.stringify({
        profile: { grade: "10年级", majorDirection: "AI教育" },
        activities: [],
      }),
    });
    assert.equal(narrativeRetryResponse.status, 200);
    assert.equal((await narrativeRetryResponse.json()).attempts, 2);
    assert.equal(narrativeRetryCalls.length, 2);
    assert.equal(narrativeRetryCalls[0].temperature, 0.4);
    assert.equal(narrativeRetryCalls[1].temperature, 0.2);
    assert.match(narrativeRetryCalls[1].messages[1].content, /超过4项/u);
  } finally {
    await new Promise((resolve) => narrativeRetryServer.close(resolve));
  }

  const proCalls = [];
  const proOverrideServer = createAppServer({
    databasePath: join(tempDir, "deepseek-plan-override.sqlite"),
    env: {
      DEEPSEEK_API_KEY: "env-deepseek-secret",
      DEEPSEEK_PLAN_MODEL: "Deepseek V4 pro",
      DEEPSEEK_PLAN_TIMEOUT_MS: "90000",
    },
    deepSeekPlanLlmClient: createMockPlanLlmClient(proCalls),
  });
  try {
    await new Promise((resolve) => proOverrideServer.listen(0, "127.0.0.1", resolve));
    const proRegistration = await fetch(`${serverUrl(proOverrideServer)}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "deepseek-plan-override@example.com",
        name: "DeepSeek Pro Override",
        password: "password123",
      }),
    });
    const proCookie = proRegistration.headers.get("set-cookie");
    const proResponse = await fetch(`${serverUrl(proOverrideServer)}/api/deepseek-plan`, {
      method: "POST",
      headers: jsonHeaders(proCookie),
      body: JSON.stringify({
        profile: { grade: "10年级", majorDirection: "AI教育" },
        activities: [],
      }),
    });
    assert.equal(proResponse.status, 200);
    assert.equal(proCalls.at(-1).model, "deepseek-v4-pro");
    assert.equal(proCalls.at(-1).timeoutMs, 90_000);
  } finally {
    await new Promise((resolve) => proOverrideServer.close(resolve));
  }

  const requestKeyOnlyCalls = [];
  const requestKeyOnlyServer = createAppServer({
    databasePath: join(tempDir, "request-key-only.sqlite"),
    env: {},
    deepSeekPlanLlmClient: createMockPlanLlmClient(requestKeyOnlyCalls),
  });
  try {
    await new Promise((resolve) => requestKeyOnlyServer.listen(0, "127.0.0.1", resolve));
    const registrationWithoutEnvKey = await fetch(`${serverUrl(requestKeyOnlyServer)}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "request-key-only@example.com",
        name: "Request Key Only",
        password: "password123",
      }),
    });
    const requestOnlyCookie = registrationWithoutEnvKey.headers.get("set-cookie");
    const requestKeyResponse = await fetch(`${serverUrl(requestKeyOnlyServer)}/api/deepseek-plan`, {
      method: "POST",
      headers: jsonHeaders(requestOnlyCookie),
      body: JSON.stringify({
        profile: { grade: "10年级" },
        activities: [],
        deepSeekApiKey: "request-secret-should-be-ignored",
      }),
    });
    assert.equal(requestKeyResponse.status, 400);
    assert.match((await requestKeyResponse.json()).error, /服务端配置 DEEPSEEK_API_KEY/);
    assert.equal(requestKeyOnlyCalls.length, 0);
  } finally {
    await new Promise((resolve) => requestKeyOnlyServer.close(resolve));
  }
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

function get(path, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    headers: cookie ? { Cookie: buildCookieHeader(cookie) } : {},
  });
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

function createMockPlanLlmClient(callLog, getContent = () => deepSeekAnswer) {
  return {
    async invoke(options) {
      const call = {
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
        messages: options.messages,
        signal: options.signal,
      };
      callLog.push(call);
      const content = getContent(callLog.length, options);
      if (content instanceof Error) throw content;
      return {
        content,
        model: options.model,
      };
    },
  };
}

function serverUrl(targetServer = server) {
  const { port } = targetServer.address();
  return `http://127.0.0.1:${port}`;
}
