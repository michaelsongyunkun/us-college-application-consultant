import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-rag-"));
const calls = [];
const ragAnswer = "根据学生备份与资料库，Polygence 可以作为 Robotics Portfolio 的科研补充；MIT 需要强调 STEM 深度。";

const server = createAppServer({
  databasePath: join(tempDir, "deepseek-rag.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "env-rag-secret",
    DEEPSEEK_MODEL: "Deepseek V4 pro",
  },
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: ragAnswer } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const blockedApi = await fetch(`${serverUrl()}/api/deepseek-rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "MIT" }),
  });
  assert.equal(blockedApi.status, 401);

  const blockedPage = await fetch(`${serverUrl()}/ask-deepseek.html`, { redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/?next=%2Fask-deepseek.html");

  const registration = await post("/api/auth/register", {
    email: "rag@example.com",
    name: "RAG Student",
    password: "password123",
  });
  const cookie = registration.headers.get("set-cookie");

  const askPage = await get("/ask-deepseek.html", cookie);
  assert.equal(askPage.status, 200);
  assert.match(await askPage.text(), /问DeepSeek/);

  await put(
    "/api/student-profile",
    {
      profile: {
        grade: "10",
        majorDirection: "Computer Science",
        interests: "Robotics Portfolio",
      },
    },
    cookie,
  );
  const plansResponse = await get("/api/plans", cookie);
  const planId = (await plansResponse.json()).plans[0].id;
  await put(
    `/api/plans/${planId}`,
    {
      draft: {
        narrative: "Robotics Portfolio should connect engineering research with community impact.",
        activities: [
          {
            type: "research",
            activityName: "Robotics Portfolio Lab",
            executionDescription: "Build a robot vision demo for assistive navigation.",
            suggestedGrade: "10-11",
          },
        ],
      },
    },
    cookie,
  );
  await post(`/api/plans/${planId}/snapshots`, { note: "Robotics backup" }, cookie);
  await put(
    "/api/my-activities",
    {
      applicationPlan: {
        rea: [],
        ed1: [{ school: "MIT", major: "Computer Science" }],
        ed2: [],
        ea: [],
        uc: [],
        rd: [],
      },
      activities: [
        {
          activityName: "Robotics Portfolio Lab",
          type: "research",
          timeStage: "10",
          role: "lead",
          description: "Prototype assistive navigation robot.",
          outcome: "Demo and technical writeup",
          proofLink: "https://example.com/robotics",
          status: "in progress",
        },
      ],
      competitions: [],
      summerSchools: [],
      recommendationLetters: {},
      academicRecords: {
        gpaScale: "",
        gpaRecords: [],
        satTests: [],
        apExams: [],
      },
    },
    cookie,
  );

  const response = await post(
    "/api/deepseek-rag",
    {
      question: "How should this Robotics Portfolio student use FRC/FTC 机器人队 as a Common App activity while comparing Polygence and MIT?",
      historySummary: "上一轮已经确认学生主线是 Robotics Portfolio 与 CS。",
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, ragAnswer);
  assert.equal(JSON.stringify(body).includes("env-rag-secret"), false);
  assert.ok(body.sources.some((source) => source.type === "application-portfolio"));
  assert.ok(body.sources.some((source) => source.typeLabel === "个人申请档案"));
  assert.ok(body.sources.some((source) => source.type === "student-backup"));
  assert.ok(body.sources.some((source) => source.type === "resource-library"));
  assert.ok(body.sources.some((source) => source.title.includes("课外活动库")));
  assert.ok(body.sources.some((source) => source.type === "school-encyclopedia"));
  assert.ok(body.sources.some((source) => source.type === "major-encyclopedia"));
  assert.ok(body.sources.some((source) => source.typeLabel === "专业百科"));
  assert.equal(body.retrieval.intent, "school");
  assert.ok(
    body.retrieval.sourceWeights["school-encyclopedia"] > body.retrieval.sourceWeights["resource-library"],
    "School questions should weight school encyclopedia above general resources.",
  );
  assert.match(body.retrieval.intentReason, /MIT|院校|school/i);
  assert.ok(Array.isArray(body.missingFields), "Ask DeepSeek should return missing-field guidance.");
  assert.ok(body.missingFields.includes("推荐信准备"), "Missing fields should flag empty recommendation letter data.");
  const activitySource = body.sources.find((source) => source.title.includes("课外活动库"));
  assert.match(activitySource.snippet, /^###/m);
  assert.match(activitySource.snippet, /\n-\s+\*\*活动内容\*\*/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer env-rag-secret");
  const sentPayload = JSON.parse(calls[0].options.body);
  assert.equal(sentPayload.model, "deepseek-v4-pro");
  assert.equal(sentPayload.stream, false);
  assert.equal(sentPayload.messages[0].role, "system");
  assert.equal(sentPayload.messages[1].role, "user");
  const systemPrompt = sentPayload.messages[0].content;
  assert.match(systemPrompt, /问DeepSeek”申请规划智能体/);
  assert.match(systemPrompt, /个人申请档案：选校计划、课外活动、竞赛、夏校、推荐信、课程成绩\/SAT\/AP/);
  assert.match(systemPrompt, /当前资料不足以判断/);
  assert.match(systemPrompt, /不要做绝对化承诺/);
  assert.match(systemPrompt, /保证录取/);
  assert.match(systemPrompt, /Markdown 的标题、列表、表格、加粗/);
  assert.match(systemPrompt, /不要在回答正文中单独输出“参考资料”章节/);
  assert.match(systemPrompt, /前端会在折叠的“参考资料”区域展示/);
  assert.doesNotMatch(systemPrompt, /每次回答结尾必须给出“参考资料”/);
  const userPrompt = sentPayload.messages[1].content;
  assert.match(userPrompt, /不要在正文末尾列出参考资料/);
  assert.doesNotMatch(userPrompt, /回答末尾用“参考资料”列出/);
  assert.match(sentPayload.messages[1].content, /学生备份/);
  assert.match(sentPayload.messages[1].content, /对话记忆摘要/);
  assert.match(sentPayload.messages[1].content, /Robotics Portfolio 与 CS/);
  assert.match(sentPayload.messages[1].content, /个人申请档案/);
  assert.match(sentPayload.messages[1].content, /资源库/);
  assert.match(sentPayload.messages[1].content, /课外活动库/);
  assert.match(sentPayload.messages[1].content, /院校百科/);
  assert.match(sentPayload.messages[1].content, /专业百科/);
  assert.match(sentPayload.messages[1].content, /问题意图：school/);
  assert.match(sentPayload.messages[1].content, /检索权重/);
  assert.match(sentPayload.messages[1].content, /Robotics Portfolio/);
  assert.match(sentPayload.messages[1].content, /FRC\/FTC 机器人队/);
  assert.match(sentPayload.messages[1].content, /Prototype assistive navigation robot/);
  assert.match(sentPayload.messages[1].content, /Demo and technical writeup/);
  assert.match(sentPayload.messages[1].content, /https:\/\/example\.com\/robotics/);
  assert.match(sentPayload.messages[1].content, /Polygence/);
  assert.match(sentPayload.messages[1].content, /MIT/);

  const majorMatchResponse = await post(
    "/api/deepseek-rag",
    {
      question: "请根据我的申请档案自动匹配适合探索的美国本科专业。",
      assistantProfile: "major-match",
    },
    cookie,
  );
  assert.equal(majorMatchResponse.status, 200);
  assert.equal(calls.length, 2);
  const majorMatchPayload = JSON.parse(calls[1].options.body);
  const majorMatchSystemPrompt = majorMatchPayload.messages[0].content;
  assert.match(majorMatchSystemPrompt, /美本本科专业匹配顾问/);
  assert.match(majorMatchSystemPrompt, /推荐专业优先级表/);
  assert.match(majorMatchSystemPrompt, /专业方向｜优先级｜匹配理由｜需要补强的证据｜申请叙事切入点/);
  assert.match(majorMatchSystemPrompt, /不要输出资料来源清单、来源编号、文献列表、英文搜索词、英文 query 或任何“检索口径”类栏目/);
  assert.match(majorMatchSystemPrompt, /信息不足时，不要直接停止判断/);
  assert.match(majorMatchSystemPrompt, /只要活动、竞赛、夏校、AP 课程中任一类有信息/);
  assert.match(majorMatchSystemPrompt, /不得提示“信息不足”或“档案信息缺口”/);
  assert.match(majorMatchSystemPrompt, /只有活动、竞赛、夏校、AP 课程四类全部为空/);
  assert.doesNotMatch(majorMatchSystemPrompt, /如果信息不足，请先输出“档案信息缺口”，再给出暂定匹配建议/);
  assert.doesNotMatch(majorMatchSystemPrompt, /问DeepSeek”申请规划智能体/);
  const ragJobResponse = await post(
    "/api/deepseek-rag-jobs",
    {
      question: "How should this Robotics Portfolio student prioritize MIT preparation?",
      historySummary: "Robotics Portfolio context.",
    },
    cookie,
  );
  assert.equal(ragJobResponse.status, 202);
  const createdRagJob = await ragJobResponse.json();
  assert.match(createdRagJob.jobId, /^[a-f0-9-]{36}$/);
  assert.equal(createdRagJob.status, "pending");
  const completedRagJob = await waitForJob("/api/deepseek-rag-jobs", createdRagJob.jobId, cookie);
  assert.equal(completedRagJob.status, "completed");
  assert.equal(completedRagJob.result.answer, ragAnswer);
  assert.ok(completedRagJob.result.sources.some((source) => source.type === "student-backup"));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function get(path, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
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

function jsonHeaders(cookie = "") {
  return {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };
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

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
