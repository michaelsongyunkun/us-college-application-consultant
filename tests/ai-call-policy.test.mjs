import assert from "node:assert/strict";
import { AiCircuitOpenError, classifyAiCallError, createAiCallPolicy } from "../src/server/ai-call-policy.ts";

assert.equal(classifyAiCallError({ statusCode: 429 }), "rate_limited");
assert.equal(classifyAiCallError({ statusCode: 503 }), "retryable");
assert.equal(classifyAiCallError({ statusCode: 400 }), "non_retryable");
const attempts = [];
const policy = createAiCallPolicy({ maxAttempts: 2, baseDelayMs: 1, sleep: async () => {}, random: () => 0 });
const result = await policy.execute({ feature: "plan", primaryModel: "primary", fallbackModels: ["fallback"], operation: async ({ model }) => {
  attempts.push(model);
  if (model === "primary") throw Object.assign(new Error("temporary"), { statusCode: 503 });
  return { ok: true };
} });
assert.deepEqual(attempts, ["primary", "primary", "fallback"]);
assert.equal(result.selectedModel, "fallback");
const nonRetryableCalls = [];
await assert.rejects(() => policy.execute({
  feature: "invalid-request",
  primaryModel: "primary",
  fallbackModels: ["fallback"],
  operation: async ({ model }) => {
    nonRetryableCalls.push(model);
    throw Object.assign(new Error("invalid"), { statusCode: 400 });
  },
}));
assert.deepEqual(nonRetryableCalls, ["primary"]);
const timeoutPolicy = createAiCallPolicy({ timeoutMs: 5, maxAttempts: 1 });
await assert.rejects(
  () => timeoutPolicy.execute({ feature: "timeout", primaryModel: "primary", operation: async () => new Promise(() => {}) }),
  (error) => error.code === "ETIMEDOUT" && error.retryable === true,
);
const overrideTimeoutPolicy = createAiCallPolicy({ timeoutMs: 5, maxAttempts: 1 });
assert.equal(
  await overrideTimeoutPolicy.execute({
    feature: "plan-override",
    primaryModel: "primary",
    timeoutMs: 50,
    operation: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 15)),
  }).then((value) => value.ok),
  true,
);
let now = 100;
const circuit = createAiCallPolicy({ maxAttempts: 1, failureThreshold: 1, resetTimeoutMs: 50, now: () => now });
await assert.rejects(() => circuit.execute({ feature: "rag", primaryModel: "primary", operation: async () => { throw Object.assign(new Error("down"), { statusCode: 503 }); } }));
await assert.rejects(() => circuit.execute({ feature: "rag", primaryModel: "primary", operation: async () => ({ ok: true }) }), AiCircuitOpenError);
now = 151;
assert.equal((await circuit.execute({ feature: "rag", primaryModel: "primary", operation: async () => ({ ok: true }) })).ok, true);
