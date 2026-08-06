import assert from "node:assert/strict";
import { evaluateRagRelevanceGoldenSet } from "../src/infrastructure/rag-relevance-golden-eval.ts";

const report = await evaluateRagRelevanceGoldenSet({
  cases: [
    {
      id: "positive",
      category: "major",
      usePersonalContext: true,
      relevantPatterns: ["Computer Science"],
      forbiddenPatterns: ["Hospitality"],
      maxSources: 2,
      expectedMode: "graph-rag",
    },
    {
      id: "negative",
      category: "negative",
      relevantPatterns: [],
      forbiddenPatterns: ["Anything"],
      maxSources: 0,
    },
  ],
  retrieve: async (item) => item.id === "positive"
    ? {
        sources: [
          { id: "cs", title: "Computer Science", scope: "knowledge" },
          { id: "portfolio", title: "Application portfolio", scope: "personal" },
        ],
        retrieval: { mode: "graph-rag", graph: { selectedFacts: 0 } },
      }
    : { sources: [], retrieval: { mode: "hybrid-rag", graph: { selectedFacts: 0 } } },
  precisionFloor: 0.8,
  categoryPrecisionFloor: 0.7,
  recallFloor: 1,
  latencyAllowance: { ratio: 1.15, absoluteMs: 50 },
  maxLatencyMs: 2_000,
});

assert.equal(report.ok, true);
assert.equal(report.summary.precisionAtK, 1);
assert.equal(report.summary.recallAtK, 1);
assert.equal(report.summary.noiseRate, 0);
assert.equal(report.details[0].relevantSources, 2);
assert.equal(report.absoluteLatencyPassed, true);
assert.equal(report.details[1].sourceBudgetPassed, true);
assert.equal(report.details[0].modePassed, true);
