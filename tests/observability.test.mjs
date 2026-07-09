import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { LangChainLlmError } from "../src/server/langchain-llm-client.mjs";
import { RAG_ANSWER_GRAPH_VERSION } from "../src/server/langgraph-rag-workflow.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-observability-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const logs = [];
let deepSeekMode = "failure";

const logger = {
  info(event) {
    logs.push(event);
  },
  warn(event) {
    logs.push(event);
  },
  error(event) {
    logs.push(event);
  },
};

const server = createAppServer({
  authDb,
  logger,
  env: {
    DEEPSEEK_API_KEY: "observability-secret",
    DATABASE_BACKUP_DIR: join(tempDir, "backups"),
  },
  deepSeekPlanLlmClient: {
    async invoke() {
      if (deepSeekMode === "failure") {
        throw new LangChainLlmError("DeepSeek unavailable", 503);
      }
      return {
        content: "### 输出列表（严格按表格填写）\n\n### 【活动叙事逻辑解读】\nObservability fallback.",
      };
    },
  },
  deepSeekRagLlmClient: {
    async invoke() {
      if (deepSeekMode === "failure") {
        throw new LangChainLlmError("DeepSeek unavailable", 503);
      }
      return {
        content: "Use the retrieved sources and avoid absolute admissions claims.",
        model: "deepseek-v4-pro",
      };
    },
  },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const healthResponse = await fetch(`${serverUrl()}/healthz`, {
    headers: { "X-Request-Id": "obs-request-123" },
  });
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get("x-request-id"), "obs-request-123");
  const health = await healthResponse.json();
  assert.equal(health.status, "ok");
  assert.equal(health.requestId, "obs-request-123");
  assert.ok(Number.isInteger(health.uptimeSeconds));

  const readinessResponse = await fetch(`${serverUrl()}/readyz`);
  assert.equal(readinessResponse.status, 200);
  const readiness = await readinessResponse.json();
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.database.ok, true);
  assert.ok(readiness.database.migrations.appliedCount >= 1);
  assert.deepEqual(readiness.database.migrations.pending, []);
  assert.deepEqual(readiness.database.migrations.unknown, []);

  const missingResponse = await fetch(`${serverUrl()}/not-found-for-observability`);
  assert.equal(missingResponse.status, 404);
  assert.ok(missingResponse.headers.get("x-request-id"));

  const adminRegistration = await post("/api/auth/register", {
    email: "observability-admin@example.com",
    name: "Observability Admin",
    password: "password123",
  });
  assert.equal(adminRegistration.status, 200);
  authDb.db
    .prepare("UPDATE users SET role = 'admin' WHERE email = ?")
    .run("observability-admin@example.com");
  const adminLogin = await post("/api/auth/login", {
    email: "observability-admin@example.com",
    password: "password123",
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie");

  const failedPlan = await post(
    "/api/deepseek-plan",
    {
      profile: { grade: "11", majorDirection: "Computer Science" },
      activities: [],
    },
    adminCookie,
  );
  assert.equal(failedPlan.status, 503);

  deepSeekMode = "success";
  const ragResponse = await post(
    "/api/deepseek-rag",
    { question: "How should this student compare MIT and robotics resources?" },
    adminCookie,
  );
  assert.equal(ragResponse.status, 200);
  const ragBody = await ragResponse.json();
  assert.ok(Number.isInteger(ragBody.retrieval.retrievalMs));

  const metricsResponse = await fetch(`${serverUrl()}/api/admin/ops/metrics`, {
    headers: { Cookie: buildCookieHeader(adminCookie) },
  });
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.json();
  assert.ok(metrics.http.totalRequests >= 5);
  assert.ok(metrics.http.byRoute["/healthz"] >= 1);
  assert.ok(metrics.http.byStatusClass["5xx"] >= 1);
  assert.equal(metrics.ai.totalCalls, 2);
  assert.equal(metrics.ai.failedCalls, 1);
  assert.equal(metrics.ai.byFeature["deepseek-plan"].failedCalls, 1);
  assert.equal(metrics.ai.byFeature["deepseek-rag"].totalCalls, 1);
  assert.equal(metrics.rag.retrievalCount, 1);
  assert.ok(metrics.rag.averageRetrievalMs >= 0);
  assert.equal(metrics.graph.totalRuns, 1);
  assert.equal(metrics.graph.failedRuns, 0);
  assert.equal(metrics.graph.reviewRequiredRuns, Number(Boolean(ragBody.quality.review.required)));
  assert.equal(metrics.graph.totalNodeCalls, 4);
  assert.equal(metrics.graph.failedNodeCalls, 0);
  assert.equal(metrics.graph.byWorkflow[RAG_ANSWER_GRAPH_VERSION].totalRuns, 1);
  assert.equal(metrics.graph.byWorkflow[RAG_ANSWER_GRAPH_VERSION].failedRuns, 0);
  assert.equal(
    metrics.graph.byWorkflow[RAG_ANSWER_GRAPH_VERSION].reviewRequiredRuns,
    Number(Boolean(ragBody.quality.review.required)),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(metrics.graph.byWorkflow[RAG_ANSWER_GRAPH_VERSION].byNode)
        .map(([node, value]) => [node, [value.totalCalls, value.failedCalls]]),
    ),
    {
      retrieveSources: [1, 0],
      draftAnswer: [1, 0],
      evaluateQuality: [1, 0],
      finalizeResponse: [1, 0],
    },
  );
  assert.equal(JSON.stringify(metrics.graph).includes("observability-secret"), false);
  assert.equal(
    JSON.stringify(metrics.graph).includes("How should this student compare MIT and robotics resources?"),
    false,
  );
  assert.equal(JSON.stringify(metrics.graph).includes("Use the retrieved sources"), false);
  assert.equal(metrics.backup.exists, false);
  assert.ok(metrics.alerts.some((alert) => alert.code === "backup_missing"));

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(
    logs.some((event) =>
      event.event === "http_request"
        && event.requestId === "obs-request-123"
        && event.path === "/healthz"
        && event.statusCode === 200),
  );
  assert.ok(
    logs.some((event) =>
      event.event === "http_request"
        && event.level === "error"
        && event.path === "/api/deepseek-plan"
        && event.statusCode === 503),
  );
  assert.equal(JSON.stringify(logs).includes("observability-secret"), false);
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

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
