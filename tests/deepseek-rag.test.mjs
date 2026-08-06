import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { AI_QUALITY_VERSIONS } from "../src/server/ai-quality.mjs";
import { createGenerationJobService } from "../src/server/generation-job-service.mjs";
import { RAG_ANSWER_GRAPH_VERSION } from "../src/server/langgraph-rag-workflow.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-rag-"));
const calls = [];
const queuedRagPayloads = [];
const localRagJobs = createGenerationJobService();
const deepSeekRagJobs = {
  create(user, task, descriptor) {
    queuedRagPayloads.push(descriptor.payload);
    return localRagJobs.create(user, task);
  },
  get: (...args) => localRagJobs.get(...args),
  cancel: (...args) => localRagJobs.cancel(...args),
};
const ragAnswer = "根据当前规划与资料库，Polygence 可以作为 Robotics Portfolio 的科研补充；MIT 需要强调 STEM 深度。";

const server = createAppServer({
  databasePath: join(tempDir, "deepseek-rag.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "env-rag-secret",
    DEEPSEEK_MODEL: "Deepseek V4 pro",
    INSPIRATION_API_KEY: "env-inspiration-secret",
    INSPIRATION_BASE_URL: "https://ark.example/api/v3/",
    INSPIRATION_MODEL: "doubao-seed-2-1-turbo-test",
    INSPIRATION_MAX_TOKENS: "480",
  },
  deepSeekRagLlmClient: createMockRagLlmClient(calls),
  jobServices: { deepSeekRag: deepSeekRagJobs },
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
  assert.match(await askPage.text(), /申请机器人/);

  await put(
    "/api/student-profile",
    {
      profile: {
        grade: "10",
        majorDirection: "Computer Science",
        interests: "Robotics Portfolio PROFILE_ONLY_SECRET",
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
        narrative: "Robotics Portfolio should connect engineering research with community impact. PLAN_ONLY_SECRET",
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
      historySummary: "上一轮已经确认学生主线是 Robotics Portfolio 与 CS。HISTORY_ONLY_SECRET",
      assistantProfile: "untrusted-profile",
      usePersonalContext: true,
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, ragAnswer);
  assert.equal(JSON.stringify(body).includes("env-rag-secret"), false);
  assert.ok(body.sources.length > 0);
  assert.ok(body.sources.every((source) => source.type === "application-portfolio"));
  assert.ok(body.sources.some((source) => source.typeLabel === "个人上下文"));
  assert.ok(body.sources.every((source) => source.scope === "personal"));
  assert.equal(body.retrieval.intent, "school");
  assert.equal(body.retrieval.mode, "application-portfolio-only");
  assert.equal(body.retrieval.dataScope, "current-user-application-portfolio");
  assert.equal(body.retrieval.graph.status, "disabled-by-data-scope");
  assert.equal(body.retrieval.graph.selectedFacts, 0);
  assert.deepEqual(body.retrieval.sourceWeights, { "application-portfolio": 1 });
  assert.equal(body.quality.schemaVersion, AI_QUALITY_VERSIONS.schema);
  assert.equal(body.quality.metadata.feature, "deepseek-rag");
  assert.equal(body.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.ragPromptDefault);
  assert.equal(body.quality.metadata.model, "deepseek-v4-pro");
  assert.equal(body.quality.metadata.sourceSetVersion, AI_QUALITY_VERSIONS.ragSourceSet);
  assert.equal(body.quality.metadata.parserVersion, AI_QUALITY_VERSIONS.ragParser);
  assert.equal(body.quality.metadata.workflowVersion, RAG_ANSWER_GRAPH_VERSION);
  assert.equal(body.quality.retrieval.retrievalHitRate, 1);
  assert.deepEqual(body.quality.retrieval.missingSourceTypes, []);
  assert.equal(body.quality.review.required, false);
  assert.ok(body.quality.citations.every((citation) => citation.sourceType === "application-portfolio"));
  assert.ok(body.quality.citations.every((citation) => citation.sourceId && citation.sourceTitle));
  assert.match(body.retrieval.intentReason, /MIT|院校|school/i);
  assert.ok(Array.isArray(body.missingFields), "Ask DeepSeek should return missing-field guidance.");
  assert.ok(body.missingFields.includes("推荐信准备"), "Missing fields should flag empty recommendation letter data.");
  assert.equal(calls.length, 1);
  const sentPayload = calls[0];
  assert.equal(sentPayload.model, "deepseek-v4-pro");
  assert.equal(sentPayload.temperature, 0.25);
  assert.equal(sentPayload.timeoutMs, 90_000);
  assert.equal(sentPayload.maxAttempts, 1);
  assert.equal(sentPayload.messages[0].role, "system");
  assert.equal(sentPayload.messages[1].role, "user");
  const systemPrompt = sentPayload.messages[0].content;
  assert.match(systemPrompt, /“申请机器人”/);
  assert.match(systemPrompt, /唯一允许使用的持久化资料/);
  assert.match(systemPrompt, /严禁读取、引用或推断学生当前画像/);
  assert.match(systemPrompt, /当前资料不足以判断/);
  assert.match(systemPrompt, /不要做绝对化承诺/);
  assert.match(systemPrompt, /保证录取/);
  assert.match(systemPrompt, /Markdown 的标题、列表、表格、加粗/);
  assert.match(systemPrompt, /700/);
  assert.match(systemPrompt, /不要在回答正文中单独输出“参考资料”章节/);
  assert.match(systemPrompt, /前端只会展示本次使用的申请档案片段/);
  assert.doesNotMatch(systemPrompt, /每次回答结尾必须给出“参考资料”/);
  const userPrompt = sentPayload.messages[1].content;
  assert.match(userPrompt, /只(?:能|会)使用.*“我的申请档案”/u);
  assert.match(userPrompt, /当前登录用户的“我的申请档案”片段/);
  assert.doesNotMatch(userPrompt, /PROFILE_ONLY_SECRET|PLAN_ONLY_SECRET|HISTORY_ONLY_SECRET/u);
  assert.doesNotMatch(userPrompt, /对话记忆摘要/u);
  assert.match(sentPayload.messages[1].content, /不得使用对话记忆、学生画像、申请规划、历史快照、资源库、院校百科、专业百科、知识图谱/);
  assert.doesNotMatch(sentPayload.messages[1].content, /问题意图：school|检索权重/u);
  assert.match(sentPayload.messages[1].content, /Robotics Portfolio/);
  assert.match(sentPayload.messages[1].content, /FRC\/FTC 机器人队/);
  assert.match(sentPayload.messages[1].content, /Prototype assistive navigation robot/);
  assert.match(sentPayload.messages[1].content, /Demo and technical writeup/);
  assert.match(sentPayload.messages[1].content, /https:\/\/example\.com\/robotics/);
  assert.match(sentPayload.messages[1].content, /Polygence/);
  assert.match(sentPayload.messages[1].content, /MIT/);

  const inspirationResponse = await post(
    "/api/deepseek-rag",
    {
      question: "我不知道自己是真喜欢机器人，还是只是觉得它对申请有帮助。",
      assistantProfile: "inspiration",
    },
    cookie,
  );
  assert.equal(inspirationResponse.status, 200);
  const inspirationBody = await inspirationResponse.json();
  assert.deepEqual(Object.keys(inspirationBody), ["answer"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].feature, "deepseek-inspiration");
  assert.equal(calls[1].apiKey, "env-inspiration-secret");
  assert.equal(calls[1].baseURL, "https://ark.example/api/v3/");
  assert.equal(calls[1].model, "doubao-seed-2-1-turbo-test");
  assert.equal(calls[1].disableThinking, true);
  assert.equal(calls[1].maxTokens, 480);
  assert.equal(calls[1].timeoutMs, 60_000);
  assert.equal(calls[1].maxAttempts, 1);
  const inspirationSystemPrompt = calls[1].messages[0].content;
  assert.match(inspirationSystemPrompt, /“启发性机器人”/);
  assert.match(inspirationSystemPrompt, /知心大姐姐式学生探索伙伴/);
  assert.match(inspirationSystemPrompt, /历史对话事实依据/);
  assert.match(inspirationSystemPrompt, /待验证的可能性/);
  assert.match(inspirationSystemPrompt, /每轮只提出一个关键问题/);
  assert.match(inspirationSystemPrompt, /必须得到学生明确确认或修正/);
  assert.match(inspirationSystemPrompt, /不是为了包装申请履历/);
  assert.match(inspirationSystemPrompt, /对话—行动—反思/);
  assert.match(inspirationSystemPrompt, /不做心理诊断/);
  assert.doesNotMatch(inspirationSystemPrompt, /推荐专业优先级表/);
  assert.doesNotMatch(inspirationSystemPrompt, /RAG|检索来源/);
  assert.match(inspirationSystemPrompt, /不要假设你读取过学生档案、申请资料、外部知识库/);
  assert.match(inspirationSystemPrompt, /300/);
  const inspirationUserPrompt = calls[1].messages[1].content;
  assert.match(inspirationUserPrompt, /用户此刻想聊的内容/);
  assert.match(inspirationUserPrompt, /当前对话记忆摘要/);
  assert.doesNotMatch(inspirationUserPrompt, /RAG|检索|档案|资料片段|缺失字段|Robotics Portfolio|Polygence|MIT/);

  const majorMatchResponse = await post(
    "/api/deepseek-rag",
    {
      question: "请根据我的申请档案自动匹配适合探索的美国本科专业。",
      assistantProfile: "major-match",
    },
    cookie,
  );
  assert.equal(majorMatchResponse.status, 200);
  const majorMatchBody = await majorMatchResponse.json();
  assert.equal(majorMatchBody.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.ragPromptMajorMatch);
  assert.equal(majorMatchBody.retrieval.mode, "graph-rag");
  assert.equal(majorMatchBody.retrieval.queryPlan.taskType, "major-match");
  assert.ok(majorMatchBody.retrieval.graph.selectedFacts > 0);
  assert.ok(majorMatchBody.sources.some((source) => source.type === "application-portfolio"));
  assert.equal(majorMatchBody.quality.retrieval.retrievalHitRate, 1);
  assert.equal(majorMatchBody.quality.review.fallback.triggered, false);
  assert.equal(majorMatchBody.quality.status, "pass");
  assert.equal(majorMatchBody.quality.metadata.requestedModel, "deepseek-v4-pro");
  assert.equal(majorMatchBody.quality.metadata.selectedModel, "deepseek-v4-flash");
  assert.equal(majorMatchBody.quality.metadata.modelFallbackTriggered, true);
  assert.equal(calls.length, 3);
  const majorMatchPayload = calls[2];
  assert.equal(majorMatchPayload.timeoutMs, 90_000);
  assert.equal(majorMatchPayload.maxAttempts, 1);
  const majorMatchSystemPrompt = majorMatchPayload.messages[0].content;
  assert.match(majorMatchPayload.messages[1].content, /graph_traversal.*document_retrieval.*evidence_synthesis/);
  assert.match(majorMatchSystemPrompt, /美本本科专业匹配顾问/);
  assert.match(majorMatchSystemPrompt, /推荐专业优先级表/);
  assert.match(majorMatchSystemPrompt, /专业方向｜优先级｜匹配理由｜需要补强的证据｜申请叙事切入点/);
  assert.match(majorMatchSystemPrompt, /不要输出资料来源清单、来源编号、文献列表、英文搜索词、英文 query 或任何“检索口径”类栏目/);
  assert.match(majorMatchSystemPrompt, /信息不足时，不要直接停止判断/);
  assert.match(majorMatchSystemPrompt, /只要活动、竞赛、夏校、AP 课程中任一类有信息/);
  assert.match(majorMatchSystemPrompt, /不得提示“信息不足”或“档案信息缺口”/);
  assert.match(majorMatchSystemPrompt, /只有活动、竞赛、夏校、AP 课程四类全部为空/);
  assert.doesNotMatch(majorMatchSystemPrompt, /如果信息不足，请先输出“档案信息缺口”，再给出暂定匹配建议/);
  assert.doesNotMatch(majorMatchSystemPrompt, /“申请机器人”/);
  const ragJobResponse = await post(
    "/api/deepseek-rag-jobs",
    {
      question: "How should this Robotics Portfolio student prioritize MIT preparation?",
      historySummary: "Robotics Portfolio context.",
      usePersonalContext: true,
    },
    cookie,
  );
  assert.equal(ragJobResponse.status, 202);
  const createdRagJob = await ragJobResponse.json();
  assert.equal(queuedRagPayloads.length, 1);
  assert.equal(queuedRagPayloads[0].usePersonalContext, true);
  assert.equal(Object.hasOwn(queuedRagPayloads[0], "profile"), false);
  assert.equal(Object.hasOwn(queuedRagPayloads[0], "currentPlan"), false);
  assert.equal(Object.hasOwn(queuedRagPayloads[0], "historySummary"), false);
  assert.ok(Array.isArray(queuedRagPayloads[0].portfolio.activities));
  assert.equal(Object.hasOwn(queuedRagPayloads[0], "backups"), false);
  assert.match(createdRagJob.jobId, /^[a-f0-9-]{36}$/);
  assert.equal(createdRagJob.status, "pending");
  const completedRagJob = await waitForJob("/api/deepseek-rag-jobs", createdRagJob.jobId, cookie);
  assert.equal(completedRagJob.status, "completed");
  assert.equal(completedRagJob.result.answer, ragAnswer);
  assert.ok(completedRagJob.result.sources.every((source) => source.type === "application-portfolio"));
  assert.equal(completedRagJob.result.quality.metadata.promptVersion, AI_QUALITY_VERSIONS.ragPromptDefault);

  const inspirationStreamResponse = await post(
    "/api/deepseek-rag/stream",
    { question: "帮我从这段经历继续想下去。", assistantProfile: "inspiration" },
    cookie,
  );
  assert.equal(inspirationStreamResponse.status, 200);
  const inspirationStreamBody = await inspirationStreamResponse.text();
  assert.match(inspirationStreamBody, /event: delta/u);
  assert.match(inspirationStreamBody, /第一段/u);
  assert.match(inspirationStreamBody, /第二段/u);
  assert.match(inspirationStreamBody, /event: result/u);
  assert.match(inspirationStreamBody, /event: done/u);
} finally {
  await new Promise((resolve) => server.close(resolve));
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

function createMockRagLlmClient(callLog, getContent = () => ragAnswer) {
  return {
    async invoke(options) {
      callLog.push({
        feature: options.feature,
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model,
        temperature: options.temperature,
        disableThinking: options.disableThinking,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
        messages: options.messages,
        signal: options.signal,
      });
      const content = getContent(callLog.length, options);
      if (content instanceof Error) throw content;
      if (typeof options.onToken === "function") {
        await options.onToken("第一段");
        await options.onToken("，第二段");
      }
      return {
        content,
        model: callLog.length === 3 ? "deepseek-v4-flash" : options.model,
      };
    },
  };
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
