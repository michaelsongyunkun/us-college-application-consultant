import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { monotonicNowMs } from "./observability.mjs";

export const SCHOOL_SELECTION_GRAPH_VERSION = "school-selection-graph@2026-07-02";

const SchoolSelectionState = Annotation.Root({
  user: Annotation(),
  input: Annotation(),
  env: Annotation(),
  model: Annotation(),
  maxTokens: Annotation(),
  portfolio: Annotation(),
  ragSources: Annotation(),
  friendlinessIndex: Annotation(),
  ragContext: Annotation(),
  answer: Annotation(),
  validatedSelection: Annotation(),
  selection: Annotation(),
  attempts: Annotation(),
  quality: Annotation(),
  response: Annotation(),
  completedNodes: Annotation(),
});

export function createSchoolSelectionGraph({
  loadContext,
  draftSelection,
  calibrateSelection,
  evaluateQuality,
  buildResponse,
  metrics = null,
  workflowVersion = SCHOOL_SELECTION_GRAPH_VERSION,
} = {}) {
  if (typeof loadContext !== "function") {
    throw new TypeError("createSchoolSelectionGraph requires loadContext.");
  }
  if (typeof draftSelection !== "function") {
    throw new TypeError("createSchoolSelectionGraph requires draftSelection.");
  }
  if (typeof calibrateSelection !== "function") {
    throw new TypeError("createSchoolSelectionGraph requires calibrateSelection.");
  }
  if (typeof evaluateQuality !== "function") {
    throw new TypeError("createSchoolSelectionGraph requires evaluateQuality.");
  }
  if (typeof buildResponse !== "function") {
    throw new TypeError("createSchoolSelectionGraph requires buildResponse.");
  }

  const graph = new StateGraph(SchoolSelectionState)
    .addNode("loadContext", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "loadContext" }, async () => ({
        ...(await loadContext(state)),
        completedNodes: appendCompletedNode(state, "loadContext"),
      })))
    .addNode("draftSelection", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "draftSelection" }, async () => ({
        ...(await draftSelection(state)),
        completedNodes: appendCompletedNode(state, "draftSelection"),
      })))
    .addNode("calibrateSelection", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "calibrateSelection" }, async () => ({
        selection: await calibrateSelection(state),
        completedNodes: appendCompletedNode(state, "calibrateSelection"),
      })))
    .addNode("evaluateQuality", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "evaluateQuality" }, async () => ({
        quality: await evaluateQuality({ ...state, workflowVersion }),
        completedNodes: appendCompletedNode(state, "evaluateQuality"),
      })))
    .addNode("finalizeResponse", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "finalizeResponse" }, async () => ({
        response: await buildResponse({ ...state, workflowVersion }),
        completedNodes: appendCompletedNode(state, "finalizeResponse"),
      })))
    .addEdge(START, "loadContext")
    .addEdge("loadContext", "draftSelection")
    .addEdge("draftSelection", "calibrateSelection")
    .addEdge("calibrateSelection", "evaluateQuality")
    .addEdge("evaluateQuality", "finalizeResponse")
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
