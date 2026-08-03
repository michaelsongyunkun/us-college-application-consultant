import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateGraphRagGoldenSet } from "../src/infrastructure/graph-rag-golden-eval.ts";

const goldenCases = JSON.parse(await readFile(new URL("./fixtures/graph-rag-golden.json", import.meta.url), "utf8"));
assert.equal(goldenCases.length >= 10, true);
assert.equal(new Set(goldenCases.map((item) => item.language)).size >= 2, true);
assert.equal(new Set(goldenCases.map((item) => item.category)).size >= 4, true);
assert.equal(goldenCases.filter((item) => item.expected.mode.startsWith("graph-rag")).length >= 8, true);
assert.ok(goldenCases.some((item) => item.expected.mode === "hybrid-rag"));
assert.ok(goldenCases.some((item) => item.expected.mode === "direct"));

const cases = [{
  id: "graph-case",
  query: "MIT EA",
  language: "en",
  category: "school-round",
  expected: {
    mode: "graph-rag-with-constraints",
    graphStatus: "applied",
    constraints: { rounds: ["EA"] },
    documentSourceTypes: ["school-encyclopedia"],
    graphSourceIds: ["data/application-round-schools.md"],
    predicates: ["SUPPORTS_APPLICATION_ROUND"],
    relations: [{ subjectIncludes: "MIT", predicate: "SUPPORTS_APPLICATION_ROUND", objectIncludes: "EA" }],
  },
}];
const baseline = async () => ({ context: "document", sources: [{ type: "school-encyclopedia" }] });
const candidate = async () => ({
  context: "graph and document",
  sources: [{ type: "school-encyclopedia" }, { type: "knowledge-graph", sourceId: "data/application-round-schools.md" }],
  graphSourceIds: ["data/application-round-schools.md"],
  facts: [{
    subject: { name: "MIT" },
    predicate: "SUPPORTS_APPLICATION_ROUND",
    object: { name: "EA" },
    sourceId: "data/application-round-schools.md",
  }],
  retrieval: {
    mode: "graph-rag-with-constraints",
    queryPlan: { constraints: { rounds: ["EA"] } },
    graph: { status: "applied" },
  },
});
const fallback = async () => ({
  context: "document",
  sources: [{ type: "school-encyclopedia" }],
  retrieval: { graph: { status: "fallback" } },
});

const report = await evaluateGraphRagGoldenSet({ cases, baselineRetrieve: baseline, graphRetrieve: candidate, fallbackRetrieve: fallback });
assert.equal(report.ok, true);
assert.equal(report.baseline.relationRecall, 0);
assert.equal(report.candidate.relationRecall, 1);
assert.equal(report.routing.modeAccuracy, 1);
assert.equal(report.routing.constraintAccuracy, 1);
assert.equal(report.fallback.successRate, 1);

const degraded = await evaluateGraphRagGoldenSet({
  cases,
  baselineRetrieve: baseline,
  graphRetrieve: async () => ({
    context: "document only",
    sources: [{ type: "school-encyclopedia" }],
    retrieval: { mode: "hybrid-rag", queryPlan: { constraints: { rounds: [] } }, graph: { status: "not-required" } },
  }),
  fallbackRetrieve: fallback,
});
assert.equal(degraded.ok, false);
assert.equal(degraded.gates.relationRecall, false);
assert.equal(degraded.gates.modeAccuracy, false);
