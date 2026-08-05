#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRagRetriever } from "../src/server/deepseek-rag-service.mjs";
import { createStaticAdmissionsKnowledgeGraphAdapter } from "../src/server/admissions-knowledge-graph-adapter.mjs";
import { createRetrievalOrchestrator } from "../src/server/retrieval-orchestrator.mjs";
import { evaluateRagRelevanceGoldenSet } from "../src/infrastructure/rag-relevance-golden-eval.ts";

const cases = JSON.parse(await readFile(new URL("../tests/fixtures/rag-relevance-golden.json", import.meta.url), "utf8"));
const planning = {
  async getProfile(user) { return user.profile || {}; },
  async getLatestRagPlan() { return null; },
};
const activityPortfolio = {
  async getPortfolio(user) { return user.portfolio || {}; },
};
const documentRetriever = createRagRetriever({ root: process.cwd(), planning, activityPortfolio });
const graph = createStaticAdmissionsKnowledgeGraphAdapter({ root: process.cwd(), planning, activityPortfolio });
const orchestrator = createRetrievalOrchestrator({ documentRetriever, knowledgeGraph: graph });

const report = await evaluateRagRelevanceGoldenSet({
  cases,
  maxLatencyMs: 2_000,
  retrieve: (item) => orchestrator.retrieve({
    user: { id: `rag-relevance:${item.id}`, profile: item.profile || {}, portfolio: item.portfolio || {} },
    question: item.query,
    assistantProfile: item.assistantProfile || "",
    usePersonalContext: item.usePersonalContext === true,
  }),
});

const failures = report.details.filter((item) => (
  !item.forbiddenPassed
  || !item.sourceBudgetPassed
  || !item.graphBudgetPassed
  || !item.absoluteLatencyPassed
));
console.log(JSON.stringify({
  ok: report.ok,
  summary: report.summary,
  categories: report.categories,
  latencyPassed: report.latencyPassed,
  absoluteLatencyPassed: report.absoluteLatencyPassed,
  failures,
}, null, 2));
if (!report.ok) process.exitCode = 1;
