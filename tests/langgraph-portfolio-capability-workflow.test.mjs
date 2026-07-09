import assert from "node:assert/strict";
import {
  PORTFOLIO_CAPABILITY_GRAPH_VERSION,
  createPortfolioCapabilityGraph,
} from "../src/server/langgraph-portfolio-capability-workflow.mjs";

const nodeCalls = [];
const metricEvents = [];
const graph = createPortfolioCapabilityGraph({
  async loadPortfolio(state) {
    nodeCalls.push(["loadPortfolio", state.user.id]);
    return {
      candidatePortfolio: {
        activities: [{ activityName: "Private Robotics Lab" }],
      },
      assessmentInput: {
        activities: [{ activityName: "Private Robotics Lab" }],
      },
      baseline: {
        overallScore: 74,
      },
    };
  },
  async assessDimensions(state) {
    nodeCalls.push(["assessDimensions", state.assessmentInput.activities[0].activityName]);
    return {
      generatedBy: "deepseek-capability-agent",
      overallScore: state.baseline.overallScore,
      radarScores: [],
    };
  },
  async validateNoSchoolAdvice(state) {
    nodeCalls.push(["validateNoSchoolAdvice", state.capabilityAssessment.generatedBy]);
    return state.capabilityAssessment;
  },
  async saveAssessment(state) {
    nodeCalls.push(["saveAssessment", state.candidatePortfolio.activities[0].activityName]);
    return {
      ...state.candidatePortfolio,
      capabilityAssessment: state.capabilityAssessment,
    };
  },
  async buildResponse(state) {
    nodeCalls.push(["finalizeResponse", state.workflowVersion]);
    return {
      capabilityAssessment: state.portfolio.capabilityAssessment,
      portfolio: state.portfolio,
      quality: {
        metadata: {
          workflowVersion: state.workflowVersion,
        },
        review: { required: false },
      },
    };
  },
  metrics: createMetricRecorder(metricEvents),
});

const response = await graph.invoke({
  user: { id: "private-student-1" },
  payload: { activities: [{ activityName: "Private Payload Activity" }] },
});

assert.equal(graph.workflowVersion, PORTFOLIO_CAPABILITY_GRAPH_VERSION);
assert.deepEqual(nodeCalls, [
  ["loadPortfolio", "private-student-1"],
  ["assessDimensions", "Private Robotics Lab"],
  ["validateNoSchoolAdvice", "deepseek-capability-agent"],
  ["saveAssessment", "Private Robotics Lab"],
  ["finalizeResponse", PORTFOLIO_CAPABILITY_GRAPH_VERSION],
]);
assert.equal(response.capabilityAssessment.generatedBy, "deepseek-capability-agent");
assert.equal(response.portfolio.capabilityAssessment.overallScore, 74);
assert.equal(response.quality.metadata.workflowVersion, PORTFOLIO_CAPABILITY_GRAPH_VERSION);
assert.equal(metricEvents.filter((event) => event.kind === "node").length, 5);
assert.equal(metricEvents.filter((event) => event.kind === "workflow").length, 1);
assert.deepEqual(
  metricEvents
    .filter((event) => event.kind === "node")
    .map((event) => [event.workflow, event.node, event.ok]),
  [
    [PORTFOLIO_CAPABILITY_GRAPH_VERSION, "loadPortfolio", true],
    [PORTFOLIO_CAPABILITY_GRAPH_VERSION, "assessDimensions", true],
    [PORTFOLIO_CAPABILITY_GRAPH_VERSION, "validateNoSchoolAdvice", true],
    [PORTFOLIO_CAPABILITY_GRAPH_VERSION, "saveAssessment", true],
    [PORTFOLIO_CAPABILITY_GRAPH_VERSION, "finalizeResponse", true],
  ],
);
assert.equal(metricEvents.at(-1).kind, "workflow");
assert.equal(metricEvents.at(-1).ok, true);
assert.equal(metricEvents.at(-1).reviewRequired, false);
assert.equal(JSON.stringify(metricEvents).includes("Private Robotics Lab"), false);
assert.equal(JSON.stringify(metricEvents).includes("Private Payload Activity"), false);

const failedMetricEvents = [];
const failedGraph = createPortfolioCapabilityGraph({
  async loadPortfolio() {
    return {
      candidatePortfolio: {
        activities: [{ activityName: "Private Failed Activity" }],
      },
      assessmentInput: {
        activities: [{ activityName: "Private Failed Activity" }],
      },
      baseline: {},
    };
  },
  async assessDimensions() {
    throw new Error("Capability draft failed with private activity.");
  },
  async validateNoSchoolAdvice(state) {
    return state.capabilityAssessment;
  },
  async saveAssessment(state) {
    return state.candidatePortfolio;
  },
  async buildResponse() {
    return {};
  },
  metrics: createMetricRecorder(failedMetricEvents),
});

await assert.rejects(
  () => failedGraph.invoke({ payload: { activities: [{ activityName: "Private Failed Payload" }] } }),
  /Capability draft failed/,
);
assert.deepEqual(
  failedMetricEvents.map((event) => [event.kind, event.node || "", event.ok]),
  [
    ["node", "loadPortfolio", true],
    ["node", "assessDimensions", false],
    ["workflow", "", false],
  ],
);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private Failed Activity"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("Private Failed Payload"), false);
assert.equal(JSON.stringify(failedMetricEvents).includes("Capability draft failed"), false);

assert.throws(
  () => createPortfolioCapabilityGraph({
    assessDimensions() {},
    validateNoSchoolAdvice() {},
    saveAssessment() {},
    buildResponse() {},
  }),
  /loadPortfolio/,
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
