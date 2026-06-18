import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAgentOutput } from "../src/domain/agent-output-parser.mjs";
import { evaluateAiAnswerQuality } from "../src/server/ai-quality.mjs";
import { validateSchoolSelectionResult } from "../src/server/school-selection-service.mjs";

const fixturePath = join(process.cwd(), "tests", "fixtures", "ai-quality-golden.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const failures = [];
let checks = 0;

runRagChecks(fixture.ragCases || []);
runPlanningChecks(fixture.planningCases || []);
runSchoolSelectionChecks(fixture.schoolSelectionCases || []);
runPortfolioAssessmentChecks(fixture.portfolioAssessmentCases || []);

if (failures.length) {
  console.error(`\nAI quality evaluation failed: ${failures.length}/${checks} checks regressed.`);
  for (const failure of failures) {
    console.error(`- ${failure.id}: ${failure.message}`);
    if (failure.details) console.error(`  details: ${failure.details}`);
  }
  process.exit(1);
}

console.log(`\nAI quality evaluation passed: ${checks} checks across fixture ${fixture.version}.`);

function runRagChecks(cases) {
  for (const testCase of cases) {
    const minimumRetrievalHitRate =
      Number(testCase.minimumRetrievalHitRate ?? fixture.thresholds?.minimumRetrievalHitRate ?? 0.8);
    const quality = evaluateAiAnswerQuality({
      answer: testCase.answer,
      sources: testCase.sources,
      expectedSourceTypes: testCase.expectedSourceTypes,
      hitRateThreshold: minimumRetrievalHitRate,
      metadata: {
        feature: "golden-rag",
        promptVersion: "golden-fixture",
        model: "offline",
        sourceSetVersion: fixture.version,
        parserVersion: "offline",
      },
    });

    record(
      testCase.id,
      quality.retrieval.retrievalHitRate >= minimumRetrievalHitRate,
      `retrievalHitRate ${quality.retrieval.retrievalHitRate} >= ${minimumRetrievalHitRate}`,
      `missingSourceTypes=${quality.retrieval.missingSourceTypes.join(",") || "none"}`,
    );

    if (typeof testCase.mustRequireReview === "boolean") {
      record(
        `${testCase.id}:review`,
        quality.review.required === testCase.mustRequireReview,
        `review.required is ${quality.review.required}, expected ${testCase.mustRequireReview}`,
        `reasons=${quality.review.reasons.join(",") || "none"}`,
      );
    }

    for (const reason of testCase.expectedReviewReasons || []) {
      record(
        `${testCase.id}:reason:${reason}`,
        quality.review.reasons.includes(reason),
        `expected review reason ${reason}`,
        `actual=${quality.review.reasons.join(",") || "none"}`,
      );
    }
  }
}

function runPlanningChecks(cases) {
  for (const testCase of cases) {
    const minimumActivities =
      Number(testCase.minimumActivities ?? fixture.thresholds?.minimumPlanningActivities ?? 1);
    const parsed = parseAgentOutput(testCase.answer);
    record(
      testCase.id,
      parsed.activities.length >= minimumActivities,
      `parsed planning activities ${parsed.activities.length} >= ${minimumActivities}`,
      `diagnostics=${JSON.stringify(parsed.diagnostics)}`,
    );
  }
}

function runSchoolSelectionChecks(cases) {
  for (const testCase of cases) {
    try {
      const validated = validateSchoolSelectionResult(testCase.selection);
      record(
        testCase.id,
        Boolean(validated.rounds && validated.nextActions),
        "school selection validates against production schema",
        `rounds=${Object.entries(validated.rounds).map(([round, items]) => `${round}:${items.length}`).join(",")}`,
      );
    } catch (error) {
      record(testCase.id, false, "school selection validates against production schema", error.message);
    }
  }
}

function runPortfolioAssessmentChecks(cases) {
  for (const testCase of cases) {
    const assessment = testCase.assessment || {};
    const minimumDimensions =
      Number(testCase.minimumDimensions ?? fixture.thresholds?.minimumPortfolioDimensions ?? 6);
    const radarScores = Array.isArray(assessment.radarScores) ? assessment.radarScores : [];
    const scoresAreBounded = radarScores.every((entry) =>
      Number.isFinite(Number(entry.score)) && Number(entry.score) >= 0 && Number(entry.score) <= 100,
    );
    record(
      testCase.id,
      radarScores.length >= minimumDimensions && scoresAreBounded,
      `portfolio dimensions ${radarScores.length} >= ${minimumDimensions} and scores are 0-100`,
      `scoresAreBounded=${scoresAreBounded}`,
    );
  }
}

function record(id, passed, message, details = "") {
  checks += 1;
  const status = passed ? "PASS" : "FAIL";
  console.log(`${status} ${id} - ${message}`);
  if (!passed) failures.push({ id, message, details });
}
