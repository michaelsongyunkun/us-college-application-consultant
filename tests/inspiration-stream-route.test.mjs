import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-inspiration-stream-route-"));
const logs = [];
const server = createAppServer({
  databasePath: join(tempDir, "auth.sqlite"),
  env: {
    FASTIFY_HTTP_ENABLED: "false",
    DEEPSEEK_API_KEY: "configured-for-route-test",
  },
  logger: {
    info(event) { logs.push(event); },
    warn(event) { logs.push(event); },
    error(event) { logs.push(event); },
  },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/deepseek-rag/stream`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "X-Request-Id": "inspiration-stream-default-route",
    },
    body: JSON.stringify({ question: "What matters to me?", assistantProfile: "inspiration" }),
  });

  assert.equal(response.status, 401, "The stream route should exist even when the broader Fastify rollout is disabled");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(logs.some((event) =>
    event.event === "http_request"
      && event.requestId === "inspiration-stream-default-route"
      && event.httpLayer === "fastify"));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
