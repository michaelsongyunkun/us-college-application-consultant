import assert from "node:assert/strict";
import { createRerankerClientFromEnv } from "../src/infrastructure/reranker-client.ts";

let request;
const client = createRerankerClientFromEnv({ RERANKER_URL: "http://reranker.internal", RERANKER_TIMEOUT_MS: "200" }, {
  fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ results: [{ index: 1, score: 0.98 }, { index: 0, score: 0.2 }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
const rerankedDocuments = await client.rerank("computer science", [
  { id: "first", title: "First", content: "generic" },
  { id: "second", title: "Second", content: "computer science details" },
], { limit: 2 });
assert.equal(request.url, "http://reranker.internal/rerank");
assert.equal(JSON.parse(request.options.body).documents.length, 2);
assert.deepEqual(rerankedDocuments.map((item) => item.id), ["second", "first"]);
assert.equal(rerankedDocuments[0].rerankScore, 0.98);

assert.equal(createRerankerClientFromEnv({}), null);
