import assert from "node:assert/strict";
import {
  RETRIEVAL_RELEVANCE_POLICY_VERSION,
  selectRelevantEvidence,
} from "../src/domain/retrieval-relevance.mjs";

const candidates = [
  { id: "local-1", channel: "local-keyword", rawScore: 10, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-2", channel: "local-keyword", rawScore: 8, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-3", channel: "local-keyword", rawScore: 4, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-4", channel: "local-keyword", rawScore: 1, type: "school-encyclopedia", scope: "knowledge" },
  { id: "pg-1", channel: "postgres-hybrid", rawScore: 0.04, type: "resource-library", scope: "knowledge" },
  { id: "pg-2", channel: "postgres-hybrid", rawScore: 0.02, type: "resource-library", scope: "knowledge" },
  { id: "invalid", channel: "local-keyword", rawScore: 0, type: "resource-library", scope: "knowledge" },
];

const selection = selectRelevantEvidence(candidates, {
  maxResults: 4,
  minNormalizedScore: 0.55,
  scoreDropThreshold: 0.25,
});

assert.equal(RETRIEVAL_RELEVANCE_POLICY_VERSION, "retrieval-relevance@2026-08-06");
assert.deepEqual(selection.selected.map((item) => item.id), ["local-1", "pg-1", "local-2"]);
assert.ok(selection.selected.every((item) => item.normalizedScore >= 0.55));
assert.ok(selection.rejected.some((item) => item.id === "invalid" && item.rejectionReason === "non_positive_score"));
assert.ok(selection.rejected.some((item) => item.id === "local-3" && item.rejectionReason === "score_drop"));
assert.equal(selection.diagnostics.generatedCandidates, 7);
assert.equal(selection.diagnostics.selectedCandidates, 3);

const deduped = selectRelevantEvidence([
  { id: "same", channel: "local-keyword", rawScore: 5, type: "major-encyclopedia" },
  { id: "same", channel: "postgres-hybrid", rawScore: 1, type: "major-encyclopedia" },
], { maxResults: 8 });
assert.equal(deduped.selected.length, 1);

const scoped = selectRelevantEvidence([
  { id: "personal-1", channel: "personal", rawScore: 1, scope: "personal" },
  { id: "personal-2", channel: "personal", rawScore: 0.9, scope: "personal" },
  { id: "personal-3", channel: "personal", rawScore: 0.8, scope: "personal" },
  { id: "personal-4", channel: "personal", rawScore: 0.7, scope: "personal" },
], { maxResults: 8, scopeLimits: { personal: 3 } });
assert.deepEqual(scoped.selected.map((item) => item.id), ["personal-1", "personal-2", "personal-3"]);

assert.deepEqual(selectRelevantEvidence([], { maxResults: 8 }).selected, []);
