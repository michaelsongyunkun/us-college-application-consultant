export function reciprocalRankFusion(resultSets: any[][], { rankConstant = 60, weights = [] as number[] } = {}) {
  const fused = new Map<string, any>();
  resultSets.forEach((results, setIndex) => {
    const weight = weights[setIndex] ?? 1;
    results.forEach((result, rank) => {
      const current = fused.get(result.id) || { ...result, score: 0, channels: [], primaryRank: Number.POSITIVE_INFINITY };
      current.score += weight / (rankConstant + rank + 1);
      current.channels.push({ setIndex, rank: rank + 1, originalScore: result.score });
      if (setIndex === 0) current.primaryRank = rank + 1;
      fused.set(result.id, current);
    });
  });
  return [...fused.values()].sort((left, right) => right.score - left.score || left.primaryRank - right.primaryRank || String(left.id).localeCompare(String(right.id)));
}

export function createHybridRetriever({
  vectorSearch,
  keywordSearch,
  logger = null,
  candidateMultiplier = 6,
  minCandidates = 40,
  rrfRankConstant = 50,
  rrfWeights = [1, 1.1],
  rerank = null,
  rerankCandidateLimit = 24,
}: any) {
  return {
    async search(query: string, { limit = 8, filters = {}, embeddingModelVersion = "" } = {}) {
      const candidateLimit = Math.max(limit * candidateMultiplier, minCandidates);
      const keywordPromise = keywordSearch(query, { limit: candidateLimit, filters });
      let vectorResults: any[];
      let keywordResults: any[];
      try {
        [vectorResults, keywordResults] = await Promise.all([
          vectorSearch(query, { limit: candidateLimit, filters, embeddingModelVersion }),
          keywordPromise,
        ]);
      } catch (error) {
        logger?.warn?.({ event: "vector_search_fallback", errorName: error?.name || "Error" });
        const keywordResults = await keywordPromise;
        const retrieval = {
          candidateLimit,
          vectorCandidates: 0,
          keywordCandidates: keywordResults.length,
          fusedCandidates: keywordResults.length,
          rankConstant: rrfRankConstant,
          rrfWeights: [...rrfWeights],
          reranker: rerank ? "pending" : "disabled",
        };
        if (!rerank) return { mode: "keyword-fallback", results: keywordResults.slice(0, limit), retrieval };

        const shortlist = keywordResults.slice(0, Math.max(limit, rerankCandidateLimit));
        const startedAt = performance.now();
        try {
          const reranked = await rerank(query, shortlist, { limit });
          if (!Array.isArray(reranked)) throw new Error("Reranker returned a non-array result.");
          return {
            mode: "keyword-fallback-reranked",
            results: reranked.slice(0, limit),
            retrieval: { ...retrieval, reranker: "applied", rerankCandidates: shortlist.length, rerankLatencyMs: roundLatency(performance.now() - startedAt) },
          };
        } catch (rerankError) {
          logger?.warn?.({ event: "reranker_fallback", errorName: rerankError?.name || "Error" });
          return {
            mode: "keyword-fallback-rerank-fallback",
            results: keywordResults.slice(0, limit),
            retrieval: { ...retrieval, reranker: "fallback", rerankCandidates: shortlist.length, rerankLatencyMs: roundLatency(performance.now() - startedAt) },
          };
        }
      }

      const fused = reciprocalRankFusion([vectorResults, keywordResults], { rankConstant: rrfRankConstant, weights: rrfWeights });
      const retrieval = {
        candidateLimit,
        vectorCandidates: vectorResults.length,
        keywordCandidates: keywordResults.length,
        fusedCandidates: fused.length,
        rankConstant: rrfRankConstant,
        rrfWeights: [...rrfWeights],
        reranker: rerank ? "pending" : "disabled",
      };
      if (!rerank) return { mode: "hybrid", results: fused.slice(0, limit), retrieval };

      const shortlist = fused.slice(0, Math.max(limit, rerankCandidateLimit));
      const startedAt = performance.now();
      try {
        const reranked = await rerank(query, shortlist, { limit });
        if (!Array.isArray(reranked)) throw new Error("Reranker returned a non-array result.");
        return {
          mode: "hybrid-reranked",
          results: reranked.slice(0, limit),
          retrieval: { ...retrieval, reranker: "applied", rerankCandidates: shortlist.length, rerankLatencyMs: roundLatency(performance.now() - startedAt) },
        };
      } catch (error) {
        logger?.warn?.({ event: "reranker_fallback", errorName: error?.name || "Error" });
        return {
          mode: "hybrid-rerank-fallback",
          results: fused.slice(0, limit),
          retrieval: { ...retrieval, reranker: "fallback", rerankCandidates: shortlist.length, rerankLatencyMs: roundLatency(performance.now() - startedAt) },
        };
      }
    },
  };
}

function roundLatency(value: number) { return Number(value.toFixed(3)); }
