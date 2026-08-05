import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHybridRetriever, reciprocalRankFusion } from "../src/infrastructure/hybrid-retriever.ts";
import { buildKeywordSearchTerms, createPostgresKnowledgeRepository } from "../src/infrastructure/markdown-ingestion.ts";

const chineseTerms = buildKeywordSearchTerms("计算机科学专业怎么选");
assert.equal(chineseTerms.includes("计算机"), true);
assert.equal(chineseTerms.includes("科学"), true);
assert.equal(chineseTerms.includes("专业"), true);

let keywordSql = "";
let keywordParameters = [];
const knowledge = createPostgresKnowledgeRepository({
  pool: {
    async query(sql, parameters) {
      keywordSql = sql;
      keywordParameters = parameters;
      return { rows: [] };
    },
  },
});
await knowledge.keywordSearch("计算机科学专业怎么选", { limit: 7 });
assert.match(keywordSql, /word_similarity\(term, knowledge_documents\.title\)/u);
assert.doesNotMatch(keywordSql, /word_similarity\(term, knowledge_documents\.content\)/u);
assert.match(keywordSql, /knowledge_documents\.content ILIKE '%' \|\| term \|\| '%' THEN 0\.25/u);
assert.deepEqual(keywordParameters[1], chineseTerms);
assert.equal(keywordParameters[2], 7);

const chineseSearchMigration = await readFile(new URL("../drizzle/0002_chinese_keyword_search.sql", import.meta.url), "utf8").catch(() => "");
assert.match(chineseSearchMigration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/u);
assert.match(chineseSearchMigration, /gin_trgm_ops/u);
const migrationJournal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
assert.equal(migrationJournal.entries.some((entry) => entry.tag === "0002_chinese_keyword_search"), true);

const fused = reciprocalRankFusion([
  [{ id: "official", score: 0.9 }, { id: "blog", score: 0.8 }],
  [{ id: "blog", score: 20 }, { id: "official", score: 10 }],
]);
assert.equal(fused[0].id, "official");

const fallback = createHybridRetriever({
  vectorSearch: async () => { throw new Error("embedding unavailable"); },
  keywordSearch: async () => [{ id: "keyword", title: "Keyword result", score: 4 }],
});
const fallbackResult = await fallback.search("financial aid", { limit: 5 });
assert.equal(fallbackResult.mode, "keyword-fallback");
assert.equal(fallbackResult.results[0].id, "keyword");

let fallbackRerankCalls = 0;
const rerankedFallback = createHybridRetriever({
  vectorSearch: async () => { throw new Error("embedding unavailable"); },
  keywordSearch: async () => [{ id: "keyword-first" }, { id: "best" }],
  rerank: async (_query, candidates) => {
    fallbackRerankCalls += 1;
    return [...candidates].reverse();
  },
});
const rerankedFallbackResult = await rerankedFallback.search("best", { limit: 1 });
assert.equal(fallbackRerankCalls, 1);
assert.equal(rerankedFallbackResult.mode, "keyword-fallback-reranked");
assert.equal(rerankedFallbackResult.results[0].id, "best");
assert.equal(rerankedFallbackResult.retrieval.reranker, "applied");

const degradedFallback = createHybridRetriever({
  vectorSearch: async () => { throw new Error("embedding unavailable"); },
  keywordSearch: async () => [{ id: "keyword-first" }, { id: "other" }],
  rerank: async () => { throw new Error("reranker unavailable"); },
});
const degradedFallbackResult = await degradedFallback.search("question", { limit: 1 });
assert.equal(degradedFallbackResult.mode, "keyword-fallback-rerank-fallback");
assert.equal(degradedFallbackResult.results[0].id, "keyword-first");
assert.equal(degradedFallbackResult.retrieval.reranker, "fallback");

let limitedRerankCandidateCount = 0;
const limitedRerankFallback = createHybridRetriever({
  vectorSearch: async () => { throw new Error("embedding unavailable"); },
  keywordSearch: async () => [{ id: "first" }, { id: "second" }, { id: "third" }],
  rerankCandidateLimit: 2,
  rerank: async (_query, candidates) => {
    limitedRerankCandidateCount = candidates.length;
    return candidates;
  },
});
await limitedRerankFallback.search("question", { limit: 1 });
assert.equal(limitedRerankCandidateCount, 2);

const hybrid = createHybridRetriever({
  vectorSearch: async (_query, options) => {
    assert.equal(options.limit, 40);
    return [{ id: "official", score: 0.91 }, { id: "noise", score: 0.2 }];
  },
  keywordSearch: async (_query, options) => {
    assert.equal(options.limit, 40);
    return [{ id: "official", score: 12 }, { id: "keyword", score: 8 }];
  },
});
const result = await hybrid.search("official deadline", { limit: 2 });
assert.equal(result.mode, "hybrid");
assert.equal(result.results[0].id, "official");
assert.equal(result.retrieval.candidateLimit, 40);
assert.deepEqual(result.retrieval.rrfWeights, [1, 1.1]);
assert.equal(result.retrieval.rankConstant, 50);

const reranked = createHybridRetriever({
  vectorSearch: async () => [{ id: "vector-first", content: "less relevant" }, { id: "best", content: "best answer" }],
  keywordSearch: async () => [{ id: "vector-first", content: "less relevant" }, { id: "best", content: "best answer" }],
  rerank: async (_query, candidates) => [...candidates].sort((left) => left.id === "best" ? -1 : 1),
});
const rerankedResult = await reranked.search("best answer", { limit: 1 });
assert.equal(rerankedResult.mode, "hybrid-reranked");
assert.equal(rerankedResult.results[0].id, "best");
assert.equal(rerankedResult.retrieval.reranker, "applied");

const pruned = await createHybridRetriever({
  keywordSearch: async () => [{ id: "one" }, { id: "two" }],
  vectorSearch: async () => [{ id: "one" }, { id: "two" }],
  rerank: async () => [{ id: "one", score: 0.9 }],
}).search("focused", { limit: 8 });
assert.deepEqual(pruned.results.map((item) => item.id), ["one"]);
assert.equal(pruned.retrieval.reranker, "applied");

const degraded = createHybridRetriever({
  vectorSearch: async () => [{ id: "rrf-winner" }, { id: "other" }],
  keywordSearch: async () => [{ id: "rrf-winner" }, { id: "other" }],
  rerank: async () => { throw new Error("reranker timeout"); },
});
const degradedResult = await degraded.search("question", { limit: 1 });
assert.equal(degradedResult.mode, "hybrid-rerank-fallback");
assert.equal(degradedResult.results[0].id, "rrf-winner");
assert.equal(degradedResult.retrieval.reranker, "fallback");
