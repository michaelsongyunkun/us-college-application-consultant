import assert from "node:assert/strict";
import { mergePostgresRetrieval } from "../src/infrastructure/postgres-rag-retriever.ts";

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
