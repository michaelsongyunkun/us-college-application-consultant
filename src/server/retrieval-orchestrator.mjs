import {
  RETRIEVAL_MODES,
  createRetrievalQueryPlan,
  shouldUseKnowledgeGraph,
} from "../domain/retrieval-query-plan.mjs";
import { formatGraphFacts } from "../domain/admissions-knowledge-graph.mjs";
import { selectRelevantEvidence } from "../domain/retrieval-relevance.mjs";

const DEFAULT_MAX_GRAPH_CONTEXT_CHARS = 6_000;
const KNOWLEDGE_VISIBLE_SOURCE_LIMIT = 8;
const PERSONALIZED_VISIBLE_SOURCE_LIMIT = 9;
const APPLICATION_GRAPH_FACT_LIMIT = 6;
const DEEP_GRAPH_FACT_LIMIT = 8;
const APPLICATION_KNOWLEDGE_CONTEXT_LIMIT = 18_000;
const APPLICATION_PERSONALIZED_CONTEXT_LIMIT = 20_000;
const DEEP_CONTEXT_LIMIT = 22_000;

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
        maxVisibleSources: input.usePersonalContext === true
          ? PERSONALIZED_VISIBLE_SOURCE_LIMIT
          : KNOWLEDGE_VISIBLE_SOURCE_LIMIT,
        maxGraphFacts: getGraphFactLimit(queryPlan),
        maxCombinedContextChars: getCombinedContextLimit(queryPlan, input.usePersonalContext === true),
      });
    },
  };
}

export function mergeGraphAndDocumentRetrieval({
  documentResult = {},
  graphResult = {},
  queryPlan = {},
  maxGraphContextChars = DEFAULT_MAX_GRAPH_CONTEXT_CHARS,
  maxVisibleSources = null,
  maxGraphFacts = null,
  maxCombinedContextChars = null,
} = {}) {
  const documentContext = String(documentResult.context || "").trim();
  const graphSelection = selectGraphFacts(graphResult, documentResult, {
    maxResults: Number.isInteger(maxGraphFacts) && maxGraphFacts > 0
      ? maxGraphFacts
      : getGraphFactLimit(queryPlan),
  });
  const selectedFacts = selectGraphFactsForContext(
    graphSelection.selected,
    maxGraphContextChars,
  );
  const selectedFactIds = new Set(selectedFacts.flatMap((fact) => [fact.id, `kg:${fact.id}`]).filter(Boolean));
  const selectedGraphSourceIds = new Set(selectedFacts.map((fact) => fact.sourceId).filter(Boolean));
  const availableGraphSources = graphResult.sources || [];
  const hasExactFactSources = availableGraphSources.some((source) => selectedFactIds.has(source.id));
  const graphSources = dedupeGraphSources(availableGraphSources.filter((source) => (
    selectedFactIds.has(source.id)
    || (!hasExactFactSources && (
      selectedGraphSourceIds.has(source.id) || selectedGraphSourceIds.has(source.sourceId)
    ))
  )));
  const graphContext = formatGraphFacts(selectedFacts);
  const contextLimit = Number.isInteger(maxCombinedContextChars) && maxCombinedContextChars > 0
    ? maxCombinedContextChars
    : getCombinedContextLimit(queryPlan, false);
  const contextSelection = composeRetrievalContext({ graphContext, documentContext, maxChars: contextLimit });
  const context = contextSelection.context;
  const documentSources = dedupeSources(documentResult.sources || []);
  const contextAlignedDocumentSources = contextSelection.totalDocumentSections === documentSources.length
    ? contextSelection.includedDocumentIndexes.map((index) => documentSources[index]).filter(Boolean)
    : documentSources;
  const inferredSourceLimit = documentSources.some((source) => source.scope === "personal")
    ? PERSONALIZED_VISIBLE_SOURCE_LIMIT
    : KNOWLEDGE_VISIBLE_SOURCE_LIMIT;
  const sourceLimit = Number.isInteger(maxVisibleSources) && maxVisibleSources > 0
    ? maxVisibleSources
    : inferredSourceLimit;
  const documentSourceLimit = graphSources.length
    ? Math.max(0, sourceLimit - 1)
    : sourceLimit;
  const visibleDocumentSources = contextAlignedDocumentSources.slice(0, documentSourceLimit);
  const sources = dedupeSources([
    ...visibleDocumentSources,
    ...graphSources.slice(0, Math.max(0, sourceLimit - visibleDocumentSources.length)),
  ]).slice(0, sourceLimit);
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
      selectedSourceCounts: {
        byType: countSourcesBy(sources, (source) => source.type || "unknown"),
        byScope: countSourcesBy(sources, (source) => source.scope || "knowledge"),
      },
      contextCharacters: {
        document: contextSelection.documentCharacters,
        graph: contextSelection.graphCharacters,
        combined: context.length,
        limit: contextLimit,
      },
    },
  };
}

function selectGraphFacts(graphResult = {}, documentResult = {}, { maxResults = DEEP_GRAPH_FACT_LIMIT } = {}) {
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
  return selectRelevantEvidence(candidates, { maxResults });
}

function getGraphFactLimit(queryPlan = {}) {
  return ["major-match", "school-selection"].includes(queryPlan.taskType)
    ? DEEP_GRAPH_FACT_LIMIT
    : APPLICATION_GRAPH_FACT_LIMIT;
}

function getCombinedContextLimit(queryPlan = {}, usePersonalContext = false) {
  if (["major-match", "school-selection"].includes(queryPlan.taskType)) return DEEP_CONTEXT_LIMIT;
  return usePersonalContext ? APPLICATION_PERSONALIZED_CONTEXT_LIMIT : APPLICATION_KNOWLEDGE_CONTEXT_LIMIT;
}

function composeRetrievalContext({ graphContext = "", documentContext = "", maxChars }) {
  const graphPrefix = "--- Knowledge graph relationships ---\n";
  const documentPrefix = "--- Retrieved document evidence ---\n";
  const graphSection = graphContext && graphPrefix.length + graphContext.length <= maxChars
    ? `${graphPrefix}${graphContext}`
    : "";
  const separatorLength = graphSection && documentContext ? 2 : 0;
  const availableDocumentChars = Math.max(
    0,
    maxChars - graphSection.length - separatorLength - (documentContext ? documentPrefix.length : 0),
  );
  const documentSelection = selectCompleteContextSections(documentContext, availableDocumentChars);
  const visibleDocumentContext = documentSelection.context;
  const documentSection = visibleDocumentContext ? `${documentPrefix}${visibleDocumentContext}` : "";
  return {
    context: [graphSection, documentSection].filter(Boolean).join("\n\n"),
    graphCharacters: graphSection ? Math.max(0, graphSection.length - graphPrefix.length) : 0,
    documentCharacters: visibleDocumentContext.length,
    includedDocumentIndexes: documentSelection.includedIndexes,
    totalDocumentSections: documentSelection.totalSections,
  };
}

function selectGraphFactsForContext(facts, maxChars) {
  const selected = [];
  for (const fact of facts || []) {
    const next = [...selected, fact];
    if (formatGraphFacts(next).length <= maxChars) selected.push(fact);
  }
  return selected;
}

function selectCompleteContextSections(context, maxChars) {
  const normalized = String(context || "").trim();
  if (!normalized || maxChars <= 0) {
    return { context: "", includedIndexes: [], totalSections: normalized ? 1 : 0 };
  }
  const sections = normalized.split("\n\n---\n\n");
  const included = [];
  const includedIndexes = [];
  let usedChars = 0;
  for (const [index, section] of sections.entries()) {
    const separatorChars = included.length ? 7 : 0;
    if (usedChars + separatorChars + section.length > maxChars) continue;
    included.push(section);
    includedIndexes.push(index);
    usedChars += separatorChars + section.length;
  }
  return {
    context: included.join("\n\n---\n\n"),
    includedIndexes,
    totalSections: sections.length,
  };
}

function countSourcesBy(sources, keyFor) {
  return sources.reduce((counts, source) => {
    const key = String(keyFor(source) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
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

function dedupeGraphSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = String(source?.sourceId || source?.id || source?.title || "").trim();
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
