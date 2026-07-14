import { createRagRetriever } from "../server/deepseek-rag-service.mjs";
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
      const search = () => hybrid.search(input.question, { limit: 8, embeddingModelVersion: embeddingClient?.modelVersion || "" });
      const rerankerProvider = rerankerClient?.provider || "disabled";
      const rerankerModelVersion = rerankerClient?.modelVersion || "";
      const cached = retrievalCache
        ? await retrievalCache.getOrLoad({
          query: input.question,
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
      const merged = mergePostgresRetrieval({ baselineResult, postgresResults: postgresResult.results });
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
  maxContextChars = 26_000,
  maxPostgresContextChars = 8_000,
  maxPostgresSources = 8,
}: any) {
  const baselineContext = String(baselineResult.context || "");
  const baselineSources = baselineResult.sources || [];
  const seen = new Set(baselineSources.map((source: any) => source.id));
  const separator = "\n\n--- PostgreSQL hybrid retrieval ---\n\n";
  const availableChars = Math.max(0, Math.min(
    maxPostgresContextChars,
    maxContextChars - baselineContext.length - separator.length,
  ));
  const selectedResults: any[] = [];
  const sections: string[] = [];
  let usedChars = 0;

  for (const result of postgresResults) {
    if (selectedResults.length >= maxPostgresSources || seen.has(result.id)) continue;
    const block = `[PG-${selectedResults.length + 1}] ${result.title}\n${String(result.content || "").trim()}`;
    const separatorChars = sections.length ? 7 : 0;
    if (usedChars + separatorChars + block.length > availableChars) continue;
    sections.push(block);
    selectedResults.push(result);
    seen.add(result.id);
    usedChars += separatorChars + block.length;
  }

  const knowledgeContext = sections.join("\n\n---\n\n");
  const knowledgeSources = selectedResults.map(serializeKnowledgeSource);
  return {
    ...baselineResult,
    context: knowledgeContext ? `${baselineContext}${separator}${knowledgeContext}` : baselineContext,
    sources: [...baselineSources, ...knowledgeSources],
    retrieval: {
      ...baselineResult.retrieval,
      postgresDocuments: postgresResults.length,
      postgresSelectedDocuments: selectedResults.length,
      selectedDocuments: (baselineResult.retrieval?.selectedDocuments || baselineSources.length) + selectedResults.length,
    },
  };
}

function serializeKnowledgeSource(source: any) {
  return {
    id: source.id,
    type: source.sourceType,
    typeLabel: source.sourceType,
    title: source.title,
    snippet: String(source.content || "").slice(0, 1_200),
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    sourceVersion: source.sourceVersion,
    updatedAt: source.updatedAt,
    confidence: source.confidence,
    officialUrl: source.officialUrl,
    embeddingModelVersion: source.embeddingModelVersion,
  };
}
