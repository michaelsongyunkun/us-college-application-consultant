import assert from "node:assert/strict";
import {
  mergePostgresRetrieval,
  resolvePostgresRetrievalQuery,
} from "../src/infrastructure/postgres-rag-retriever.ts";

const baselineResult = {
  context: "",
  sources: [],
  candidates: [
    { id: "local-good", type: "major-encyclopedia", scope: "knowledge", channel: "local-keyword", rawScore: 10, title: "Computer Science", text: "Algorithms and AI" },
    { id: "local-noise", type: "major-encyclopedia", scope: "knowledge", channel: "local-keyword", rawScore: 1, title: "Hospitality", text: "Hotel operations" },
  ],
  retrieval: { selectedDocuments: 2 },
};
const postgresResults = [
  { id: "pg-good", sourceType: "major-encyclopedia", title: "Mechanical Engineering", content: "Robotics and CAD", score: 0.04 },
  { id: "pg-noise", sourceType: "resource-library", title: "Archive Studies", content: "Library records", score: 0.01 },
];

const merged = mergePostgresRetrieval({
  baselineResult,
  postgresResults,
  maxSources: 8,
});
assert.deepEqual(merged.sources.map((source) => source.id), ["local-good", "pg-good"]);
assert.equal(merged.retrieval.selectedDocuments, 2);
assert.equal(merged.retrieval.postgresDocuments, 2);
assert.equal(merged.retrieval.postgresSelectedDocuments, 1);
assert.ok(merged.retrieval.relevance.rejectedCandidates >= 2);
assert.match(merged.context, /Computer Science/u);
assert.match(merged.context, /Mechanical Engineering/u);
assert.doesNotMatch(merged.context, /Hospitality|Archive Studies/u);

const reranked = mergePostgresRetrieval({
  baselineResult: { context: "", sources: [], candidates: [], retrieval: {} },
  postgresResults: [
    {
      id: "rerank-noise",
      sourceType: "major-encyclopedia",
      title: "Hospitality Management",
      content: "Hotel operations and guest services",
      score: 0.05,
      rerankScore: 0.04,
    },
    {
      id: "rerank-relevant",
      sourceType: "major-encyclopedia",
      title: "Marine Biology",
      content: "Marine genomics and coastal microbiome DNA",
      score: 0.01,
      rerankScore: 0.97,
    },
  ],
  maxSources: 8,
});
assert.deepEqual(
  reranked.sources.map((source) => source.id),
  ["rerank-relevant"],
  "The production merge must preserve reranker relevance instead of sorting again by stale RRF scores.",
);

assert.equal(
  resolvePostgresRetrievalQuery(
    { question: "请根据我的申请档案自动匹配专业" },
    { searchQuery: "Marine Biology Ocean Genome Lab coastal microbiome DNA" },
  ),
  "Marine Biology Ocean Genome Lab coastal microbiome DNA",
  "Production hybrid retrieval and its cache key must use the profile-enriched query for automatic matching.",
);

const intentFiltered = mergePostgresRetrieval({
  baselineResult: {
    context: "",
    sources: [],
    candidates: [],
    allowedKnowledgeTypes: ["major-encyclopedia"],
    retrieval: { intent: "major" },
  },
  postgresResults: [
    {
      id: "pg-school-noise",
      sourceType: "school-encyclopedia",
      title: "Unrequested school profile",
      content: "Generic school information",
      score: 0.08,
    },
    {
      id: "pg-major-fit",
      sourceType: "major-encyclopedia",
      title: "Data Science",
      content: "Statistics, computing, and data analysis",
      score: 0.04,
    },
  ],
  maxSources: 8,
});
assert.deepEqual(
  intentFiltered.sources.map((source) => source.id),
  ["pg-major-fit"],
  "Postgres retrieval must preserve the source-type constraints chosen from the current question intent.",
);
