import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveAppBaseUrl, resolveDatabasePath, shouldUseSecureCookies } from "../server.mjs";

assert.equal(resolveDatabasePath({ AUTH_DATABASE_PATH: "/var/data/auth.sqlite" }), "/var/data/auth.sqlite");
assert.equal(resolveDatabasePath({ DATABASE_PATH: "/tmp/auth.sqlite" }), "/tmp/auth.sqlite");
assert.equal(
  resolveDatabasePath({
    AUTH_DATABASE_PATH: "/var/data/auth.sqlite",
    DATABASE_PATH: "/tmp/auth.sqlite",
  }),
  "/var/data/auth.sqlite",
);
assert.ok(resolveDatabasePath({}).endsWith("data\\auth.sqlite") || resolveDatabasePath({}).endsWith("data/auth.sqlite"));

assert.equal(shouldUseSecureCookies({ COOKIE_SECURE: "true" }), true);
assert.equal(shouldUseSecureCookies({ COOKIE_SECURE: "false", NODE_ENV: "production" }), false);
assert.equal(shouldUseSecureCookies({ NODE_ENV: "production" }), true);
assert.equal(shouldUseSecureCookies({ NODE_ENV: "development" }), false);

assert.equal(resolveAppBaseUrl({ APP_BASE_URL: "https://custom.example.com", RENDER_EXTERNAL_URL: "https://render.example.com" }), "https://custom.example.com");
assert.equal(resolveAppBaseUrl({ RENDER_EXTERNAL_URL: "https://consultant.onrender.com" }), "https://consultant.onrender.com");
assert.equal(resolveAppBaseUrl({}), "");

const renderBlueprint = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
assert.match(renderBlueprint, /type: web[\s\S]*runtime: docker[\s\S]*healthCheckPath: \/readyz/u);
assert.match(renderBlueprint, /preDeployCommand: npm run db:pg:migrate && npm run knowledge:ingest -- --keyword-only/u);
assert.match(renderBlueprint, /key: DATABASE_URL\s+fromDatabase:\s+name: consultant-postgres\s+property: connectionString/u);
assert.match(renderBlueprint, /databases:[\s\S]*name: consultant-postgres[\s\S]*ipAllowList: \[\]/u);
assert.match(renderBlueprint, /type: worker[\s\S]*dockerCommand: node --import tsx worker\.mjs/u);
assert.match(renderBlueprint, /type: worker[\s\S]*maxShutdownDelaySeconds: 120/u);
assert.match(renderBlueprint, /type: keyvalue[\s\S]*name: consultant-redis[\s\S]*plan: starter/u);
assert.match(renderBlueprint, /name: consultant-redis[\s\S]*persistenceMode: journal-snapshot/u);
assert.match(renderBlueprint, /name: consultant-redis[\s\S]*maxmemoryPolicy: noeviction/u);
assert.match(renderBlueprint, /key: REDIS_URL[\s\S]*type: keyvalue[\s\S]*name: consultant-redis[\s\S]*property: connectionString/u);
assert.equal([...renderBlueprint.matchAll(/key: REDIS_URL/gmu)].length, 2);
assert.match(renderBlueprint, /key: JOB_HANDLER_MODULE\s+value: \.\/src\/worker\/default-handlers\.mjs/u);
assert.match(renderBlueprint, /key: WORKER_CONCURRENCY\s+value: "4"/u);
for (const secret of [
  "DEEPSEEK_API_KEY",
  "INSPIRATION_API_KEY",
  "OBJECT_STORE_ENDPOINT",
  "OBJECT_STORE_BUCKET",
  "OBJECT_STORE_ACCESS_KEY_ID",
  "OBJECT_STORE_SECRET_ACCESS_KEY",
]) {
  assert.match(renderBlueprint, new RegExp(`key: ${secret}\\s+sync: false`, "u"));
}

for (const [key, value] of [
  ["DEEPSEEK_PLAN_TIMEOUT_MS", "120000"],
  ["DEEPSEEK_PLAN_CALL_MAX_ATTEMPTS", "1"],
  ["DEEPSEEK_RAG_TIMEOUT_MS", "90000"],
  ["DEEPSEEK_RAG_CALL_MAX_ATTEMPTS", "1"],
  ["DEEPSEEK_MAJOR_MATCH_TIMEOUT_MS", "90000"],
  ["DEEPSEEK_CAPABILITY_ASSESSMENT_TIMEOUT_MS", "120000"],
  ["DEEPSEEK_CAPABILITY_ASSESSMENT_CALL_MAX_ATTEMPTS", "1"],
  ["INSPIRATION_TIMEOUT_MS", "60000"],
  ["INSPIRATION_CALL_MAX_ATTEMPTS", "1"],
]) {
  assert.match(renderBlueprint, new RegExp(`key: ${key}\\s+value: "${value}"`, "u"));
}
