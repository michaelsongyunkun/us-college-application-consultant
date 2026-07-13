import assert from "node:assert/strict";
import { createDefaultJobHandlers } from "../src/worker/default-handlers.mjs";
import { createDeepSeekRagService } from "../src/server/deepseek-rag-service.mjs";
import { createSchoolSelectionService } from "../src/server/school-selection-service.mjs";
import { createPortfolioCapabilityAgentService } from "../src/server/portfolio-capability-agent-service.mjs";

const controller = new AbortController();
const receivedSignals = [];
const handlers = createDefaultJobHandlers({
  env: { DEEPSEEK_API_KEY: "test-key" },
  root: process.cwd(),
  planService: {
    async generatePlan(input) {
      receivedSignals.push(input.signal);
      return { ok: true };
    },
  },
  mailer: { async sendPasswordResetEmail() {} },
  objectStore: {},
  createRagService: () => ({
    async answerQuestion(input) {
      receivedSignals.push(input.signal);
      return { ok: true };
    },
  }),
  createSchoolSelection: () => ({
    async generateSelection(input) {
      receivedSignals.push(input.signal);
      return { ok: true };
    },
  }),
  createCapabilityAssessment: () => ({
    async generateAssessment(input) {
      receivedSignals.push(input.signal);
      return { ok: true };
    },
  }),
});
const context = { signal: controller.signal, job: { id: "job-1" } };

await handlers["ai.deepseek-plan"]({ payload: {} }, context);
await handlers["ai.deepseek-rag"]({ user: { id: 1 }, question: "test" }, context);
await handlers["ai.school-selection"]({ user: { id: 1 }, payload: {} }, context);
await handlers["ai.capability-assessment"]({ user: { id: 1 }, payload: {} }, context);

assert.equal(receivedSignals.length, 4);
assert.ok(receivedSignals.every((signal) => signal === controller.signal));

const graphInputs = [];
const env = { DEEPSEEK_API_KEY: "test-key" };
const ragService = createDeepSeekRagService({
  root: process.cwd(),
  planning: {},
  activityPortfolio: {},
  retriever: { async retrieve() { return {}; } },
  ragAnswerGraph: { async invoke(input) { graphInputs.push(input); return { answer: "ok" }; } },
});
const schoolService = createSchoolSelectionService({
  activityPortfolio: {},
  selectionGraph: { async invoke(input) { graphInputs.push(input); return { selection: {} }; } },
});
const capabilityService = createPortfolioCapabilityAgentService({
  activityPortfolio: {},
  capabilityGraph: { async invoke(input) { graphInputs.push(input); return { capabilityAssessment: {} }; } },
});

await ragService.answerQuestion({ user: { id: 1 }, question: "test question", env, signal: controller.signal });
await schoolService.generateSelection({
  user: { id: 1 },
  payload: {
    nationality: "中国",
    highSchoolRegion: "中国大陆高中",
    preferences: "Data science",
    targetMajor: "Data Science",
  },
  env,
  signal: controller.signal,
});
await capabilityService.generateAssessment({ user: { id: 1 }, payload: {}, env, signal: controller.signal });
assert.equal(graphInputs.length, 3);
assert.ok(graphInputs.every((input) => input.signal === controller.signal));
