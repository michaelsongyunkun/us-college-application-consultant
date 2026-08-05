export const RETRIEVAL_RELEVANCE_POLICY_VERSION = "retrieval-relevance@2026-08-06";

const DEFAULT_MIN_NORMALIZED_SCORE = 0.55;
const DEFAULT_SCORE_DROP_THRESHOLD = 0.25;

export function selectRelevantEvidence(candidates = [], {
  maxResults = 8,
  minNormalizedScore = DEFAULT_MIN_NORMALIZED_SCORE,
  scoreDropThreshold = DEFAULT_SCORE_DROP_THRESHOLD,
  scopeLimits = {},
} = {}) {
  const rejected = [];
  const valid = [];
  for (const [index, candidate] of (candidates || []).entries()) {
    const rawScore = Number(candidate?.rawScore);
    const id = String(candidate?.id || candidate?.sourceId || "").trim();
    if (!id || !Number.isFinite(rawScore) || rawScore <= 0) {
      rejected.push({ ...candidate, id, rejectionReason: "non_positive_score" });
      continue;
    }
    valid.push({ ...candidate, id, rawScore, _inputIndex: index });
  }

  const byChannel = new Map();
  for (const candidate of valid) {
    const channel = String(candidate.channel || "default");
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push(candidate);
  }

  const eligible = [];
  for (const [channel, channelCandidates] of byChannel) {
    const ordered = [...channelCandidates].sort(compareRawCandidates);
    const topScore = ordered[0]?.rawScore || 0;
    let previousNormalized = 1;
    let dropped = false;
    for (const candidate of ordered) {
      const normalizedScore = topScore ? candidate.rawScore / topScore : 0;
      const normalized = { ...candidate, channel, normalizedScore };
      if (dropped || previousNormalized - normalizedScore >= scoreDropThreshold) {
        dropped = true;
        rejected.push({ ...normalized, rejectionReason: "score_drop" });
      } else if (normalizedScore < minNormalizedScore) {
        rejected.push({ ...normalized, rejectionReason: "below_relevance_floor" });
      } else {
        eligible.push(normalized);
      }
      previousNormalized = normalizedScore;
    }
  }

  const bestById = new Map();
  for (const candidate of eligible.sort(compareNormalizedCandidates)) {
    const existing = bestById.get(candidate.id);
    if (!existing) bestById.set(candidate.id, candidate);
    else rejected.push({ ...candidate, rejectionReason: "duplicate" });
  }

  const scopeCounts = new Map();
  const selected = [];
  for (const candidate of [...bestById.values()].sort(compareNormalizedCandidates)) {
    if (selected.length >= positiveInteger(maxResults, 8)) {
      rejected.push({ ...candidate, rejectionReason: "result_budget" });
      continue;
    }
    const scope = String(candidate.scope || "knowledge");
    const scopeLimit = Number(scopeLimits[scope]);
    const count = scopeCounts.get(scope) || 0;
    if (Number.isFinite(scopeLimit) && count >= scopeLimit) {
      rejected.push({ ...candidate, rejectionReason: "scope_budget" });
      continue;
    }
    selected.push(stripInternalFields(candidate));
    scopeCounts.set(scope, count + 1);
  }

  return {
    selected,
    rejected: rejected.map(stripInternalFields),
    diagnostics: {
      policyVersion: RETRIEVAL_RELEVANCE_POLICY_VERSION,
      generatedCandidates: (candidates || []).length,
      eligibleCandidates: eligible.length,
      selectedCandidates: selected.length,
      rejectedCandidates: rejected.length,
      minNormalizedScore,
      scoreDropThreshold,
      topNormalizedScore: selected[0]?.normalizedScore || 0,
    },
  };
}

function compareRawCandidates(left, right) {
  return right.rawScore - left.rawScore
    || String(left.id).localeCompare(String(right.id))
    || left._inputIndex - right._inputIndex;
}

function compareNormalizedCandidates(left, right) {
  return right.normalizedScore - left.normalizedScore
    || right.rawScore - left.rawScore
    || String(left.id).localeCompare(String(right.id));
}

function stripInternalFields(candidate) {
  const { _inputIndex, ...publicCandidate } = candidate || {};
  return publicCandidate;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
