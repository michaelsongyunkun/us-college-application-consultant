#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRagRetriever } from "../src/server/deepseek-rag-service.mjs";
import { createStaticAdmissionsKnowledgeGraphAdapter } from "../src/server/admissions-knowledge-graph-adapter.mjs";
import { createRetrievalOrchestrator } from "../src/server/retrieval-orchestrator.mjs";
import { evaluateGraphRagGoldenSet } from "../src/infrastructure/graph-rag-golden-eval.ts";

const root = process.cwd();
const cases = JSON.parse(await readFile(new URL("../tests/fixtures/graph-rag-golden.json", import.meta.url), "utf8"));
const planning = {
  async getProfile(user) { return user?.profile || {}; },
  async listRagBackups() { return []; },
};
const activityPortfolio = {
  async getPortfolio(user) { return user?.portfolio || {}; },
};
const documentRetriever = createRagRetriever({ root, planning, activityPortfolio });
const knowledgeGraph = createStaticAdmissionsKnowledgeGraphAdapter({ root, planning, activityPortfolio });

function inputFor(item) {
  return {
    user: { id: `graph-rag-eval:${item.id}`, profile: item.profile || {}, portfolio: item.portfolio || {} },
    question: item.query,
    taskType: item.taskType,
    assistantProfile: item.assistantProfile,
  };
}

const report = await evaluateGraphRagGoldenSet({
  cases,
  baselineRetrieve: async (item) => {
    if (item.expected?.mode === "direct") return { context: "", sources: [], facts: [], retrieval: {} };
    return documentRetriever.retrieve(inputFor(item));
  },
  graphRetrieve: async (item) => {
    let graphResult = null;
    const orchestrator = createRetrievalOrchestrator({
      documentRetriever,
      knowledgeGraph: {
        async search(input) {
          graphResult = await knowledgeGraph.search(input);
          return graphResult;
        },
      },
    });
    const result = await orchestrator.retrieve(inputFor(item));
    return {
      ...result,
      facts: graphResult?.facts || [],
      graphSourceIds: graphResult?.sourceIds || [],
    };
  },
  fallbackRetrieve: async (item) => createRetrievalOrchestrator({
    documentRetriever,
    knowledgeGraph: { async search() { throw new Error("forced graph evaluation fallback"); } },
  }).retrieve(inputFor(item)),
});

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
