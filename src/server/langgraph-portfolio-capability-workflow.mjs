import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { monotonicNowMs } from "./observability.mjs";

export const PORTFOLIO_CAPABILITY_GRAPH_VERSION = "portfolio-capability-graph@2026-07-02";

const PortfolioCapabilityState = Annotation.Root({
  user: Annotation(),
  payload: Annotation(),
  env: Annotation(),
  model: Annotation(),
  maxTokens: Annotation(),
  signal: Annotation(),
  candidatePortfolio: Annotation(),
  assessmentInput: Annotation(),
  baseline: Annotation(),
  capabilityAssessment: Annotation(),
  portfolio: Annotation(),
  response: Annotation(),
  completedNodes: Annotation(),
});

export function createPortfolioCapabilityGraph({
  loadPortfolio,
  assessDimensions,
  validateNoSchoolAdvice,
  saveAssessment,
  buildResponse,
  metrics = null,
  workflowVersion = PORTFOLIO_CAPABILITY_GRAPH_VERSION,
} = {}) {
  if (typeof loadPortfolio !== "function") {
    throw new TypeError("createPortfolioCapabilityGraph requires loadPortfolio.");
  }
  if (typeof assessDimensions !== "function") {
    throw new TypeError("createPortfolioCapabilityGraph requires assessDimensions.");
  }
  if (typeof validateNoSchoolAdvice !== "function") {
    throw new TypeError("createPortfolioCapabilityGraph requires validateNoSchoolAdvice.");
  }
  if (typeof saveAssessment !== "function") {
    throw new TypeError("createPortfolioCapabilityGraph requires saveAssessment.");
  }
  if (typeof buildResponse !== "function") {
    throw new TypeError("createPortfolioCapabilityGraph requires buildResponse.");
  }

  const graph = new StateGraph(PortfolioCapabilityState)
    .addNode("loadPortfolio", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "loadPortfolio" }, async () => ({
        ...(await loadPortfolio(state)),
        completedNodes: appendCompletedNode(state, "loadPortfolio"),
      })))
    .addNode("assessDimensions", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "assessDimensions" }, async () => ({
        capabilityAssessment: await assessDimensions(state),
        completedNodes: appendCompletedNode(state, "assessDimensions"),
      })))
    .addNode("validateNoSchoolAdvice", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "validateNoSchoolAdvice" }, async () => ({
        capabilityAssessment: await validateNoSchoolAdvice(state),
        completedNodes: appendCompletedNode(state, "validateNoSchoolAdvice"),
      })))
    .addNode("saveAssessment", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "saveAssessment" }, async () => ({
        portfolio: await saveAssessment(state),
        completedNodes: appendCompletedNode(state, "saveAssessment"),
      })))
    .addNode("finalizeResponse", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "finalizeResponse" }, async () => ({
        response: await buildResponse({ ...state, workflowVersion }),
        completedNodes: appendCompletedNode(state, "finalizeResponse"),
      })))
    .addEdge(START, "loadPortfolio")
    .addEdge("loadPortfolio", "assessDimensions")
    .addEdge("assessDimensions", "validateNoSchoolAdvice")
    .addEdge("validateNoSchoolAdvice", "saveAssessment")
    .addEdge("saveAssessment", "finalizeResponse")
    .addEdge("finalizeResponse", END)
    .compile();

  return {
    workflowVersion,
    async invoke(input = {}) {
      const startedAt = monotonicNowMs();
      try {
        const state = await graph.invoke({
          ...input,
          completedNodes: [],
        });
        metrics?.recordGraphWorkflow?.({
          workflow: workflowVersion,
          ok: true,
          reviewRequired: Boolean(state.response?.quality?.review?.required),
          durationMs: monotonicNowMs() - startedAt,
        });
        return state.response;
      } catch (error) {
        metrics?.recordGraphWorkflow?.({
          workflow: workflowVersion,
          ok: false,
          reviewRequired: false,
          durationMs: monotonicNowMs() - startedAt,
        });
        throw error;
      }
    },
  };
}

async function runObservedNode({ metrics, workflowVersion, node }, handler) {
  const startedAt = monotonicNowMs();
  try {
    const result = await handler();
    metrics?.recordGraphNode?.({
      workflow: workflowVersion,
      node,
      ok: true,
      durationMs: monotonicNowMs() - startedAt,
    });
    return result;
  } catch (error) {
    metrics?.recordGraphNode?.({
      workflow: workflowVersion,
      node,
      ok: false,
      durationMs: monotonicNowMs() - startedAt,
    });
    throw error;
  }
}

function appendCompletedNode(state, node) {
  return [...(state.completedNodes || []), node];
}
