import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnvFile } from "../src/server/env-loader.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-env-loader-"));
const envFile = join(tempDir, ".env");
await writeFile(
  envFile,
  [
    "# local secrets",
    "DEEPSEEK_API_KEY=from-env-file",
    "DEEPSEEK_MODEL=\"deepseek-v4-pro\"",
    "DEEPSEEK_PLAN_MODEL=deepseek-v4-flash",
    "export DEEPSEEK_SCHOOL_SELECTION_MODEL='deepseek-v4-flash'",
    "EXISTING_VALUE=from-env-file",
    "INLINE_COMMENT=value # comment",
    "INVALID-KEY=ignored",
  ].join("\n"),
  "utf8",
);

const env = { EXISTING_VALUE: "from-process" };
const result = loadEnvFile(envFile, { env });

assert.equal(result.loaded, true);
assert.deepEqual(result.keys.sort(), [
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_PLAN_MODEL",
  "DEEPSEEK_SCHOOL_SELECTION_MODEL",
  "INLINE_COMMENT",
].sort());
assert.equal(env.DEEPSEEK_API_KEY, "from-env-file");
assert.equal(env.DEEPSEEK_MODEL, "deepseek-v4-pro");
assert.equal(env.DEEPSEEK_PLAN_MODEL, "deepseek-v4-flash");
assert.equal(env.DEEPSEEK_SCHOOL_SELECTION_MODEL, "deepseek-v4-flash");
assert.equal(env.EXISTING_VALUE, "from-process");
assert.equal(env.INLINE_COMMENT, "value");
assert.equal(env["INVALID-KEY"], undefined);

const missing = loadEnvFile(join(tempDir, ".env.missing"), { env: {} });
assert.equal(missing.loaded, false);
assert.deepEqual(missing.keys, []);
