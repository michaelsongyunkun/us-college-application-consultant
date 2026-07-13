#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { reciprocalRankFusion } from "../src/infrastructure/hybrid-retriever.ts";
import { evaluateRetrievalGoldenSet } from "../src/infrastructure/retrieval-golden-eval.ts";

const cases = JSON.parse(await readFile(new URL("../tests/fixtures/retrieval-golden.json", import.meta.url), "utf8"));
const byQuery = new Map(cases.map((item) => [item.query, item]));
const report = await evaluateRetrievalGoldenSet({
  cases,
  keywordSearch: async (query) => byQuery.get(query).keywordRanking.map((id, index) => ({ id, score: 100 - index })),
  hybridSearch: async (query) => {
    const item = byQuery.get(query);
    return reciprocalRankFusion([
      item.vectorRanking.map((id, index) => ({ id, score: 1 - index / 10 })),
      item.keywordRanking.map((id, index) => ({ id, score: 100 - index })),
    ], { weights: [0.75, 1.25] });
  },
});
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
