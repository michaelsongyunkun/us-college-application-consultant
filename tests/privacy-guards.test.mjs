import assert from "node:assert/strict";
import { normalizeSnapshotNote, stripSensitiveDraftFields } from "../src/shared/privacy-guards.mjs";

assert.equal(normalizeSnapshotNote("  Before counselor review  "), "Before counselor review");
assert.equal(normalizeSnapshotNote("3152482377@qq.com"), "");
assert.equal(normalizeSnapshotNote("student@example.com"), "");

assert.deepEqual(
  stripSensitiveDraftFields({
    rawAnswer: "answer",
    apiKey: "sk-request",
    deepSeekApiKey: "deepseek-request",
    openAiApiKey: "sk-openai",
    openaiApiKey: "sk-openai-lower",
    OPENAI_API_KEY: "sk-env",
    DEEPSEEK_API_KEY: "deepseek-env",
    INSPIRATION_API_KEY: "inspiration-env",
  }),
  { rawAnswer: "answer" },
);
