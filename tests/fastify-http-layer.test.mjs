import assert from "node:assert/strict";
import {
  FASTIFY_MIGRATED_ROUTES,
  createFastifyHttpLayer,
} from "../src/server/fastify-http-layer.ts";

let readiness = {
  status: "ready",
  database: {
    ok: true,
    migrations: { appliedCount: 3, pending: [], unknown: [] },
  },
};
let ragFailure = null;

const app = await createFastifyHttpLayer({
  auth: {
    getUserForSession(sessionToken) {
      return sessionToken === "valid-session" ? { id: 7, role: "user" } : null;
    },
    verifyCsrfToken(sessionToken, csrfToken) {
      return sessionToken === "valid-session" && csrfToken === "valid-csrf";
    },
  },
  env: { DEEPSEEK_API_KEY: "configured-for-test" },
  readinessCheck: async () => readiness,
  readPrompt: async () => "fixed admissions prompt",
  answerRag: async ({ user, question, assistantProfile, signal, onToken }) => {
    if (ragFailure) throw ragFailure;
    if (assistantProfile === "inspiration") {
      await onToken?.("First");
      await onToken?.(" reflection");
    }
    return {
      answer: `Answer for ${question}`,
      sources: [{ id: "source", type: "guide", typeLabel: "Guide", title: "Source" }],
      userId: user.id,
      signalProvided: Boolean(signal),
    };
  },
});

try {
  assert.deepEqual(FASTIFY_MIGRATED_ROUTES, [
    "GET /healthz",
    "HEAD /healthz",
    "GET /readyz",
    "HEAD /readyz",
    "GET /api/prompt",
    "POST /api/deepseek-rag/stream",
  ]);

  for (const schemaId of ["HealthResponse", "ReadinessResponse", "PromptResponse", "UnifiedError"]) {
    assert.ok(app.getSchema(schemaId), `Fastify should register ${schemaId}`);
  }

  const healthResponse = await app.inject({
    method: "GET",
    url: "/healthz",
    headers: { "x-request-id": "fastify-health-123" },
  });
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthResponse.headers["x-request-id"], "fastify-health-123");
  assert.equal(healthResponse.headers["x-content-type-options"], "nosniff");
  assert.equal(healthResponse.headers["x-frame-options"], "DENY");
  assert.equal(healthResponse.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(healthResponse.json().status, "ok");
  assert.equal(healthResponse.json().requestId, "fastify-health-123");
  assert.ok(Number.isInteger(healthResponse.json().uptimeSeconds));

  const healthHeadResponse = await app.inject({ method: "HEAD", url: "/healthz" });
  assert.equal(healthHeadResponse.statusCode, 200);
  assert.equal(healthHeadResponse.body, "");

  const readyResponse = await app.inject({ method: "GET", url: "/readyz" });
  assert.equal(readyResponse.statusCode, 200);
  assert.equal(readyResponse.json().status, "ready");
  assert.equal(readyResponse.json().database.ok, true);

  readiness = { status: "not_ready", database: { ok: false, error: "database unavailable" } };
  const notReadyResponse = await app.inject({ method: "GET", url: "/readyz" });
  assert.equal(notReadyResponse.statusCode, 503);
  assert.equal(notReadyResponse.json().status, "not_ready");

  const blockedPrompt = await app.inject({
    method: "GET",
    url: "/api/prompt",
    headers: { "x-request-id": "fastify-prompt-unauthenticated" },
  });
  assert.equal(blockedPrompt.statusCode, 401);
  assert.deepEqual(blockedPrompt.json(), {
    error: "Not authenticated",
    code: "AUTH",
    requestId: "fastify-prompt-unauthenticated",
    retryable: false,
  });

  const promptResponse = await app.inject({
    method: "GET",
    url: "/api/prompt",
    headers: {
      cookie: "consultant_session=valid-session",
      "x-request-id": "fastify-prompt-authenticated",
    },
  });
  assert.equal(promptResponse.statusCode, 200);
  assert.deepEqual(promptResponse.json(), {
    prompt: "fixed admissions prompt",
    hasDeepSeekApiKey: true,
  });

  const blockedStream = await app.inject({
    method: "POST",
    url: "/api/deepseek-rag/stream",
    headers: { cookie: "consultant_session=valid-session" },
    payload: { question: "computer science" },
  });
  assert.equal(blockedStream.statusCode, 403);

  const streamResponse = await app.inject({
    method: "POST",
    url: "/api/deepseek-rag/stream",
    headers: {
      cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf",
      "x-csrf-token": "valid-csrf",
    },
    payload: { question: "computer science" },
  });
  assert.equal(streamResponse.statusCode, 200);
  assert.match(streamResponse.headers["content-type"], /^text\/event-stream/u);
  assert.match(streamResponse.body, /event: status/u);
  assert.match(streamResponse.body, /event: result/u);
  assert.match(streamResponse.body, /Answer for computer science/u);
  assert.match(streamResponse.body, /event: done/u);

  const inspirationStreamResponse = await app.inject({
    method: "POST",
    url: "/api/deepseek-rag/stream",
    headers: {
      cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf",
      "x-csrf-token": "valid-csrf",
    },
    payload: { question: "What matters to me?", assistantProfile: "inspiration" },
  });
  assert.equal(inspirationStreamResponse.statusCode, 200);
  assert.match(inspirationStreamResponse.body, /conversation_started/u);
  assert.match(inspirationStreamResponse.body, /event: delta/u);
  assert.match(inspirationStreamResponse.body, /First/u);
  assert.match(inspirationStreamResponse.body, /reflection/u);
  assert.doesNotMatch(inspirationStreamResponse.body, /retrieval_started/u);

  ragFailure = new Error("postgresql://user:super-secret@db/internal");
  const failedStreamResponse = await app.inject({
    method: "POST",
    url: "/api/deepseek-rag/stream",
    headers: {
      cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf",
      "x-csrf-token": "valid-csrf",
    },
    payload: { question: "trigger internal failure" },
  });
  assert.equal(failedStreamResponse.statusCode, 200);
  assert.match(failedStreamResponse.body, /RAG request failed/u);
  assert.doesNotMatch(failedStreamResponse.body, /super-secret|postgresql:\/\//u);

  const failedInspirationStreamResponse = await app.inject({
    method: "POST",
    url: "/api/deepseek-rag/stream",
    headers: {
      cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf",
      "x-csrf-token": "valid-csrf",
    },
    payload: { question: "trigger inspiration failure", assistantProfile: "inspiration" },
  });
  assert.match(failedInspirationStreamResponse.body, /Inspiration conversation failed/u);
  assert.doesNotMatch(failedInspirationStreamResponse.body, /RAG request failed|RAG_ERROR/u);
} finally {
  await app.close();
}
