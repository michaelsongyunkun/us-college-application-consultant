import assert from "node:assert/strict";
import { mergePostgresRetrieval } from "../src/infrastructure/postgres-rag-retriever.ts";

const baselineResult = {
  context: "[1] Baseline\nbaseline content",
  sources: [{ id: "baseline", title: "Baseline" }],
  retrieval: { selectedDocuments: 1 },
};
const postgresResults = Array.from({ length: 8 }, (_, index) => ({
  id: `pg-${index + 1}`,
  sourceType: "resource-library",
  title: `Postgres ${index + 1}`,
  content: `${String(index + 1).repeat(180)} END-${index + 1}`,
}));

const merged = mergePostgresRetrieval({
  baselineResult,
  postgresResults,
  maxPostgresContextChars: 500,
  maxPostgresSources: 8,
});
const postgresSources = merged.sources.filter((source) => source.id.startsWith("pg-"));

assert.equal(postgresSources.length, 2);
assert.equal(merged.retrieval.postgresDocuments, 8);
assert.equal(merged.retrieval.postgresSelectedDocuments, 2);
for (const source of postgresSources) assert.match(merged.context, new RegExp(source.title));
assert.doesNotMatch(merged.context, /Postgres 3/u);
assert.doesNotMatch(merged.context, /END-3/u);
assert.ok(merged.context.length < 26_000);

const duplicate = mergePostgresRetrieval({
  baselineResult,
  postgresResults: [{ ...postgresResults[0], id: "baseline" }, postgresResults[1]],
});
assert.deepEqual(duplicate.sources.map((source) => source.id), ["baseline", "pg-2"]);
