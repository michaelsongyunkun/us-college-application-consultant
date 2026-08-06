import {
  buildContextSelection,
  createRagRetriever,
  serializeRagSource,
} from "../server/deepseek-rag-service.mjs";
import { selectRelevantEvidence } from "../domain/retrieval-relevance.mjs";
import { createHybridRetriever } from "./hybrid-retriever.js";
import { createPostgresKnowledgeRepository } from "./markdown-ingestion.js";

export function createPostgresRagRetriever({ pool, root, planning, activityPortfolio, embeddingClient = null, rerankerClient = null, retrievalCache = null, knowledgeVersion = "", metrics = null, logger = null }: any) {
  const knowledge = createPostgresKnowledgeRepository({ pool });
  const baseline = createRagRetriever({ root, planning, activityPortfolio, metrics });
  const hybrid = createHybridRetriever({
    keywordSearch: (query: string, options: any) => knowledge.keywordSearch(query, options),
    vectorSearch: async (query: string, options: any) => {
      if (!embeddingClient) throw new Error("Vector service is not configured");
      const [embedding] = await embeddingClient.embed([query]);
      return knowledge.vectorSearch(embedding, { ...options, embeddingModelVersion: embeddingClient.modelVersion });
    },
    rerank: rerankerClient ? (query: string, candidates: any[], options: any) => rerankerClient.rerank(query, candidates, options) : null,
    rerankCandidateLimit: rerankerClient?.candidateLimit || 24,
    logger,
  });

  return {
    async retrieve(input: any) {
      const baselineResult = await baseline.retrieve(input);
      const retrievalQuery = resolvePostgresRetrievalQuery(input, baselineResult);
      const search = () => hybrid.search(retrievalQuery, { limit: 8, embeddingModelVersion: embeddingClient?.modelVersion || "" });
      const rerankerProvider = rerankerClient?.provider || "disabled";
      const rerankerModelVersion = rerankerClient?.modelVersion || "";
      const cached = retrievalCache
        ? await retrievalCache.getOrLoad({
          query: retrievalQuery,
          variant: [
            knowledgeVersion || "unversioned",
            embeddingClient?.modelVersion || "keyword-only",
            rerankerProvider,
            rerankerModelVersion || "no-reranker-model",
            `candidates-${rerankerClient?.candidateLimit || 24}`,
          ].join(":"),
        }, search)
        : { value: await search(), status: "disabled" };
      const postgresResult = cached.value;
      if (!postgresResult.results.length) {
        return {
          ...baselineResult,
          retrieval: {
            ...baselineResult.retrieval,
            infrastructureMode: postgresResult.mode,
            ...postgresResult.retrieval,
            rerankerProvider,
            rerankerModelVersion,
            retrievalCache: cached.status,
          },
        };
      }
      const merged = mergePostgresRetrieval({ baselineResult, postgresResults: postgresResult.results, maxSources: 8 });
      return {
        ...merged,
        retrieval: {
          ...merged.retrieval,
          infrastructureMode: postgresResult.mode,
          ...postgresResult.retrieval,
          rerankerProvider,
          rerankerModelVersion,
          retrievalCache: cached.status,
        },
      };
    },
  };
}

export function mergePostgresRetrieval({
  baselineResult,
  postgresResults,
  maxSources = 8,
  maxContextChars = 18_000,
}: any) {
  const baselineCandidates = Array.isArray(baselineResult.candidates)
    ? baselineResult.candidates
    : (baselineResult.sources || []).map((source: any, index: number) => ({
        id: source.id,
        type: source.type,
        scope: source.scope || "knowledge",
        title: source.title,
        text: source.snippet || "",
        channel: "local-keyword",
        rawScore: Math.max(1, (baselineResult.sources || []).length - index),
      }));
  const allowedKnowledgeTypes = Array.isArray(baselineResult.allowedKnowledgeTypes)
    ? new Set(baselineResult.allowedKnowledgeTypes.map((type: any) => String(type || "").trim()).filter(Boolean))
    : null;
  const postgresCandidates = (postgresResults || [])
    .filter((source: any) => !allowedKnowledgeTypes || allowedKnowledgeTypes.has(String(source.sourceType || "")))
    .map((source: any, index: number) => ({
      id: source.id,
      type: source.sourceType,
      scope: "knowledge",
      title: source.title,
      text: String(source.content || "").trim(),
      channel: "postgres-hybrid",
      rawScore: resolvePostgresCandidateScore(source, index),
      metadata: source,
    }));
  const hasPersonalCandidates = baselineCandidates.some((candidate: any) => candidate.scope === "personal");
  const knowledgeLimit = hasPersonalCandidates ? Math.min(6, maxSources) : maxSources;
  const selection = selectRelevantEvidence(
    [...baselineCandidates, ...postgresCandidates],
    {
      maxResults: knowledgeLimit + (hasPersonalCandidates ? 3 : 0),
      scopeLimits: { knowledge: knowledgeLimit, personal: hasPersonalCandidates ? 3 : 0 },
    },
  );
  const contextSelection = buildContextSelection(selection.selected, maxContextChars);
  return {
    ...baselineResult,
    context: contextSelection.context,
    candidates: selection.selected,
    sources: contextSelection.included.map(serializeRagSource),
    retrieval: {
      ...baselineResult.retrieval,
      postgresDocuments: postgresResults.length,
      postgresSelectedDocuments: contextSelection.included.filter((item: any) => item.channel === "postgres-hybrid").length,
      selectedDocuments: contextSelection.included.length,
      relevance: selection.diagnostics,
    },
  };
}

export function resolvePostgresRetrievalQuery(input: any = {}, baselineResult: any = {}) {
  return String(baselineResult.searchQuery || input.question || input.query || "").trim();
}

function resolvePostgresCandidateScore(source: any, index: number) {
  const rerankScore = Number(source?.rerankScore);
  if (Number.isFinite(rerankScore)) return Math.max(0, rerankScore);
  const retrievalScore = Number(source?.score);
  return retrievalScore > 0 ? retrievalScore : 1 / (index + 1);
}
