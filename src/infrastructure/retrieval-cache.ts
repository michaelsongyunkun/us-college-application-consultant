import { createHash } from "node:crypto";
import IORedis from "ioredis";

export function createRetrievalCache({ redis, namespace = "rag-retrieval-v1", ttlSeconds = 300, logger = null }: any) {
  const inFlight = new Map<string, Promise<any>>();
  return {
    async getOrLoad({ query, variant = "default" }: any, loader: () => Promise<any>) {
      const key = cacheKey(namespace, variant, query);
      try {
        const cached = await redis.get(key);
        if (cached) return { value: JSON.parse(cached), status: "hit" };
      } catch (error) {
        logger?.warn?.({ event: "retrieval_cache_read_bypass", errorName: error?.name || "Error" });
        return { value: await loader(), status: "bypass" };
      }

      const pending = inFlight.get(key);
      if (pending) return { value: await pending, status: "coalesced" };
      const loadPromise = loader();
      inFlight.set(key, loadPromise);
      try {
        const value = await loadPromise;
        try {
          await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
          return { value, status: "miss" };
        } catch (error) {
          logger?.warn?.({ event: "retrieval_cache_write_bypass", errorName: error?.name || "Error" });
          return { value, status: "bypass" };
        }
      } finally {
        inFlight.delete(key);
      }
    },
  };
}

export function createRetrievalCacheFromEnv(env: any = process.env, { logger = null }: any = {}) {
  const redisUrl = String(env.REDIS_URL || "").trim();
  if (!redisUrl) return null;
  const redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: boundedInteger(env.REDIS_CONNECT_TIMEOUT_MS, 1_000, 100, 30_000),
    commandTimeout: boundedInteger(env.RETRIEVAL_CACHE_COMMAND_TIMEOUT_MS, 200, 25, 5_000),
  });
  const cache = createRetrievalCache({
    redis,
    namespace: String(env.RETRIEVAL_CACHE_NAMESPACE || "rag-retrieval-v1"),
    ttlSeconds: boundedInteger(env.RETRIEVAL_CACHE_TTL_SECONDS, 300, 1, 86_400),
    logger,
  });
  return { ...cache, async close() { await redis.quit(); } };
}

function cacheKey(namespace: string, variant: string, query: string) {
  const normalized = String(query).normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  const hash = createHash("sha256").update(`${variant}\n${normalized}`).digest("hex");
  return `${namespace}:${hash}`;
}

function boundedInteger(value: any, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
