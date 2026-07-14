import { z } from "zod";
import { createDeepSeekRerankerClientFromEnv } from "./deepseek-reranker-client.js";

const RerankerResponseSchema = z.object({
  results: z.array(z.object({
    index: z.number().int().nonnegative(),
    score: z.number().finite(),
  })),
});

export function createRerankerClientFromEnv(env: any = process.env, dependencies: any = {}) {
  return createExternalRerankerClientFromEnv(env, dependencies)
    || createDeepSeekRerankerClientFromEnv(env, dependencies);
}

export function createExternalRerankerClientFromEnv(env: any = process.env, { fetchImpl = fetch }: any = {}) {
  const baseUrl = String(env.RERANKER_URL || "").trim().replace(/\/+$/u, "");
  if (!baseUrl) return null;
  const timeoutMs = boundedInteger(env.RERANKER_TIMEOUT_MS, 350, 50, 10_000);
  const apiKey = String(env.RERANKER_API_KEY || "").trim();
  const model = String(env.RERANKER_MODEL || "BAAI/bge-reranker-v2-m3").trim();
  return {
    provider: "external",
    modelVersion: model,
    async rerank(query: string, candidates: any[], { limit = candidates.length }: any = {}) {
      if (!candidates.length) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();
      try {
        const response = await fetchImpl(`${baseUrl}/rerank`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            query,
            documents: candidates.map((candidate) => ({
              id: String(candidate.id),
              text: `${candidate.title || ""}\n${candidate.content || candidate.snippet || ""}`.trim().slice(0, 8_000),
            })),
            top_n: Math.min(Math.max(1, limit), candidates.length),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Reranker request failed with HTTP ${response.status}`);
        const parsed = RerankerResponseSchema.parse(await response.json());
        const seen = new Set<number>();
        const ranked = parsed.results.map(({ index, score }) => {
          if (index >= candidates.length || seen.has(index)) throw new Error("Reranker response contains an invalid document index.");
          seen.add(index);
          return { ...candidates[index], rerankScore: score };
        });
        return [...ranked, ...candidates.filter((_candidate, index) => !seen.has(index))];
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function boundedInteger(value: any, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
