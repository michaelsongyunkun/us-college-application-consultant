import { performance } from "node:perf_hooks";

export async function evaluateRagRelevanceGoldenSet({
  cases,
  retrieve,
  baselineRetrieve = null,
  precisionFloor = 0.8,
  categoryPrecisionFloor = 0.7,
  recallFloor = 1,
  latencyAllowance = { ratio: 1.15, absoluteMs: 50 },
  maxLatencyMs = 2_000,
}: any) {
  const details = [];
  for (const item of cases) {
    const baseline = baselineRetrieve ? await measure(() => baselineRetrieve(item)) : null;
    const candidate = await measure(() => retrieve(item));
    details.push(buildDetail(item, baseline, candidate, maxLatencyMs));
  }
  const summary = summarize(details);
  const categories = Object.fromEntries([...new Set(details.map((item) => item.category))].map((category) => [
    category,
    summarize(details.filter((item) => item.category === category)),
  ]));
  const latencyPassed = details.every((detail) => !detail.baselineLatencyMs
    || detail.candidateLatencyMs <= Math.max(
      detail.baselineLatencyMs * latencyAllowance.ratio,
      detail.baselineLatencyMs + latencyAllowance.absoluteMs,
    ));
  const absoluteLatencyPassed = details.every((detail) => detail.absoluteLatencyPassed);
  const ok = summary.precisionAtK >= precisionFloor
    && summary.recallAtK >= recallFloor
    && Object.values(categories).every((group: any) => group.precisionAtK >= categoryPrecisionFloor)
    && details.every((detail) => detail.forbiddenPassed
      && detail.sourceBudgetPassed
      && detail.graphBudgetPassed
      && detail.modePassed)
    && latencyPassed
    && absoluteLatencyPassed;
  return { ok, summary, categories, latencyPassed, absoluteLatencyPassed, details };
}

async function measure(operation: () => Promise<any>) {
  const startedAt = performance.now();
  const result = await operation();
  return { result, latencyMs: performance.now() - startedAt };
}

function buildDetail(item: any, baseline: any, candidate: any, maxLatencyMs: number) {
  const sources = candidate.result.sources || [];
  const relevantPatterns = item.relevantPatterns || [];
  const relevant = sources.filter((source: any) => (
    matchesAny(source, relevantPatterns)
    || (item.usePersonalContext === true && source.scope === "personal")
  ));
  const forbidden = sources.filter((source: any) => matchesAny(source, item.forbiddenPatterns));
  const matchedRelevantPatterns = relevantPatterns.filter((pattern: string) => (
    sources.some((source: any) => matchesPattern(source, pattern))
  )).length;
  const expectedCount = relevantPatterns.length;
  return {
    id: item.id,
    category: item.category || "uncategorized",
    selectedSources: sources.length,
    relevantSources: relevant.length,
    precision: sources.length ? relevant.length / sources.length : expectedCount ? 0 : 1,
    recall: expectedCount ? matchedRelevantPatterns / expectedCount : 1,
    forbiddenPassed: forbidden.length === 0,
    sourceBudgetPassed: sources.length <= Number(item.maxSources ?? 8),
    graphBudgetPassed: Number(candidate.result.retrieval?.graph?.selectedFacts || 0) <= Number(item.maxGraphFacts ?? 8),
    modePassed: !item.expectedMode || candidate.result.retrieval?.mode === item.expectedMode,
    baselineLatencyMs: baseline?.latencyMs || 0,
    candidateLatencyMs: candidate.latencyMs,
    absoluteLatencyPassed: candidate.latencyMs <= Number(item.maxLatencyMs ?? maxLatencyMs),
  };
}

function matchesAny(source: any, patterns: string[] = []) {
  return patterns.some((pattern) => matchesPattern(source, pattern));
}

function matchesPattern(source: any, pattern: string) {
  const text = `${source.id || ""}\n${source.title || ""}\n${source.type || ""}`;
  return new RegExp(pattern, "iu").test(text);
}

function summarize(details: any[]) {
  const count = Math.max(1, details.length);
  const precisionAtK = details.reduce((sum, item) => sum + item.precision, 0) / count;
  const recallAtK = details.reduce((sum, item) => sum + item.recall, 0) / count;
  return {
    cases: details.length,
    precisionAtK: round(precisionAtK),
    recallAtK: round(recallAtK),
    noiseRate: round(1 - precisionAtK),
  };
}

function round(value: number) {
  return Number(value.toFixed(6));
}
