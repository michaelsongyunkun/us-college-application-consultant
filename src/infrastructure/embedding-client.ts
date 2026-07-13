import { z } from "zod";

const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) })),
});

export function createEmbeddingClientFromEnv(env = process.env) {
  const baseUrl = String(env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/u, "");
  const apiKey = String(env.EMBEDDING_API_KEY || "").trim();
  const model = String(env.EMBEDDING_MODEL || "text-embedding-3-small").trim();
  const dimensions = Number(env.EMBEDDING_DIMENSIONS || 1536);
  const timeoutMs = Number(env.EMBEDDING_TIMEOUT_MS || 30_000);
  if (!apiKey) throw new Error("EMBEDDING_API_KEY is required for vector ingestion.");

  return {
    modelVersion: `${model}:${dimensions}`,
    async embed(texts: string[]) {
      if (!texts.length) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();
      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, input: texts, dimensions }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Embedding request failed with HTTP ${response.status}`);
        const parsed = EmbeddingResponseSchema.parse(await response.json());
        const ordered = [...parsed.data].sort((left, right) => left.index - right.index).map((entry) => entry.embedding);
        if (ordered.length !== texts.length || ordered.some((entry) => entry.length !== dimensions)) throw new Error("Embedding response dimensions do not match configuration.");
        return ordered;
      } finally { clearTimeout(timer); }
    },
  };
}
