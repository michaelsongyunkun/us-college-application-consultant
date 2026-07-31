import assert from "node:assert/strict";
import { JobStatusSchema, PlanningResultSchema, RagStreamRequestSchema, SchoolSelectionResultSchema, StudentProfileSchema, UnifiedErrorSchema } from "../src/contracts/schemas.ts";

assert.equal(StudentProfileSchema.parse({ grade: "10", customField: "preserved" }).customField, "preserved");
assert.equal(JobStatusSchema.parse({ jobId: "00000000-0000-4000-8000-000000000000", status: "running" }).status, "running");
assert.equal(UnifiedErrorSchema.parse({ error: "Bad input", code: "BAD_INPUT", retryable: false }).code, "BAD_INPUT");
const planning = PlanningResultSchema.parse({
  activities: Array.from({ length: 15 }, (_, index) => ({ id: index + 1, type: "academic", activityName: `Activity ${index + 1}`, executionDescription: "Build evidence and document measurable outcomes.", suggestedGrade: "10-11" })),
  narrative: "A coherent evidence-backed activity narrative.",
});
assert.equal(planning.activities.length, 15);
assert.deepEqual(planning.caveats, []);
assert.equal(SchoolSelectionResultSchema.safeParse({ rounds: {} }).success, false);
assert.equal(RagStreamRequestSchema.parse({ question: "major match", assistantProfile: "major-match" }).assistantProfile, "major-match");
assert.equal(RagStreamRequestSchema.parse({ question: "what matters", assistantProfile: "inspiration" }).assistantProfile, "inspiration");
assert.equal(RagStreamRequestSchema.safeParse({ question: "x".repeat(1_201) }).success, false);
