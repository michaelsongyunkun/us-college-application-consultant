import assert from "node:assert/strict";
import {
  SCHOOL_SELECTION_GRAPH_VERSION,
  createSchoolSelectionGraph,
} from "../src/server/langgraph-school-selection-workflow.mjs";

const nodeCalls = [];
const metricEvents = [];
const graph = createSchoolSelectionGraph({
  async loadContext(state) {
    nodeCalls.push(["loadContext", state.input.targetMajor]);
    return {
      portfolio: {
        activities: [{ activityName: "Private Robotics Lab" }],
      },
      ragSources: [{ id: "school-1", type: "school-encyclopedia", title: "Private School Source" }],
      friendlinessIndex: new Map(),
      ragContext: "Private school context",
    };
  },
  async draftSelection(state) {
    nodeCalls.push(["draftSelection", state.ragContext]);
    return {
      answer: "Private draft answer",
      validatedSelection: {
        summary: "Balanced school list",
        rounds: { ed1: [], rea: [], ed2: [], ea: [], rd: [], uc: [] },
      },
      attempts: 1,
    };
  },
  async calibrateSelection(state) {
    nodeCalls.push(["calibrateSelection", state.validatedSelection.summary]);
    return {
      ...state.validatedSelection,
      calibrated: true,
    };
  },
  async evaluateQuality(state) {
    nodeCalls.push(["evaluateQuality", state.workflowVersion]);
    return {
      metadata: {
        workflowVersion: state.workflowVersion,
      },
      review: { required: false },
    };
  },
  async buildResponse(state) {
    nodeCalls.push(["finalizeResponse", state.workflowVersion]);
    return {
      selection: state.selection,
      selectionVersion: state.input.strategyMode,
      ragSources: state.ragSources,
      attempts: state.attempts,
      quality: state.quality,
    };
  },
  metrics: createMetricRecorder(metricEvents),
});

const response = await graph.invoke({
  input: {
    targetMajor: "Private Data Science",
    strategyMode: "均衡版",
  },
});

assert.equal(graph.workflowVersion, SCHOOL_SELECTION_GRAPH_VERSION);
assert.deepEqual(nodeCalls, [
  ["loadContext", "Private Data Science"],
  ["draftSelection", "Private school context"],
  ["calibrateSelection", "Balanced school list"],
  ["evaluateQuality", SCHOOL_SELECTION_GRAPH_VERSION],
  ["finalizeResponse", SCHOOL_SELECTION_GRAPH_VERSION],
]);
assert.equal(response.selection.calibrated, true);
assert.equal(response.selectionVersion, "均衡版");
assert.equal(response.quality.metadata.workflowVersion, SCHOOL_SELECTION_GRAPH_VERSION);
assert.equal(metricEvents.filter((event) => event.kind === "node").length, 5);
assert.equal(metricEvents.filter((event) => event.kind === "workflow").length, 1);
assert.deepEqual(
  metricEvents
    .filter((event) => event.kind === "node")
    .map((event) => [event.workflow, event.node, event.ok]),
  [
    [SCHOOL_SELECTION_GRAPH_VERSION, "loadContext", true],
    [SCHOOL_SELECTION_GRAPH_VERSION, "draftSelection", true],
    [SCHOOL_SELECTION_GRAPH_VERSION, "calibrateSelection", true],
    [SCHOOL_SELECTION_GRAPH_VERSION, "evaluateQuality", true],
    [SCHOOL_SELECTION_GRAPH_VERSION, "finalizeResponse", true],
  ],
);
assert.equal(metricEvents.at(-1).kind, "workflow");
assert.equal(metricEvents.at(-1).ok, true);
assert.equal(metricEvents.at(-1).reviewRequired, false);
assert.equal(JSON.stringify(metricEvents).includes("Private Robotics Lab"), false);
assert.equal(JSON.stringify(metricEvents).includes("Private school context"), false);
assert.equal(JSON.stringify(metricEvents).includes("Private Data Science"), false);

const failedMetricEvents = [];
const failedGraph = createSchoolSelectionGraph({
  async loadContext() {
    return {
      portfolio: {},
      ragSources: [],
      friendlinessIndex: new Map(),
      ragContext: "Private failing context",
    };
  },
  async draftSelection() {
    throw new Error("School selection draft failed with private context.");
  },
  async calibrateSelection(state) {
    return state.validatedSelection;
  },
  async evaluateQuality() {
    return { review: { required: false } };
  },
  async buildResponse() {
    return {};
  },
  metrics: createMetricRecorder(failedMetricEvents),
});

await assert.rejects(
  () => failedGraph.invoke({ input: { targetMajor: "Private Failing Major" } }),
  /School selection draft failed/,
);
assert.deepEqual(
  failedMetricEvents.map((event) => [event.kind, event.node || "", event.ok]),
  [
    ["node", "loadContext", true],
    ["node", "draftSelection", false],
    ["workflow", "", false],
  ],
);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private failing context"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private Failing Major"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("School selection draft failed"), false);

assert.throws(
  () => createSchoolSelectionGraph({
    draftSelection() {},
    calibrateSelection() {},
    evaluateQuality() {},
    buildResponse() {},
  }),
  /loadContext/,
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
