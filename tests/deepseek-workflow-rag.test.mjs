import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-workflow-rag-"));
const calls = [];
const portfolioMarker = `WorkflowPortfolioNeedle-${Date.now()}`;

const server = createAppServer({
  databasePath: join(tempDir, "workflow-rag.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "workflow-rag-secret",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  },
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
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
        majorDirection: `Computer Science ${portfolioMarker}`,
        interests: `Robotics ${portfolioMarker}`,
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
      historySummary: "",
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

  const sentPayload = JSON.parse(calls[0].options.body);
  const userPrompt = sentPayload.messages[1].content;
  const contextStart = userPrompt.indexOf("检索到的资料片段");
  const retrievedContext = contextStart >= 0 ? userPrompt.slice(contextStart) : userPrompt;
  assert.ok(
    userPrompt.includes(portfolioMarker),
    "The prompt sent to DeepSeek should include saved application portfolio details.",
  );
  assert.ok(
    retrievedContext.indexOf(portfolioMarker) < retrievedContext.indexOf("资源库"),
    "Saved portfolio context should appear before external resource-library context for workflow prompts.",
  );
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

function jsonHeaders(cookie = "") {
  return {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
