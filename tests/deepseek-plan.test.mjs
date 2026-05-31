import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-deepseek-plan-"));
const calls = [];
const deepSeekAnswer = `### 输出列表（严格按表格填写）
| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|------|------------------|----------------------|--------------------------------------|----------|
| 1 | 学术突破 | AI教育公益研究 | 问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生 | 10-11 |

### 【活动叙事逻辑解读】
以AI教育公益为Spike，形成技术能力与社区影响的闭环。`;

const server = createAppServer({
  databasePath: join(tempDir, "deepseek.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "env-deepseek-secret",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  },
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: deepSeekAnswer } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
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
  assert.equal(body.parsed.activities.length, 1);
  assert.equal(body.parsed.activities[0].activityName, "AI教育公益研究");
  assert.equal(JSON.stringify(body).includes("env-deepseek-secret"), false);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer env-deepseek-secret");

  const sentPayload = JSON.parse(calls[0].options.body);
  assert.equal(sentPayload.model, "deepseek-v4-pro");
  assert.equal(sentPayload.stream, false);
  assert.deepEqual(sentPayload.thinking, { type: "disabled" });
  assert.equal(sentPayload.messages[0].role, "system");
  assert.equal(sentPayload.messages[1].role, "user");
  assert.match(sentPayload.messages[1].content, /恰好15项/);
  assert.match(sentPayload.messages[1].content, /10年级/);

  const requestKeyOnlyServer = createAppServer({
    databasePath: join(tempDir, "request-key-only.sqlite"),
    env: {},
    deepSeekFetch: async () => {
      throw new Error("DeepSeek should not be called with a user-provided request key");
    },
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
      headers: { "Content-Type": "application/json", Cookie: requestOnlyCookie },
      body: JSON.stringify({
        profile: { grade: "10年级" },
        activities: [],
        deepSeekApiKey: "request-secret-should-be-ignored",
      }),
    });
    assert.equal(requestKeyResponse.status, 400);
    assert.match((await requestKeyResponse.json()).error, /服务端配置 DEEPSEEK_API_KEY/);
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
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(payload),
  });
}

function serverUrl(targetServer = server) {
  const { port } = targetServer.address();
  return `http://127.0.0.1:${port}`;
}
