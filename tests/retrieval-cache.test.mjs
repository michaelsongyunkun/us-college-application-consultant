import assert from "node:assert/strict";
import { createRetrievalCache } from "../src/infrastructure/retrieval-cache.ts";

const values = new Map();
const writes = [];
const redis = {
  async get(key) { return values.get(key) || null; },
  async set(key, value, mode, ttl) {
    writes.push({ key, value, mode, ttl });
    values.set(key, value);
  },
};
const cache = createRetrievalCache({ redis, namespace: "knowledge-v2", ttlSeconds: 90 });
let loads = 0;
const first = await cache.getOrLoad({ query: "计算机 专业", variant: "embed-v1" }, async () => {
  loads += 1;
  return { results: [{ id: "doc" }] };
});
const second = await cache.getOrLoad({ query: "  计算机   专业  ", variant: "embed-v1" }, async () => {
  loads += 1;
  return { results: [] };
});
assert.equal(first.status, "miss");
assert.equal(second.status, "hit");
assert.equal(loads, 1);
assert.equal(writes[0].mode, "EX");
assert.equal(writes[0].ttl, 90);
assert.equal(writes[0].key.includes("计算机"), false, "cache keys must not expose user queries");
assert.deepEqual(second.value.results, [{ id: "doc" }]);

const degraded = createRetrievalCache({
  redis: { async get() { throw new Error("redis down"); }, async set() {} },
});
const fallback = await degraded.getOrLoad({ query: "q", variant: "v" }, async () => ({ results: [{ id: "live" }] }));
assert.equal(fallback.status, "bypass");
assert.equal(fallback.value.results[0].id, "live");
