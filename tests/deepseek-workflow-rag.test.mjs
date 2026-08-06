import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";
import { jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-workflow-rag-"));
const calls = [];
const portfolioMarker = `WorkflowPortfolioNeedle-${Date.now()}`;
const profileOnlyMarker = `WorkflowProfileOnlyNeedle-${Date.now()}`;
const historyOnlyMarker = `WorkflowHistoryOnlyNeedle-${Date.now()}`;

const server = createAppServer({
  databasePath: join(tempDir, "workflow-rag.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "workflow-rag-secret",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  },
  deepSeekRagLlmClient: createMockRagLlmClient(calls),
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const registration = await post("/api/auth/register", {
    email: `workflow-rag-${Date.now()}@example.com`,
    name: "Workflow RAG Student",
    password: "password123",
  });
  const cookie = registration.headers.get("set-cookie");

  await put(
    "/api/student-profile",
    {
      profile: {
        grade: "11",
        majorDirection: `Computer Science ${profileOnlyMarker}`,
        interests: `Robotics ${profileOnlyMarker}`,
      },
    },
    cookie,
  );

  await put(
    "/api/my-activities",
    {
      applicationPlan: {
        rea: [],
        ed1: [{ school: "MIT", major: `Computer Science ${portfolioMarker}` }],
        ed2: [],
        ea: [],
        uc: [],
        rd: [],
      },
      activities: [
        {
          activityName: `Robotics ${portfolioMarker}`,
          type: "research",
          timeStage: "11",
          role: "lead",
          description: `Unique workflow marker ${portfolioMarker}`,
          outcome: `Demo ${portfolioMarker}`,
          proofLink: `https://example.com/${portfolioMarker}`,
          status: "in progress",
        },
      ],
      competitions: [],
      summerSchools: [],
      recommendationLetters: {
        counselorStatus: `Ready ${portfolioMarker}`,
      },
      academicRecords: {
        gpaScale: "4.0",
        gpaRecords: [{ gradeLevel: "11", term: "Fall", gpa: "3.9" }],
        satTests: [{ totalScore: "1550", englishScore: "750", mathScore: "800", testDate: "2026-05" }],
        apExams: [{ courseName: "AP Computer Science A", score: "5", examYear: "2026" }],
      },
    },
    cookie,
  );

  const response = await post(
    "/api/deepseek-rag",
    {
      question:
        "Please read my application portfolio, activities, recommendation letters, GPA/SAT/AP and school plan, then provide an activity boost workflow.",
      historySummary: historyOnlyMarker,
      usePersonalContext: true,
    },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(
    body.sources[0]?.type,
    "application-portfolio",
    "Workflow-style prompts that ask to read the application portfolio should put that portfolio first.",
  );
  assert.ok(
    JSON.stringify(body.sources).includes(portfolioMarker),
    "The visible RAG sources should include saved application portfolio details.",
  );
  assert.ok(body.sources.every((source) => source.type === "application-portfolio"));
  assert.equal(body.retrieval.mode, "application-portfolio-only");
  assert.equal(body.retrieval.graph.selectedFacts, 0);

  const sentPayload = calls[0];
  const userPrompt = sentPayload.messages[1].content;
  assert.ok(
    userPrompt.includes(portfolioMarker),
    "The prompt sent to DeepSeek should include saved application portfolio details.",
  );
  assert.doesNotMatch(userPrompt, new RegExp(`${profileOnlyMarker}|${historyOnlyMarker}`, "u"));
  assert.doesNotMatch(userPrompt, /院校百科：|专业百科：|课外活动库：|知识图谱关系/u);
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

function put(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "PUT",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function createMockRagLlmClient(callLog) {
  return {
    async invoke(options) {
      callLog.push({
        model: options.model,
        temperature: options.temperature,
        messages: options.messages,
      });
      return {
        content: "ok",
        model: options.model,
      };
    },
  };
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
