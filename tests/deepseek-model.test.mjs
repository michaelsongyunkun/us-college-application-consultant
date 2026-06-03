import assert from "node:assert/strict";
import { normalizeDeepSeekModel } from "../src/server/deepseek-model.mjs";

assert.equal(normalizeDeepSeekModel("deepseek-v4-pro"), "deepseek-v4-pro");
assert.equal(normalizeDeepSeekModel("Deepseek V4 pro"), "deepseek-v4-pro");
assert.equal(normalizeDeepSeekModel("deepseek_v4_pro"), "deepseek-v4-pro");
assert.equal(normalizeDeepSeekModel("deepseek v4 flash"), "deepseek-v4-flash");
assert.equal(normalizeDeepSeekModel(""), "deepseek-v4-pro");
assert.equal(normalizeDeepSeekModel("custom-model"), "custom-model");
