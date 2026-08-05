import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { monotonicNowMs } from "./observability.mjs";

export const RAG_ANSWER_GRAPH_VERSION = "rag-answer-graph@2026-08-03";

const RagAnswerState = Annotation.Root({
  user: Annotation(),
  question: Annotation(),
  historySummary: Annotation(),
  assistantProfile: Annotation(),
  usePersonalContext: Annotation(),
  env: Annotation(),
  model: Annotation(),
  signal: Annotation(),
  retrievalResult: Annotation(),
  answer: Annotation(),
  outputDiagnostics: Annotation(),
  quality: Annotation(),
  response: Annotation(),
  completedNodes: Annotation(),
});

export function createRagAnswerGraph({
  retrieveSources,
  draftAnswer,
  evaluateQuality,
  metrics = null,
  workflowVersion = RAG_ANSWER_GRAPH_VERSION,
} = {}) {
  if (typeof retrieveSources !== "function") {
    throw new TypeError("createRagAnswerGraph requires retrieveSources.");
  }
  if (typeof draftAnswer !== "function") {
    throw new TypeError("createRagAnswerGraph requires draftAnswer.");
  }
  if (typeof evaluateQuality !== "function") {
    throw new TypeError("createRagAnswerGraph requires evaluateQuality.");
  }

  const graph = new StateGraph(RagAnswerState)
    .addNode("retrieveSources", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "retrieveSources" }, async () => ({
        retrievalResult: await retrieveSources(state),
        completedNodes: appendCompletedNode(state, "retrieveSources"),
      })))
    .addNode("draftAnswer", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "draftAnswer" }, async () => ({
        ...normalizeDraftAnswer(await draftAnswer(state)),
        completedNodes: appendCompletedNode(state, "draftAnswer"),
      })))
    .addNode("evaluateQuality", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "evaluateQuality" }, async () => ({
        quality: await evaluateQuality({ ...state, workflowVersion }),
        completedNodes: appendCompletedNode(state, "evaluateQuality"),
      })))
    .addNode("finalizeResponse", (state) =>
      runObservedNode({ metrics, workflowVersion, node: "finalizeResponse" }, async () => ({
        response: finalizeRagAnswerResponse(state),
        completedNodes: appendCompletedNode(state, "finalizeResponse"),
      })))
    .addEdge(START, "retrieveSources")
    .addEdge("retrieveSources", "draftAnswer")
    .addEdge("draftAnswer", "evaluateQuality")
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

function normalizeDraftAnswer(result) {
  if (result && typeof result === "object" && Object.hasOwn(result, "answer")) {
    return {
      answer: String(result.answer || ""),
      outputDiagnostics: result.outputDiagnostics || {},
    };
  }
  return { answer: String(result || ""), outputDiagnostics: {} };
}

function finalizeRagAnswerResponse(state) {
  const retrievalResult = state.retrievalResult || {};
  return {
    answer: state.answer,
    sources: retrievalResult.sources || [],
    missingFields: retrievalResult.missingFields || [],
    retrieval: retrievalResult.retrieval || {},
    quality: state.quality,
  };
}
