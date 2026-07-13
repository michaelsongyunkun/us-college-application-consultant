import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRetrievalGoldenSet } from "../src/infrastructure/retrieval-golden-eval.ts";

const goldenCases = JSON.parse(await readFile(new URL("./fixtures/retrieval-golden.json", import.meta.url), "utf8"));
assert.equal(goldenCases.length >= 100, true, "golden set should contain at least 100 cases");
assert.equal(goldenCases.filter((item) => item.language === "zh").length >= 40, true);
assert.equal(goldenCases.filter((item) => item.language === "en").length >= 40, true);
assert.equal(new Set(goldenCases.map((item) => item.category)).size >= 8, true);

const cases = [
  { query: "AP Calculus course planning", expectedIds: ["ap", "courses"], language: "en", category: "course-planning" },
  { query: "计算机专业怎么选课", expectedIds: ["majors"], language: "zh", category: "major-exploration" },
];
const report = await evaluateRetrievalGoldenSet({
  cases,
  keywordSearch: async (query) => query.startsWith("AP")
    ? [{ id: "noise" }, { id: "ap" }]
    : [{ id: "majors" }],
  hybridSearch: async (query) => query.startsWith("AP")
    ? [{ id: "ap" }, { id: "courses" }]
    : [{ id: "majors" }, { id: "noise" }],
});

assert.equal(report.ok, true);
assert.equal(report.candidate.mrr >= report.baseline.mrr, true);
assert.equal(report.candidate.ndcgAtK > report.baseline.ndcgAtK, true);
assert.equal(report.groups.language.en.candidate.cases, 1);
assert.equal(report.groups.language.zh.candidate.cases, 1);
assert.equal(report.groups.category["course-planning"].baseline.cases, 1);
assert.equal(report.details[0].language, "en");
assert.equal(report.details[0].category, "course-planning");
assert.equal(Number.isFinite(report.details[0].baselineLatencyMs), true);
assert.equal(Number.isFinite(report.details[0].candidateLatencyMs), true);
assert.equal(Number.isFinite(report.baseline.latencyMs.p50), true);
assert.equal(Number.isFinite(report.baseline.latencyMs.p95), true);
assert.equal(Number.isFinite(report.candidate.latencyMs.p50), true);
assert.equal(Number.isFinite(report.candidate.latencyMs.p95), true);
