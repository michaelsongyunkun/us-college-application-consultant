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
    DEEPSEEK_MODEL: "deepseek-v4-pro",
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
    { question: "How should this Robotics Portfolio student compare Polygence and MIT?" },
    cookie,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, ragAnswer);
  assert.equal(JSON.stringify(body).includes("env-rag-secret"), false);
  assert.ok(body.sources.some((source) => source.type === "student-backup"));
  assert.ok(body.sources.some((source) => source.type === "resource-library"));
  assert.ok(body.sources.some((source) => source.type === "school-encyclopedia"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer env-rag-secret");
  const sentPayload = JSON.parse(calls[0].options.body);
  assert.equal(sentPayload.model, "deepseek-v4-pro");
  assert.equal(sentPayload.stream, false);
  assert.equal(sentPayload.messages[0].role, "system");
  assert.equal(sentPayload.messages[1].role, "user");
  assert.match(sentPayload.messages[1].content, /学生备份/);
  assert.match(sentPayload.messages[1].content, /资源库/);
  assert.match(sentPayload.messages[1].content, /院校百科/);
  assert.match(sentPayload.messages[1].content, /Robotics Portfolio/);
  assert.match(sentPayload.messages[1].content, /Polygence/);
  assert.match(sentPayload.messages[1].content, /MIT/);
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

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
