import assert from "node:assert/strict";
import {
  RAG_ANSWER_GRAPH_VERSION,
  createRagAnswerGraph,
} from "../src/server/langgraph-rag-workflow.mjs";

const nodeCalls = [];
const metricEvents = [];
const graph = createRagAnswerGraph({
  async retrieveSources(state) {
    nodeCalls.push(["retrieveSources", state.question]);
    return {
      context: "Retrieved context",
      sources: [{ id: "rag-1", type: "student-backup", title: "Student", snippet: "Robotics" }],
      retrieval: { intent: "general", selectedDocuments: 1, totalDocuments: 1 },
      missingFields: ["推荐信准备"],
    };
  },
  async draftAnswer(state) {
    nodeCalls.push(["draftAnswer", state.retrievalResult.context]);
    return "Graph drafted answer.";
  },
  async evaluateQuality(state) {
    nodeCalls.push(["evaluateQuality", state.workflowVersion]);
    return {
      metadata: {
        feature: "deepseek-rag",
        workflowVersion: state.workflowVersion,
      },
      review: { required: false },
    };
  },
  metrics: createMetricRecorder(metricEvents),
});

const response = await graph.invoke({
  user: { id: "student-1" },
  question: "Sensitive robotics question should not enter metrics.",
  historySummary: "",
  assistantProfile: "",
});

assert.equal(graph.workflowVersion, RAG_ANSWER_GRAPH_VERSION);
assert.deepEqual(nodeCalls, [
  ["retrieveSources", "Sensitive robotics question should not enter metrics."],
  ["draftAnswer", "Retrieved context"],
  ["evaluateQuality", RAG_ANSWER_GRAPH_VERSION],
]);
assert.equal(response.answer, "Graph drafted answer.");
assert.equal(response.sources[0].id, "rag-1");
assert.equal(response.missingFields[0], "推荐信准备");
assert.equal(response.retrieval.intent, "general");
assert.equal(response.quality.metadata.workflowVersion, RAG_ANSWER_GRAPH_VERSION);
assert.equal(metricEvents.filter((event) => event.kind === "node").length, 4);
assert.equal(metricEvents.filter((event) => event.kind === "workflow").length, 1);
assert.deepEqual(
  metricEvents
    .filter((event) => event.kind === "node")
    .map((event) => [event.workflow, event.node, event.ok]),
  [
    [RAG_ANSWER_GRAPH_VERSION, "retrieveSources", true],
    [RAG_ANSWER_GRAPH_VERSION, "draftAnswer", true],
    [RAG_ANSWER_GRAPH_VERSION, "evaluateQuality", true],
    [RAG_ANSWER_GRAPH_VERSION, "finalizeResponse", true],
  ],
);
assert.equal(metricEvents.at(-1).kind, "workflow");
assert.equal(metricEvents.at(-1).ok, true);
assert.equal(metricEvents.at(-1).reviewRequired, false);
assert.equal(JSON.stringify(metricEvents).includes("Sensitive robotics question"), false);
assert.equal(JSON.stringify(metricEvents).includes("Retrieved context"), false);

const failedMetricEvents = [];
const failedGraph = createRagAnswerGraph({
  async retrieveSources() {
    return {
      context: "Private retrieved context",
      sources: [],
      retrieval: { intent: "general" },
      missingFields: [],
    };
  },
  async draftAnswer() {
    throw new Error("Draft failure with private context should not enter metrics.");
  },
  async evaluateQuality() {
    return { review: { required: false } };
  },
  metrics: createMetricRecorder(failedMetricEvents),
});

await assert.rejects(
  () => failedGraph.invoke({ question: "Private failing question" }),
  /Draft failure/,
);
assert.deepEqual(
  failedMetricEvents.map((event) => [event.kind, event.node || "", event.ok]),
  [
    ["node", "retrieveSources", true],
    ["node", "draftAnswer", false],
    ["workflow", "", false],
  ],
);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private retrieved context"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private failing question"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("Draft failure"), false);

assert.throws(
  () => createRagAnswerGraph({ draftAnswer() {}, evaluateQuality() {} }),
  /retrieveSources/,
);

function createMetricRecorder(events) {
  return {
    recordGraphNode(event) {
      events.push({ kind: "node", ...event });
    },
    recordGraphWorkflow(event) {
      events.push({ kind: "workflow", ...event });
    },
  };
}
