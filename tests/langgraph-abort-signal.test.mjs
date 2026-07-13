import assert from "node:assert/strict";
import { createRagAnswerGraph } from "../src/server/langgraph-rag-workflow.mjs";
import { createSchoolSelectionGraph } from "../src/server/langgraph-school-selection-workflow.mjs";
import { createPortfolioCapabilityGraph } from "../src/server/langgraph-portfolio-capability-workflow.mjs";

const signal = new AbortController().signal;
const receivedSignals = [];

const ragGraph = createRagAnswerGraph({
  retrieveSources: async (state) => {
    receivedSignals.push(state.signal);
    return { sources: [], retrieval: {} };
  },
  draftAnswer: async (state) => {
    receivedSignals.push(state.signal);
    return "answer";
  },
  evaluateQuality: async () => ({}),
});
await ragGraph.invoke({ signal });

const schoolGraph = createSchoolSelectionGraph({
  loadContext: async (state) => {
    receivedSignals.push(state.signal);
    return {};
  },
  draftSelection: async (state) => {
    receivedSignals.push(state.signal);
    return { answer: "answer", validatedSelection: {}, attempts: 1 };
  },
  calibrateSelection: async () => ({}),
  evaluateQuality: async () => ({}),
  buildResponse: async () => ({ ok: true }),
});
await schoolGraph.invoke({ signal });

const capabilityGraph = createPortfolioCapabilityGraph({
  loadPortfolio: async (state) => {
    receivedSignals.push(state.signal);
    return { candidatePortfolio: {}, assessmentInput: {}, baseline: {} };
  },
  assessDimensions: async (state) => {
    receivedSignals.push(state.signal);
    return {};
  },
  validateNoSchoolAdvice: async ({ capabilityAssessment }) => capabilityAssessment,
  saveAssessment: async () => ({ capabilityAssessment: {} }),
  buildResponse: async () => ({ ok: true }),
});
await capabilityGraph.invoke({ signal });

assert.equal(receivedSignals.length, 6);
assert.ok(receivedSignals.every((received) => received === signal));
