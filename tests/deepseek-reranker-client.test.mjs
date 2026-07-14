import assert from "node:assert/strict";
import {
  buildDeepSeekRerankMessages,
  createDeepSeekRerankerClientFromEnv,
} from "../src/infrastructure/deepseek-reranker-client.ts";
import { createRerankerClientFromEnv } from "../src/infrastructure/reranker-client.ts";

function createMockLlmClient(contents, calls = []) {
  const queue = Array.isArray(contents) ? [...contents] : [contents];
  return {
    async invoke(options) {
      calls.push(options);
      return { content: queue.shift() };
    },
  };
}

const env = {
  DEEPSEEK_API_KEY: "server-secret",
  DEEPSEEK_RERANK_ENABLED: "true",
  DEEPSEEK_RERANK_MODEL: "Deepseek V4 flash",
  DEEPSEEK_RERANK_TIMEOUT_MS: "15000",
  DEEPSEEK_RERANK_MAX_TOKENS: "1800",
  DEEPSEEK_RERANK_CANDIDATE_LIMIT: "12",
};

const calls = [];
const client = createDeepSeekRerankerClientFromEnv(env, {
  llmClient: createMockLlmClient('{"results":[{"index":0,"score":0.2},{"index":1,"score":0.98}]}', calls),
});
const candidates = [
  { id: "first", title: "General", content: "General admissions information" },
  { id: "best", title: "Computer science", content: "Detailed CS admissions information" },
  { id: "unranked", title: "Other", content: "Other information" },
];
const ranked = await client.rerank("computer science admissions", candidates, { limit: 2 });

assert.equal(client.provider, "deepseek");
assert.equal(client.modelVersion, "deepseek-v4-flash");
assert.equal(client.candidateLimit, 12);
assert.deepEqual(ranked.map((candidate) => candidate.id), ["best", "first", "unranked"]);
assert.equal(ranked[0].rerankScore, 0.98);
assert.equal(calls[0].feature, "deepseek-rerank");
assert.equal(calls[0].model, "deepseek-v4-flash");
assert.equal(calls[0].temperature, 0);
assert.equal(calls[0].timeoutMs, 15_000);
assert.equal(calls[0].maxTokens, 1_800);
assert.equal(JSON.stringify(calls[0].messages).includes("server-secret"), false);

const fencedClient = createDeepSeekRerankerClientFromEnv(env, {
  llmClient: createMockLlmClient('```json\n{"results":[{"index":1,"score":0.9}]}\n```'),
});
const fenced = await fencedClient.rerank("question", candidates, { limit: 1 });
assert.deepEqual(fenced.map((candidate) => candidate.id), ["best", "first", "unranked"]);

const invalidResponses = [
  '{"results":[{"index":0,"score":0.9},{"index":0,"score":0.8}]}',
  '{"results":[{"index":99,"score":0.9}]}',
  '{"results":[{"index":0,"score":2}]}',
];
for (const response of invalidResponses) {
  const invalidClient = createDeepSeekRerankerClientFromEnv(env, {
    llmClient: createMockLlmClient(response),
  });
  await assert.rejects(
    () => invalidClient.rerank("question", candidates, { limit: 2 }),
    /invalid|duplicate/u,
  );
}

assert.equal(createDeepSeekRerankerClientFromEnv({}), null);
assert.equal(createDeepSeekRerankerClientFromEnv({ DEEPSEEK_RERANK_ENABLED: "true" }), null);
assert.equal(createDeepSeekRerankerClientFromEnv({ DEEPSEEK_API_KEY: "key", DEEPSEEK_RERANK_ENABLED: "false" }), null);

let externalCalled = false;
const externalFirst = createRerankerClientFromEnv({
  ...env,
  RERANKER_URL: "http://reranker.internal",
}, {
  fetchImpl: async () => {
    externalCalled = true;
    return new Response(JSON.stringify({ results: [{ index: 0, score: 0.7 }] }), { status: 200 });
  },
  llmClient: createMockLlmClient('{"results":[{"index":1,"score":1}]}'),
});
assert.equal(externalFirst.provider, "external");
await externalFirst.rerank("question", candidates, { limit: 1 });
assert.equal(externalCalled, true);

const deepSeekFallback = createRerankerClientFromEnv(env, {
  llmClient: createMockLlmClient('{"results":[{"index":1,"score":1}]}'),
});
assert.equal(deepSeekFallback.provider, "deepseek");

const privateMarker = "PRIVATE_STUDENT_PROFILE_MUST_NOT_LEAK";
const trailingMarker = "TRAILING_TEXT_MUST_BE_TRUNCATED";
const privacyMessages = buildDeepSeekRerankMessages("safe query", [{
  id: "knowledge-id",
  title: "Knowledge title",
  content: `${"A".repeat(520)}${trailingMarker}`,
  studentProfile: privateMarker,
  email: "student@example.com",
}], { limit: 1, candidateTextLimit: 500 });
const serializedMessages = JSON.stringify(privacyMessages);
assert.equal(serializedMessages.includes(privateMarker), false);
assert.equal(serializedMessages.includes("student@example.com"), false);
assert.equal(serializedMessages.includes("knowledge-id"), false);
assert.equal(serializedMessages.includes(trailingMarker), false);
const privacyPayload = JSON.parse(privacyMessages[1].content);
assert.equal(privacyPayload.candidates[0].text.length, 500);
