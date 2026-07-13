import { performance } from "node:perf_hooks";

export async function evaluateRetrievalGoldenSet({ cases, keywordSearch, hybridSearch, limit = 5 }: any) {
  const details: any[] = [];
  for (const item of cases) {
    const [baselineRun, candidateRun] = await Promise.all([
      measureSearch(() => keywordSearch(item.query, { limit })),
      measureSearch(() => hybridSearch(item.query, { limit })),
    ]);
    details.push(buildDetail(item, baselineRun, candidateRun, limit));
  }

  const baseline = summarizeDetails(details, "baseline", limit);
  const candidate = summarizeDetails(details, "candidate", limit);
  return {
    ok: candidate.mrr >= baseline.mrr
      && candidate.recallAtK >= baseline.recallAtK
      && candidate.ndcgAtK >= baseline.ndcgAtK,
    baseline,
    candidate,
    groups: {
      language: groupDetails(details, "language", limit),
      category: groupDetails(details, "category", limit),
    },
    details,
  };
}

async function measureSearch(search: () => Promise<any[]>) {
  const startedAt = performance.now();
  const results = await search();
  return { results, latencyMs: performance.now() - startedAt };
}

function buildDetail(item: any, baselineRun: any, candidateRun: any, limit: number) {
  return {
    query: item.query,
    expectedIds: item.expectedIds,
    language: item.language || "unknown",
    category: item.category || "uncategorized",
    baselineRank: firstExpectedRank(baselineRun.results, item.expectedIds),
    hybridRank: firstExpectedRank(candidateRun.results, item.expectedIds),
    baselineNdcgAtK: ndcgAtK(baselineRun.results, item.expectedIds, limit),
    candidateNdcgAtK: ndcgAtK(candidateRun.results, item.expectedIds, limit),
    baselineLatencyMs: roundLatency(baselineRun.latencyMs),
    candidateLatencyMs: roundLatency(candidateRun.latencyMs),
  };
}

function groupDetails(details: any[], key: "language" | "category", limit: number) {
  const groups: Record<string, any[]> = {};
  for (const detail of details) (groups[detail[key]] ||= []).push(detail);
  return Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, {
    baseline: summarizeDetails(group, "baseline", limit),
    candidate: summarizeDetails(group, "candidate", limit),
  }]));
}

function summarizeDetails(details: any[], variant: "baseline" | "candidate", limit: number) {
  const rankKey = variant === "baseline" ? "baselineRank" : "hybridRank";
  const ndcgKey = variant === "baseline" ? "baselineNdcgAtK" : "candidateNdcgAtK";
  const latencyKey = variant === "baseline" ? "baselineLatencyMs" : "candidateLatencyMs";
  const ranks = details.map((detail) => detail[rankKey]);
  const hits = ranks.filter((rank) => Number.isFinite(rank) && rank <= limit);
  return {
    cases: ranks.length,
    mrr: roundMetric(ranks.reduce((sum, rank) => sum + (Number.isFinite(rank) ? 1 / rank : 0), 0) / Math.max(1, ranks.length)),
    recallAtK: roundMetric(hits.length / Math.max(1, ranks.length)),
    ndcgAtK: roundMetric(details.reduce((sum, detail) => sum + detail[ndcgKey], 0) / Math.max(1, details.length)),
    latencyMs: summarizeLatencies(details.map((detail) => detail[latencyKey])),
    limit,
  };
}

function firstExpectedRank(results: any[], expectedIds: string[]) {
  const expected = new Set(expectedIds);
  const index = results.findIndex((result) => expected.has(resultId(result)));
  return index < 0 ? Number.POSITIVE_INFINITY : index + 1;
}

function ndcgAtK(results: any[], expectedIds: string[], limit: number) {
  const expected = new Set(expectedIds);
  const dcg = results.slice(0, limit).reduce((score, result, index) => (
    score + (expected.has(resultId(result)) ? 1 / Math.log2(index + 2) : 0)
  ), 0);
  const idealHits = Math.min(expected.size, limit);
  const idealDcg = Array.from({ length: idealHits }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, score) => sum + score, 0);
  return idealDcg ? dcg / idealDcg : 0;
}

function summarizeLatencies(values: number[]) {
  if (!values.length) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: roundLatency(percentile(sorted, 0.5)),
    p95: roundLatency(percentile(sorted, 0.95)),
    max: roundLatency(sorted.at(-1) || 0),
  };
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function resultId(result: any) { return typeof result === "string" ? result : result.id; }
function roundMetric(value: number) { return Number(value.toFixed(6)); }
function roundLatency(value: number) { return Number(value.toFixed(3)); }
