export const AI_QUALITY_VERSIONS = Object.freeze({
  schema: "ai-quality@2026-06-18",
  evaluator: "ai-quality-evaluator@2026-06-18",
  deepseekPlanPrompt: "deepseek-plan-prompt@2026-06-18",
  deepseekPlanParser: "agent-output-parser@2026-06-18",
  ragPromptDefault: "ask-deepseek-rag@2026-06-18",
  ragPromptMajorMatch: "ask-deepseek-major-match@2026-06-18",
  ragParser: "rag-context-parser@2026-06-18",
  ragSourceSet: "rag-source-set@2026-06-18",
  schoolSelectionPrompt: "school-selection-prompt@2026-06-18",
  schoolSelectionParser: "school-selection-json-parser@2026-06-18",
  schoolSelectionSourceSet: "school-selection-rag-source-set@2026-06-18",
  portfolioCapabilityPrompt: "portfolio-capability-prompt@2026-06-18",
  portfolioCapabilityParser: "portfolio-capability-json-parser@2026-06-18",
  noSourceSet: "no-rag-source-set@2026-06-18",
});

export const AI_REVIEW_FALLBACK_MESSAGE =
  "\u5f53\u524d AI \u56de\u7b54\u9700\u8981\u4eba\u5de5\u590d\u6838\uff0c\u8bf7\u5148\u6838\u5bf9\u68c0\u7d22\u6765\u6e90\u540e\u518d\u7528\u4e8e\u7533\u8bf7\u51b3\u7b56\u3002";

const DEFAULT_HIT_RATE_THRESHOLD = 0.8;

const HIGH_RISK_CLAIM_PATTERNS = [
  { code: "guaranteed_admission", pattern: /\bguarantee(?:d|s)? admission\b/i },
  { code: "guaranteed_acceptance", pattern: /\bguarantee(?:d|s)? acceptance\b/i },
  { code: "absolute_probability", pattern: /\b100\s*%\s*(?:chance|admission|acceptance|accepted)\b/i },
  { code: "certain_admission", pattern: /\bwill be admitted\b/i },
  { code: "certain_acceptance", pattern: /\bmust be accepted\b/i },
  { code: "zh_guaranteed_admission", pattern: /\u4fdd\u8bc1\u5f55\u53d6/u },
  { code: "zh_certain_admission", pattern: /\u4e00\u5b9a\u5f55\u53d6/u },
  { code: "zh_inevitable_admission", pattern: /\u5fc5\u7136\u5f55\u53d6/u },
];

export function buildAiRequestQuality({
  feature,
  promptVersion,
  model,
  sourceSetVersion = AI_QUALITY_VERSIONS.noSourceSet,
  parserVersion = "",
  extraMetadata = {},
} = {}) {
  return {
    schemaVersion: AI_QUALITY_VERSIONS.schema,
    metadata: buildAiRequestMetadata({
      feature,
      promptVersion,
      model,
      sourceSetVersion,
      parserVersion,
      extraMetadata,
    }),
    citations: [],
    retrieval: {
      expectedSourceTypes: [],
      coveredSourceTypes: [],
      missingSourceTypes: [],
      retrievalHitRate: 1,
      sourceCount: 0,
    },
    hallucination: {
      unsupportedCitations: [],
      highRiskClaims: [],
    },
    review: buildReviewState([]),
  };
}

export function evaluateAiAnswerQuality({
  answer,
  sources = [],
  expectedSourceTypes = [],
  metadata = {},
  hitRateThreshold = DEFAULT_HIT_RATE_THRESHOLD,
} = {}) {
  const normalizedSources = sources.map(normalizeSource).filter((source) => source.id || source.title);
  const uniqueExpectedTypes = uniqueStrings(expectedSourceTypes);
  const sourceTypes = new Set(normalizedSources.map((source) => source.type).filter(Boolean));
  const coveredSourceTypes = uniqueExpectedTypes.filter((type) => sourceTypes.has(type));
  const missingSourceTypes = uniqueExpectedTypes.filter((type) => !sourceTypes.has(type));
  const retrievalHitRate = uniqueExpectedTypes.length
    ? roundMetric(coveredSourceTypes.length / uniqueExpectedTypes.length)
    : normalizedSources.length
      ? 1
      : 0;

  const unsupportedCitations = findUnsupportedCitations(answer, normalizedSources);
  const highRiskClaims = findHighRiskClaims(answer);
  const reviewReasons = [
    normalizedSources.length ? "" : "no_sources",
    retrievalHitRate < hitRateThreshold ? "low_retrieval_hit_rate" : "",
    unsupportedCitations.length ? "unsupported_citations" : "",
    highRiskClaims.length ? "high_risk_claims" : "",
  ].filter(Boolean);

  return {
    schemaVersion: AI_QUALITY_VERSIONS.schema,
    metadata: buildAiRequestMetadata(metadata),
    citations: normalizedSources.map((source, index) => ({
      marker: `S${index + 1}`,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceType: source.type,
    })),
    retrieval: {
      expectedSourceTypes: uniqueExpectedTypes,
      coveredSourceTypes,
      missingSourceTypes,
      retrievalHitRate,
      sourceCount: normalizedSources.length,
    },
    hallucination: {
      unsupportedCitations,
      highRiskClaims,
    },
    review: buildReviewState(reviewReasons),
  };
}

export function getRagPromptVersion(assistantProfile = "") {
  return assistantProfile === "major-match"
    ? AI_QUALITY_VERSIONS.ragPromptMajorMatch
    : AI_QUALITY_VERSIONS.ragPromptDefault;
}

export function getExpectedRagSourceTypes(intent = "general") {
  const normalizedIntent = String(intent || "general");
  return {
    school: ["application-portfolio", "school-encyclopedia"],
    major: ["application-portfolio", "major-encyclopedia"],
    resource: ["application-portfolio", "resource-library"],
    academic: ["application-portfolio", "student-backup"],
    recommendation: ["application-portfolio", "student-backup"],
    general: ["application-portfolio", "student-backup"],
  }[normalizedIntent] || ["application-portfolio", "student-backup"];
}

export function findUnsupportedCitations(answer, sources = []) {
  const text = String(answer || "");
  const sourceIds = new Set(sources.map((source) => String(source.id || "")).filter(Boolean));
  const unsupported = [];
  const sourceCount = sources.length;

  for (const match of text.matchAll(/(?:\[|\u3010)(\d{1,3})(?:\]|\u3011)/g)) {
    const index = Number.parseInt(match[1], 10);
    if (!Number.isInteger(index) || index < 1 || index > sourceCount) {
      unsupported.push({
        marker: match[0],
        reason: "citation_index_outside_retrieved_context",
      });
    }
  }

  for (const match of text.matchAll(/\brag-[a-z0-9]+\b/gi)) {
    if (!sourceIds.has(match[0])) {
      unsupported.push({
        marker: match[0],
        reason: "source_id_outside_retrieved_context",
      });
    }
  }

  return unsupported;
}

export function findHighRiskClaims(answer) {
  const text = String(answer || "");
  return HIGH_RISK_CLAIM_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ code, pattern }) => ({
      code,
      excerpt: excerptForPattern(text, pattern),
    }));
}

function buildAiRequestMetadata({
  feature = "",
  promptVersion = "",
  model = "",
  sourceSetVersion = "",
  parserVersion = "",
  extraMetadata = {},
} = {}) {
  return {
    feature,
    promptVersion,
    model,
    sourceSetVersion,
    parserVersion,
    evaluatorVersion: AI_QUALITY_VERSIONS.evaluator,
    ...extraMetadata,
  };
}

function buildReviewState(reasons) {
  const uniqueReasons = uniqueStrings(reasons);
  return {
    required: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    fallback: {
      triggered: uniqueReasons.length > 0,
      message: uniqueReasons.length ? AI_REVIEW_FALLBACK_MESSAGE : "",
    },
  };
}

function normalizeSource(source = {}) {
  return {
    id: String(source.id || source.sourceId || "").trim(),
    type: String(source.type || source.sourceType || "").trim(),
    title: String(source.title || source.sourceTitle || "").trim(),
    snippet: String(source.snippet || "").trim(),
  };
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function excerptForPattern(text, pattern) {
  const match = text.match(pattern);
  if (!match) return "";
  const start = Math.max(0, match.index - 24);
  const end = Math.min(text.length, match.index + match[0].length + 24);
  return text.slice(start, end).trim();
}
