import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-rate-limit-proxy-"));
const server = createAppServer({
  databasePath: join(tempDir, "auth.sqlite"),
  env: {},
  rateLimits: { "/api/auth/register": { maxRequests: 1, windowMs: 60_000 } },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/api/auth/register`;
  const send = (forwardedFor) => fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: "{}",
  });

  assert.equal((await send("203.0.113.1")).status, 400);
  assert.equal((await send("203.0.113.2")).status, 429);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
