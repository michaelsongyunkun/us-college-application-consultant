import {
  RETRIEVAL_MODES,
  createRetrievalQueryPlan,
  shouldUseKnowledgeGraph,
} from "../domain/retrieval-query-plan.mjs";
import { formatGraphFacts } from "../domain/admissions-knowledge-graph.mjs";
import { selectRelevantEvidence } from "../domain/retrieval-relevance.mjs";

const DEFAULT_MAX_GRAPH_CONTEXT_CHARS = 6_000;

export function createRetrievalOrchestrator({
  documentRetriever,
  knowledgeGraph = null,
  logger = null,
  maxGraphContextChars = DEFAULT_MAX_GRAPH_CONTEXT_CHARS,
} = {}) {
  if (!documentRetriever || typeof documentRetriever.retrieve !== "function") {
    throw new TypeError("createRetrievalOrchestrator requires documentRetriever.retrieve.");
  }

  return {
    async retrieve(input = {}) {
      const query = String(input.question || input.query || "").trim();
      const queryPlan = input.queryPlan || createRetrievalQueryPlan({
        query,
        taskType: input.taskType,
        assistantProfile: input.assistantProfile,
      });

      if (queryPlan.mode === RETRIEVAL_MODES.DIRECT) {
        return emptyDirectResult(queryPlan);
      }

      const documentPromise = documentRetriever.retrieve({ ...input, queryPlan });
      const graphPromise = shouldUseKnowledgeGraph(queryPlan) && knowledgeGraph?.search
        ? searchGraphSafely(knowledgeGraph, { ...input, query, queryPlan }, logger)
        : Promise.resolve(emptyGraphResult(knowledgeGraph ? "not-required" : "not-configured"));
      const [documentResult, graphResult] = await Promise.all([documentPromise, graphPromise]);
      return mergeGraphAndDocumentRetrieval({
        documentResult,
        graphResult,
        queryPlan,
        maxGraphContextChars,
      });
    },
  };
}

export function mergeGraphAndDocumentRetrieval({
  documentResult = {},
  graphResult = {},
  queryPlan = {},
  maxGraphContextChars = DEFAULT_MAX_GRAPH_CONTEXT_CHARS,
} = {}) {
  const documentContext = String(documentResult.context || "").trim();
  const graphSelection = selectGraphFacts(graphResult, documentResult);
  const selectedFacts = graphSelection.selected;
  const selectedFactIds = new Set(selectedFacts.flatMap((fact) => [fact.id, `kg:${fact.id}`]).filter(Boolean));
  const selectedGraphSourceIds = new Set(selectedFacts.map((fact) => fact.sourceId).filter(Boolean));
  const availableGraphSources = graphResult.sources || [];
  const hasExactFactSources = availableGraphSources.some((source) => selectedFactIds.has(source.id));
  const graphSources = availableGraphSources.filter((source) => (
    selectedFactIds.has(source.id)
    || (!hasExactFactSources && (
      selectedGraphSourceIds.has(source.id) || selectedGraphSourceIds.has(source.sourceId)
    ))
  ));
  const graphContext = formatGraphFacts(selectedFacts).slice(0, maxGraphContextChars);
  const context = [
    graphContext ? `--- Knowledge graph relationships ---\n${graphContext}` : "",
    documentContext ? `--- Retrieved document evidence ---\n${documentContext}` : "",
  ].filter(Boolean).join("\n\n");
  const sources = dedupeSources([
    ...(documentResult.sources || []),
    ...graphSources,
  ]);
  const documentRetrieval = documentResult.retrieval || {};
  const graphTraversal = graphResult.traversal || {};

  return {
    ...documentResult,
    context,
    sources,
    retrieval: {
      ...documentRetrieval,
      mode: queryPlan.mode,
      queryPlan: serializeQueryPlan(queryPlan),
      graph: {
        status: graphResult.status || (graphResult.adapter ? "applied" : "not-required"),
        adapter: graphResult.adapter || "",
        seedEntities: Array.isArray(graphTraversal.seedEntities) ? graphTraversal.seedEntities.length : 0,
        visitedEntities: Number(graphTraversal.visitedEntities || 0),
        selectedFacts: selectedFacts.length,
        maxDepth: Number(graphTraversal.maxDepth || 0),
        relevance: graphSelection.diagnostics,
      },
      selectedDocuments: sources.length,
    },
  };
}

function selectGraphFacts(graphResult = {}, documentResult = {}) {
  const documentSourceIds = new Set((documentResult.sources || []).map((source) => source.id));
  const candidates = (graphResult.facts || [])
    .filter((fact) => fact.queryAnchored
      || fact.evidenceAnchored
      || documentSourceIds.has(fact.sourceId))
    .map((fact) => ({
      ...fact,
      id: fact.id,
      type: "knowledge-graph",
      scope: "knowledge",
      channel: "graph",
      rawScore: Number(fact.score || fact.confidence || 0),
    }));
  return selectRelevantEvidence(candidates, { maxResults: 8 });
}

async function searchGraphSafely(knowledgeGraph, input, logger) {
  try {
    return await knowledgeGraph.search(input);
  } catch (error) {
    logger?.warn?.({
      event: "knowledge_graph_retrieval_fallback",
      errorName: error?.name || "Error",
    });
    return emptyGraphResult("fallback");
  }
}

function serializeQueryPlan(plan) {
  return {
    mode: plan.mode,
    taskType: plan.taskType,
    primaryIntent: plan.primaryIntent,
    intents: plan.intents || [],
    entities: plan.entities || [],
    constraints: plan.constraints || {},
    steps: plan.steps || [],
    reason: plan.reason || "",
  };
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = String(source?.id || source?.sourceId || source?.title || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyDirectResult(queryPlan) {
  return {
    context: "",
    sources: [],
    missingFields: [],
    retrieval: {
      mode: RETRIEVAL_MODES.DIRECT,
      queryPlan: serializeQueryPlan(queryPlan),
      graph: { status: "not-required", adapter: "", seedEntities: 0, visitedEntities: 0, selectedFacts: 0, maxDepth: 0 },
      selectedDocuments: 0,
      totalDocuments: 0,
    },
  };
}

function emptyGraphResult(status) {
  return {
    context: "",
    sources: [],
    facts: [],
    traversal: { seedEntities: [], visitedEntities: 0, selectedFacts: 0, maxDepth: 0 },
    status,
  };
}
