import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { buildCookieHeader } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-fastify-strangler-"));
const logs = [];
const logger = {
  info(event) { logs.push(event); },
  warn(event) { logs.push(event); },
  error(event) { logs.push(event); },
};
const server = createAppServer({
  databasePath: join(tempDir, "auth.sqlite"),
  env: {
    FASTIFY_HTTP_ENABLED: "true",
    FASTIFY_HTTP_TRAFFIC_PERCENT: "100",
    DEEPSEEK_API_KEY: "configured-for-fastify-test",
  },
  logger,
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const healthResponse = await fetch(`${serverUrl()}/healthz`, {
    headers: { "X-Request-Id": "fastify-live-health" },
  });
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers.get("x-request-id"), "fastify-live-health");

  const registrationResponse = await fetch(`${serverUrl()}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "fastify-strangler@example.com",
      name: "Fastify Strangler",
      password: "password123",
    }),
  });
  assert.equal(registrationResponse.status, 200, "Legacy auth fallback must retain its request body");
  const cookie = registrationResponse.headers.get("set-cookie");

  const promptResponse = await fetch(`${serverUrl()}/api/prompt`, {
    headers: {
      Cookie: buildCookieHeader(cookie),
      "X-Request-Id": "fastify-live-prompt",
    },
  });
  assert.equal(promptResponse.status, 200);
  assert.equal((await promptResponse.json()).hasDeepSeekApiKey, true);

  const staticFallbackResponse = await fetch(`${serverUrl()}/favicon.svg`);
  assert.equal(staticFallbackResponse.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(logs.some((event) =>
    event.event === "http_request"
      && event.requestId === "fastify-live-health"
      && event.httpLayer === "fastify"));
  assert.ok(logs.some((event) =>
    event.event === "http_request"
      && event.path === "/api/auth/register"
      && event.httpLayer === "native"));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function serverUrl() {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening");
  return `http://127.0.0.1:${address.port}`;
}
