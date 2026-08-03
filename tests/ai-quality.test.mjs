import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AI_QUALITY_VERSIONS,
  evaluateAiAnswerQuality,
  findHighRiskClaims,
  findUnsupportedCitations,
  getExpectedRagSourceTypes,
  getRagPromptVersion,
} from "../src/server/ai-quality.mjs";

const fixture = JSON.parse(
  await readFile(join(process.cwd(), "tests", "fixtures", "ai-quality-golden.json"), "utf8"),
);

assert.equal(getRagPromptVersion(), AI_QUALITY_VERSIONS.ragPromptDefault);
assert.equal(getRagPromptVersion("major-match"), AI_QUALITY_VERSIONS.ragPromptMajorMatch);
assert.deepEqual(getExpectedRagSourceTypes("school"), ["application-portfolio", "school-encyclopedia"]);

const goldenCase = fixture.ragCases.find((testCase) => testCase.id === "rag-robotics-school-resource");
const quality = evaluateAiAnswerQuality({
  answer: goldenCase.answer,
  sources: goldenCase.sources,
  expectedSourceTypes: goldenCase.expectedSourceTypes,
  metadata: {
    feature: "deepseek-rag",
    promptVersion: getRagPromptVersion(),
    model: "deepseek-v4-pro",
    sourceSetVersion: AI_QUALITY_VERSIONS.ragSourceSet,
    parserVersion: AI_QUALITY_VERSIONS.ragParser,
  },
});

assert.equal(quality.schemaVersion, AI_QUALITY_VERSIONS.schema);
assert.equal(quality.metadata.feature, "deepseek-rag");
assert.equal(quality.metadata.promptVersion, AI_QUALITY_VERSIONS.ragPromptDefault);
assert.equal(quality.metadata.model, "deepseek-v4-pro");
assert.equal(quality.metadata.sourceSetVersion, AI_QUALITY_VERSIONS.ragSourceSet);
assert.equal(quality.metadata.parserVersion, AI_QUALITY_VERSIONS.ragParser);
assert.equal(quality.retrieval.retrievalHitRate, 1);
assert.deepEqual(quality.retrieval.missingSourceTypes, []);
assert.equal(quality.review.required, false);
assert.ok(quality.citations.some((citation) => citation.sourceId === "rag-school-mit"));
assert.ok(quality.citations.every((citation) => citation.sourceTitle));

const riskyCase = fixture.ragCases.find((testCase) => testCase.id === "rag-unsupported-citation-risk");
const riskyQuality = evaluateAiAnswerQuality({
  answer: riskyCase.answer,
  sources: riskyCase.sources,
  expectedSourceTypes: riskyCase.expectedSourceTypes,
});

assert.equal(riskyQuality.review.required, true);
assert.equal(riskyQuality.review.fallback.triggered, true);
assert.ok(riskyQuality.review.fallback.message);
assert.ok(riskyQuality.review.reasons.includes("unsupported_citations"));
assert.ok(riskyQuality.review.reasons.includes("high_risk_claims"));
assert.ok(riskyQuality.hallucination.unsupportedCitations.some((citation) => citation.marker === "[9]"));
assert.ok(riskyQuality.hallucination.highRiskClaims.some((claim) => claim.code === "guaranteed_admission"));

const noSourceQuality = evaluateAiAnswerQuality({
  answer: "Insufficient context.",
  sources: [],
  expectedSourceTypes: ["application-portfolio"],
});
assert.equal(noSourceQuality.review.required, true);
assert.ok(noSourceQuality.review.reasons.includes("no_sources"));
assert.ok(noSourceQuality.review.reasons.includes("low_retrieval_hit_rate"));

const longAnswerQuality = evaluateAiAnswerQuality({
  answer: "A bounded answer.",
  sources: [{ id: "rag-known", type: "application-portfolio", title: "Portfolio" }],
  expectedSourceTypes: ["application-portfolio"],
  outputDiagnostics: {
    originalCharacters: 14_000,
    returnedCharacters: 12_000,
    maxCharacters: 12_000,
    maxTokens: 1_600,
    truncated: true,
    finishReason: "length",
  },
});
assert.equal(longAnswerQuality.output.truncated, true);
assert.equal(longAnswerQuality.output.originalCharacters, 14_000);
assert.equal(longAnswerQuality.output.maxTokens, 1_600);
assert.ok(longAnswerQuality.review.reasons.includes("response_too_long"));

assert.deepEqual(findUnsupportedCitations("Use [2] and rag-missing.", [{ id: "rag-known" }]), [
  { marker: "[2]", reason: "citation_index_outside_retrieved_context" },
  { marker: "rag-missing", reason: "source_id_outside_retrieved_context" },
]);
assert.ok(findHighRiskClaims("This will guarantee admission.").some((claim) => claim.code === "guaranteed_admission"));
