import { performance } from "node:perf_hooks";

export const DEFAULT_GRAPH_RAG_THRESHOLDS = Object.freeze({
  evidenceCoverage: 0.9,
  documentSourceRecall: 0.9,
  graphSourceRecall: 1,
  predicateRecall: 0.9,
  relationRecall: 0.85,
  modeAccuracy: 1,
  graphStatusAccuracy: 1,
  constraintAccuracy: 1,
  fallbackSuccessRate: 1,
});

export async function evaluateGraphRagGoldenSet({
  cases,
  baselineRetrieve,
  graphRetrieve,
  fallbackRetrieve,
  thresholds = DEFAULT_GRAPH_RAG_THRESHOLDS,
}: any) {
  if (!Array.isArray(cases) || !cases.length) throw new TypeError("GraphRAG golden cases are required.");
  if (typeof baselineRetrieve !== "function" || typeof graphRetrieve !== "function") {
    throw new TypeError("GraphRAG evaluation requires baselineRetrieve and graphRetrieve.");
  }

  const details: any[] = [];
  for (const item of cases) {
    const [baselineRun, candidateRun] = await Promise.all([
      measureRetrieve(() => baselineRetrieve(item)),
      measureRetrieve(() => graphRetrieve(item)),
    ]);
    const expectsGraph = String(item.expected?.mode || "").startsWith("graph-rag");
    const fallbackRun = expectsGraph && typeof fallbackRetrieve === "function"
      ? await measureRetrieve(() => fallbackRetrieve(item))
      : null;
    details.push(buildDetail(item, baselineRun, candidateRun, fallbackRun));
  }

  const baseline = summarizeVariant(details, "baseline");
  const candidate = summarizeVariant(details, "candidate");
  const routing = summarizeRouting(details);
  const fallback = summarizeFallback(details);
  const appliedThresholds = { ...DEFAULT_GRAPH_RAG_THRESHOLDS, ...(thresholds || {}) };
  const gates = {
    evidenceCoverage: candidate.evidenceCoverage >= appliedThresholds.evidenceCoverage
      && candidate.evidenceCoverage > baseline.evidenceCoverage,
    documentSourceRecall: candidate.documentSourceRecall >= appliedThresholds.documentSourceRecall
      && candidate.documentSourceRecall >= baseline.documentSourceRecall,
    graphSourceRecall: candidate.graphSourceRecall >= appliedThresholds.graphSourceRecall,
    predicateRecall: candidate.predicateRecall >= appliedThresholds.predicateRecall,
    relationRecall: candidate.relationRecall >= appliedThresholds.relationRecall,
    modeAccuracy: routing.modeAccuracy >= appliedThresholds.modeAccuracy,
    graphStatusAccuracy: routing.graphStatusAccuracy >= appliedThresholds.graphStatusAccuracy,
    constraintAccuracy: routing.constraintAccuracy >= appliedThresholds.constraintAccuracy,
    fallbackSuccessRate: fallback.successRate >= appliedThresholds.fallbackSuccessRate,
    noRunnerErrors: details.every((detail) => !detail.baseline.errorName
      && !detail.candidate.errorName
      && !detail.fallback?.errorName),
  };

  return {
    ok: Object.values(gates).every(Boolean),
    thresholds: appliedThresholds,
    gates,
    baseline,
    candidate,
    improvement: {
      evidenceCoverage: roundMetric(candidate.evidenceCoverage - baseline.evidenceCoverage),
      relationRecall: roundMetric(candidate.relationRecall - baseline.relationRecall),
    },
    routing,
    fallback,
    groups: groupDetails(details),
    details,
  };
}

async function measureRetrieve(run: () => Promise<any>) {
  const startedAt = performance.now();
  try {
    return { result: await run(), latencyMs: roundLatency(performance.now() - startedAt), errorName: "" };
  } catch (error: any) {
    return { result: {}, latencyMs: roundLatency(performance.now() - startedAt), errorName: error?.name || "Error" };
  }
}

function buildDetail(item: any, baselineRun: any, candidateRun: any, fallbackRun: any) {
  const expected = item.expected || {};
  const candidateResult = candidateRun.result || {};
  const expectedRounds = expected.constraints?.rounds;
  return {
    id: item.id,
    query: item.query,
    language: item.language || "unknown",
    category: item.category || "uncategorized",
    expectedMode: expected.mode || "",
    baseline: {
      ...assessEvidence(baselineRun.result, expected),
      latencyMs: baselineRun.latencyMs,
      errorName: baselineRun.errorName,
    },
    candidate: {
      ...assessEvidence(candidateResult, expected),
      latencyMs: candidateRun.latencyMs,
      errorName: candidateRun.errorName,
    },
    routing: {
      modeMatched: String(candidateResult.retrieval?.mode || "") === String(expected.mode || ""),
      graphStatusMatched: String(candidateResult.retrieval?.graph?.status || "") === String(expected.graphStatus || ""),
      constraintMatched: Array.isArray(expectedRounds)
        ? sameStringSet(candidateResult.retrieval?.queryPlan?.constraints?.rounds, expectedRounds)
        : null,
    },
    fallback: fallbackRun ? {
      success: fallbackRun.result?.retrieval?.graph?.status === "fallback"
        && Boolean(String(fallbackRun.result?.context || "").trim() || fallbackRun.result?.sources?.length),
      latencyMs: fallbackRun.latencyMs,
      errorName: fallbackRun.errorName,
    } : null,
  };
}

function assessEvidence(result: any = {}, expected: any = {}) {
  const facts = Array.isArray(result.facts) ? result.facts : [];
  const sourceTypes = uniqueStrings((result.sources || []).map((source: any) => source?.type));
  const graphSourceIds = uniqueStrings([
    ...(result.graphSourceIds || []),
    ...facts.map((fact: any) => fact?.sourceId),
    ...(result.sources || []).map((source: any) => source?.sourceId),
  ]);
  const predicates = uniqueStrings(facts.map((fact: any) => fact?.predicate));
  const documentSources = scoreExpected(expected.documentSourceTypes, (value: string) => sourceTypes.includes(value));
  const graphSources = scoreExpected(expected.graphSourceIds, (value: string) => graphSourceIds.includes(value));
  const expectedPredicates = scoreExpected(expected.predicates, (value: string) => predicates.includes(value));
  const relations = scoreExpected(expected.relations, (relation: any) => facts.some((fact: any) => relationMatches(fact, relation)));
  const components = [documentSources, graphSources, expectedPredicates, relations];
  const expectedCount = components.reduce((sum, component) => sum + component.expected, 0);
  const matchedCount = components.reduce((sum, component) => sum + component.matched, 0);
  return {
    evidence: { matched: matchedCount, expected: expectedCount, score: ratio(matchedCount, expectedCount) },
    documentSources,
    graphSources,
    predicates: expectedPredicates,
    relations,
    selectedFacts: facts.length,
  };
}

function relationMatches(fact: any, expected: any) {
  if (expected.predicate && fact?.predicate !== expected.predicate) return false;
  if (expected.subjectIncludes && !normalizedIncludes(fact?.subject?.name || fact?.subject?.id, expected.subjectIncludes)) return false;
  if (expected.objectIncludes && !normalizedIncludes(fact?.object?.name || fact?.object?.id, expected.objectIncludes)) return false;
  return true;
}

function normalizedIncludes(value: any, expected: any) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .includes(String(expected || "").normalize("NFKC").toLocaleLowerCase());
}

function scoreExpected(values: any, matches: (value: any) => boolean) {
  const expectedValues = Array.isArray(values) ? values : [];
  const matched = expectedValues.filter(matches).length;
  return { matched, expected: expectedValues.length, score: ratio(matched, expectedValues.length) };
}

function summarizeVariant(details: any[], variant: "baseline" | "candidate") {
  return {
    cases: details.length,
    evidenceCoverage: aggregateComponent(details, variant, "evidence"),
    documentSourceRecall: aggregateComponent(details, variant, "documentSources"),
    graphSourceRecall: aggregateComponent(details, variant, "graphSources"),
    predicateRecall: aggregateComponent(details, variant, "predicates"),
    relationRecall: aggregateComponent(details, variant, "relations"),
    latencyMs: summarizeLatencies(details.map((detail) => detail[variant].latencyMs)),
  };
}

function aggregateComponent(details: any[], variant: string, component: string) {
  const totals = details.reduce((output, detail) => ({
    matched: output.matched + detail[variant][component].matched,
    expected: output.expected + detail[variant][component].expected,
  }), { matched: 0, expected: 0 });
  return ratio(totals.matched, totals.expected);
}

function summarizeRouting(details: any[]) {
  const constraintCases = details.filter((detail) => detail.routing.constraintMatched !== null);
  return {
    cases: details.length,
    modeAccuracy: ratio(details.filter((detail) => detail.routing.modeMatched).length, details.length),
    graphStatusAccuracy: ratio(details.filter((detail) => detail.routing.graphStatusMatched).length, details.length),
    constraintCases: constraintCases.length,
    constraintAccuracy: ratio(constraintCases.filter((detail) => detail.routing.constraintMatched).length, constraintCases.length),
  };
}

function summarizeFallback(details: any[]) {
  const fallbackCases = details.filter((detail) => detail.fallback);
  return {
    cases: fallbackCases.length,
    successRate: ratio(fallbackCases.filter((detail) => detail.fallback.success).length, fallbackCases.length),
    latencyMs: summarizeLatencies(fallbackCases.map((detail) => detail.fallback.latencyMs)),
  };
}

function groupDetails(details: any[]) {
  const groups: Record<string, any> = {};
  for (const key of ["language", "category"] as const) {
    const values: Record<string, any[]> = {};
    for (const detail of details) (values[detail[key]] ||= []).push(detail);
    groups[key] = Object.fromEntries(Object.entries(values).map(([name, group]) => [name, {
      baseline: summarizeVariant(group, "baseline"),
      candidate: summarizeVariant(group, "candidate"),
    }]));
  }
  return groups;
}

function sameStringSet(actual: any, expected: string[]) {
  const left = uniqueStrings(Array.isArray(actual) ? actual : []).sort();
  const right = uniqueStrings(expected).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function ratio(matched: number, expected: number) { return expected ? roundMetric(matched / expected) : 1; }
function uniqueStrings(values: any[]) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function roundMetric(value: number) { return Number(value.toFixed(6)); }
function roundLatency(value: number) { return Number(value.toFixed(3)); }
