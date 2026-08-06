import assert from "node:assert/strict";
import { createDeepSeekRagService } from "../src/server/deepseek-rag-service.mjs";

const calls = [];
const answers = [
  `Opening summary.\n\n${"x".repeat(13_000)}`,
  "Short major-match answer.",
  "z".repeat(500),
  "## Analysis\n- point one\n- unfinished point two",
  `\`\`\`json\n${"x".repeat(500)}\n\`\`\``,
];
const finishReasons = ["stop", "stop", "length", "length", "stop"];

const service = createDeepSeekRagService({
  root: process.cwd(),
  planning: {},
  activityPortfolio: {
    async getPortfolio() {
      return {
        activities: [{ activityName: "Output limit test activity", description: "Portfolio-only evidence." }],
      };
    },
  },
  retrievalOrchestrator: {
    async retrieve({ assistantProfile }) {
      const majorMatch = assistantProfile === "major-match";
      return {
        context: "Bounded retrieval evidence.",
        sources: majorMatch
          ? [
            { id: "portfolio", type: "application-portfolio", title: "Portfolio" },
            { id: "major", type: "major-encyclopedia", title: "Major" },
          ]
          : [
            { id: "portfolio", type: "application-portfolio", title: "Portfolio" },
            { id: "current-plan", type: "current-planning", title: "Current plan" },
          ],
        missingFields: [],
        retrieval: {
          intent: majorMatch ? "major" : "general",
          intentReason: "output-limit regression test",
          sourceWeights: {},
          queryPlan: { mode: majorMatch ? "graph-rag" : "hybrid-rag", steps: [], constraints: {} },
          graph: { status: majorMatch ? "applied" : "not-required", selectedFacts: 0 },
        },
      };
    },
  },
  llmClient: {
    async invoke(options) {
      calls.push(options);
      return {
        content: answers[calls.length - 1],
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
        responseMetadata: { finish_reason: finishReasons[calls.length - 1] },
      };
    },
  },
});

const defaultResult = await service.answerQuestion({
  user: { id: "output-limit-user" },
  question: "Give me an application strategy.",
  env: { DEEPSEEK_API_KEY: "test-only", DEEPSEEK_MODEL: "deepseek-chat" },
});
assert.equal(calls[0].maxTokens, 1_200);
assert.ok(defaultResult.answer.length <= 12_000);
assert.match(defaultResult.answer, /回答已达到长度上限/u);
assert.equal(defaultResult.quality.output.truncated, true);
assert.equal(defaultResult.quality.output.maxTokens, 1_200);
assert.equal(defaultResult.quality.output.finishReason, "stop");
assert.ok(defaultResult.quality.review.reasons.includes("response_too_long"));

const majorMatchResult = await service.answerQuestion({
  user: { id: "output-limit-user" },
  question: "Match suitable majors.",
  assistantProfile: "major-match",
  env: { DEEPSEEK_API_KEY: "test-only", DEEPSEEK_MODEL: "deepseek-chat" },
});
assert.equal(calls[1].maxTokens, 2_200);
assert.equal(majorMatchResult.answer, "Short major-match answer.");
assert.equal(majorMatchResult.quality.output.truncated, false);

const configuredResult = await service.answerQuestion({
  user: { id: "output-limit-user" },
  question: "Use configured output limits.",
  env: {
    DEEPSEEK_API_KEY: "test-only",
    DEEPSEEK_MODEL: "deepseek-chat",
    DEEPSEEK_RAG_MAX_TOKENS: "777",
    DEEPSEEK_RAG_MAX_ANSWER_CHARS: "120",
  },
});
assert.equal(calls[2].maxTokens, 777);
assert.ok(configuredResult.answer.length <= 120);
assert.equal(configuredResult.quality.output.maxCharacters, 120);
assert.equal(configuredResult.quality.output.finishReason, "length");
assert.ok(configuredResult.quality.review.reasons.includes("response_too_long"));

const providerLimitedResult = await service.answerQuestion({
  user: { id: "output-limit-user" },
  question: "Return a provider-limited answer.",
  env: { DEEPSEEK_API_KEY: "test-only", DEEPSEEK_MODEL: "deepseek-chat" },
});
assert.equal(providerLimitedResult.quality.output.truncated, false);
assert.equal(providerLimitedResult.quality.output.finishReason, "length");
assert.match(providerLimitedResult.answer, /回答已达到长度上限/u);
assert.ok(providerLimitedResult.answer.length <= 12_000);

const markdownLimitedResult = await service.answerQuestion({
  user: { id: "output-limit-user" },
  question: "Return a long fenced block.",
  env: {
    DEEPSEEK_API_KEY: "test-only",
    DEEPSEEK_MODEL: "deepseek-chat",
    DEEPSEEK_RAG_MAX_ANSWER_CHARS: "120",
  },
});
const markdownFences = markdownLimitedResult.answer.match(/```/gu) || [];
assert.equal(markdownFences.length % 2, 0, "Truncation should close an open Markdown code fence.");
assert.match(markdownLimitedResult.answer, /回答已达到长度上限/u);
assert.ok(
  markdownLimitedResult.answer.lastIndexOf("```") < markdownLimitedResult.answer.indexOf("> 回答已达到长度上限"),
  "The truncation notice should render outside the closed code fence.",
);
assert.ok(markdownLimitedResult.answer.length <= 120);
