import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { buildCookieHeader } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-fastify-parity-"));
const legacyServer = createAppServer({
  databasePath: join(tempDir, "legacy.sqlite"),
  env: { DEEPSEEK_API_KEY: "parity-key", FASTIFY_HTTP_ENABLED: "false" },
});
const fastifyServer = createAppServer({
  databasePath: join(tempDir, "fastify.sqlite"),
  env: {
    DEEPSEEK_API_KEY: "parity-key",
    FASTIFY_HTTP_ENABLED: "true",
    FASTIFY_HTTP_TRAFFIC_PERCENT: "100",
  },
});

try {
  await Promise.all([listen(legacyServer), listen(fastifyServer)]);

  const [legacyHealth, fastifyHealth] = await Promise.all([
    request(legacyServer, "/healthz", { headers: { "X-Request-Id": "parity-health" } }),
    request(fastifyServer, "/healthz", { headers: { "X-Request-Id": "parity-health" } }),
  ]);
  assertParity(legacyHealth, fastifyHealth, { omitBodyFields: ["timestamp", "uptimeSeconds"] });

  const [legacyReady, fastifyReady] = await Promise.all([
    request(legacyServer, "/readyz", { headers: { "X-Request-Id": "parity-ready" } }),
    request(fastifyServer, "/readyz", { headers: { "X-Request-Id": "parity-ready" } }),
  ]);
  assertParity(legacyReady, fastifyReady);

  const [legacyBlockedPrompt, fastifyBlockedPrompt] = await Promise.all([
    request(legacyServer, "/api/prompt", { headers: { "X-Request-Id": "parity-prompt" } }),
    request(fastifyServer, "/api/prompt", { headers: { "X-Request-Id": "parity-prompt" } }),
  ]);
  assertParity(legacyBlockedPrompt, fastifyBlockedPrompt);

  const [legacyCookie, fastifyCookie] = await Promise.all([
    register(legacyServer, "legacy-parity@example.com"),
    register(fastifyServer, "fastify-parity@example.com"),
  ]);
  const [legacyPrompt, fastifyPrompt] = await Promise.all([
    request(legacyServer, "/api/prompt", { headers: { Cookie: buildCookieHeader(legacyCookie), "X-Request-Id": "parity-auth-prompt" } }),
    request(fastifyServer, "/api/prompt", { headers: { Cookie: buildCookieHeader(fastifyCookie), "X-Request-Id": "parity-auth-prompt" } }),
  ]);
  assertParity(legacyPrompt, fastifyPrompt, { omitBodyFields: [] });
} finally {
  await close(legacyServer);
  await close(fastifyServer);
  await rm(tempDir, { recursive: true, force: true });
}

async function request(server, path, init = {}) {
  const response = await fetch(`${serverUrl(server)}${path}`, init);
  return {
    status: response.status,
    headers: Object.fromEntries([
      "content-type",
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy",
      "permissions-policy",
      "x-request-id",
    ].map((name) => [name, response.headers.get(name)])),
    body: await response.json(),
  };
}

async function register(server, email) {
  const response = await fetch(`${serverUrl(server)}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Parity User", password: "password123" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie");
}

function assertParity(legacy, candidate, { omitBodyFields = [] } = {}) {
  assert.equal(candidate.status, legacy.status);
  for (const header of [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-request-id",
  ]) assert.equal(candidate.headers[header], legacy.headers[header], `Header mismatch: ${header}`);
  assert.equal(
    candidate.headers["content-type"]?.split(";")[0],
    legacy.headers["content-type"]?.split(";")[0],
    "Content media type mismatch",
  );

  const normalize = (body) => Object.fromEntries(
    Object.entries(body).filter(([key]) => !omitBodyFields.includes(key)),
  );
  assert.deepEqual(normalize(candidate.body), normalize(legacy.body));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function serverUrl(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening");
  return `http://127.0.0.1:${address.port}`;
}
