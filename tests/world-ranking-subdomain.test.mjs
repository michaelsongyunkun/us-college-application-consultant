import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-world-ranking-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const server = createAppServer({ authDb });

function rankingHeaders() {
  return { "X-Forwarded-Host": "rankings.us-application-consultant.com" };
}

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const rankingHomeResponse = await fetch(`${baseUrl}/`, { headers: rankingHeaders() });
  assert.equal(rankingHomeResponse.status, 200);
  assert.match(rankingHomeResponse.headers.get("content-type") || "", /text\/html/);
  const rankingHomeHtml = await rankingHomeResponse.text();
  assert.ok(rankingHomeHtml.includes("我的世界大学排名"));
  assert.ok(!rankingHomeHtml.includes("authShell"), "Ranking subdomain should not serve the consultant login shell.");

  const rankingDataResponse = await fetch(`${baseUrl}/data/universities.js`, { headers: rankingHeaders() });
  assert.equal(rankingDataResponse.status, 200);
  assert.match(rankingDataResponse.headers.get("content-type") || "", /text\/javascript/);
  assert.ok((await rankingDataResponse.text()).includes("UNIVERSITY_RANKING_DATA"));

  const missingMainDataResponse = await fetch(`${baseUrl}/data/schools.md`, { headers: rankingHeaders() });
  assert.equal(missingMainDataResponse.status, 404);

  const mainDataResponse = await fetch(`${baseUrl}/data/universities.js`);
  assert.equal(mainDataResponse.status, 401, "Main domain data paths should keep the existing auth gate.");

  const rankingPostResponse = await fetch(`${baseUrl}/`, { method: "POST", headers: rankingHeaders() });
  assert.equal(rankingPostResponse.status, 405);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
