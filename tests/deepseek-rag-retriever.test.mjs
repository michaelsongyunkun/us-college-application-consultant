import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildContextSelection,
  createRagRetriever,
  createStaticMarkdownDocumentLoader,
  serializeRagSource,
  splitMarkdownIntoChunks,
  toLangChainRagDocument,
} from "../src/server/deepseek-rag-service.mjs";

const contextSelection = buildContextSelection([
  { id: "included", type: "resource-library", title: "Included source", text: "short content" },
  { id: "excluded", type: "resource-library", title: "Excluded source", text: "x".repeat(200) },
], 100);
assert.match(contextSelection.context, /Included source/u);
assert.doesNotMatch(contextSelection.context, /Excluded source/u);
assert.deepEqual(contextSelection.included.map((source) => source.id), ["included"]);

const tempDir = await mkdtemp(join(tmpdir(), "consultant-rag-retriever-"));

try {
  await mkdir(join(tempDir, "data"));
  await writeRagDataFiles(tempDir);

  const retrievalMetrics = [];
  const personalReadCalls = [];
  let markdownReadCount = 0;
  const retriever = createRagRetriever({
    root: tempDir,
    readMarkdownFile: async (...args) => {
      markdownReadCount += 1;
      return readFile(...args);
    },
    planning: {
      getProfile() {
        personalReadCalls.push("profile");
        return {
          grade: "10",
          majorDirection: "Computer Science",
          interests: "Robotics Portfolio",
        };
      },
      getLatestRagPlan() {
        personalReadCalls.push("plan");
        return {
          sourceType: "current_plan",
          planName: "Robotics current plan",
          draft: { narrative: "Connect robotics research with community impact." },
        };
      },
    },
    activityPortfolio: {
      getPortfolio() {
        personalReadCalls.push("portfolio");
        return {
          applicationPlan: {
            rea: [],
            ed1: [{ school: "MIT", major: "Computer Science" }],
            ed2: [],
            ea: [],
            uc: [],
            rd: [],
          },
          activities: [
            {
              activityName: "Robotics Portfolio Lab",
              type: "research",
              role: "lead",
              description: "Prototype assistive navigation robot.",
              outcome: "Demo and technical writeup",
            },
          ],
          competitions: [],
          summerSchools: [],
          recommendationLetters: {},
          academicRecords: {},
        };
      },
    },
    metrics: {
      recordRagRetrieval(event) {
        retrievalMetrics.push(event);
      },
    },
  });

  const result = await retriever.retrieve({
    user: { id: "student-1" },
    question: "How should this Robotics Portfolio student compare MIT and FRC/FTC resources?",
    historySummary: "The student is building a robotics portfolio.",
  });

  assert.match(result.context, /MIT/);
  assert.doesNotMatch(result.context, /Robotics Portfolio/u);
  assert.equal(result.retrieval.intent, "school");
  assert.ok(result.retrieval.totalDocuments >= 8);
  assert.ok(result.retrieval.selectedDocuments > 0);
  assert.ok(Number.isInteger(result.retrieval.retrievalMs));
  assert.deepEqual(personalReadCalls, []);
  assert.ok(result.sources.every((source) => source.scope === "knowledge"));
  assert.ok(result.sources.every((source) => source.type !== "application-portfolio"));
  assert.ok(result.sources.every((source) => source.type !== "student-backup"));
  assert.ok(result.sources.some((source) => source.type === "resource-library"));
  assert.ok(result.sources.some((source) => source.type === "school-encyclopedia"));
  assert.ok(result.sources.some((source) => source.type === "major-encyclopedia"));
  assert.ok(
    result.sources.every((source) => !source.title.includes("Publication Outlet")),
    "A resource chunk with no query-token match should not consume a retrieval slot.",
  );
  assert.deepEqual(result.missingFields, []);
  assert.equal(retrievalMetrics.length, 1);
  assert.equal(retrievalMetrics[0].intent, "school");
  assert.equal(retrievalMetrics[0].selectedDocuments, result.retrieval.selectedDocuments);
  assert.equal(markdownReadCount, 9);

  const personalizedResult = await retriever.retrieve({
    user: { id: "student-1" },
    question: "How should my Robotics Portfolio compare MIT and FRC/FTC resources?",
    usePersonalContext: true,
  });
  assert.deepEqual(personalReadCalls, ["profile", "portfolio", "plan"]);
  assert.ok(personalizedResult.sources.some((source) => source.type === "application-portfolio"));
  assert.ok(personalizedResult.sources.some((source) => source.type === "student-backup"));
  assert.ok(
    personalizedResult.sources
      .filter((source) => ["application-portfolio", "student-backup"].includes(source.type))
      .every((source) => source.scope === "personal" && source.typeLabel === "个人上下文"),
  );
  assert.match(personalizedResult.context, /Robotics current plan/u);
  assert.ok(personalizedResult.missingFields.includes("推荐信准备"));

  await retriever.retrieve({
    user: { id: "student-1" },
    question: "Which robotics resources should I prioritize next?",
  });
  assert.equal(markdownReadCount, 9, "Static Markdown documents should be read once per retriever lifecycle.");

  const longPlanRetriever = createRagRetriever({
    root: tempDir,
    planning: {
      getProfile() {
        return {
          grade: "10",
          majorDirection: "Computer Science / Education Technology",
          interests: "Accessible learning tools",
        };
      },
      getLatestRagPlan() {
        return {
          sourceType: "current_plan",
          planName: "CS + Education Technology plan",
          draft: {
            targetSchool: "MIT",
            rawAnswer: "Long planning narrative. ".repeat(1_200),
            activities: Array.from({ length: 15 }, (_, index) => ({
              title: `Learning technology project ${index + 1}`,
              executionDescription: "Build and evaluate an accessible Computer Science learning prototype. ".repeat(80),
            })),
          },
        };
      },
    },
    activityPortfolio: {
      getPortfolio() {
        return {};
      },
    },
  });

  const longPlanResult = await longPlanRetriever.retrieve({
    user: { id: "student-long-plan" },
    question: "请根据我的申请档案，用 Computer Science 与 Education Technology 方向比较 MIT。",
    usePersonalContext: true,
  });
  assert.ok(longPlanResult.sources.length > 0, "An oversized current plan must not empty the RAG context.");
  assert.match(longPlanResult.context, /CS \+ Education Technology plan/u);
  assert.match(longPlanResult.context, /Computer Science \/ Education Technology/u);
  assert.match(longPlanResult.context, /MIT review should emphasize STEM depth/u);
  assert.ok(longPlanResult.context.length <= 18_000);
  assert.ok(longPlanResult.sources.some((source) => source.type === "student-backup"));
  assert.ok(longPlanResult.sources.some((source) => source.type === "school-encyclopedia" && /MIT/u.test(source.title)));

  const chunks = splitMarkdownIntoChunks([
    "# Competition catalog",
    "",
    "## Mathematics",
    "",
    "### International olympiads",
    "",
    "#### IMO",
    "",
    "Eligibility and award details.",
  ].join("\n"));
  assert.deepEqual(chunks, [
    "# Competition catalog\n\n## Mathematics\n\n### International olympiads\n\n#### IMO\n\nEligibility and award details.",
  ]);

  const longChunks = splitMarkdownIntoChunks([
    "# School guide",
    "",
    "## Official sources",
    "",
    ...Array.from({ length: 600 }, (_, index) => `- Official source ${index + 1}: ${"detail ".repeat(8)}`),
  ].join("\n"));
  assert.ok(longChunks.length > 1);
  assert.ok(longChunks.every((chunk) => chunk.length <= 2_200));
  assert.ok(longChunks.every((chunk) => chunk.includes("# School guide") && chunk.includes("## Official sources")));
  assert.ok(longChunks.every((chunk) => /^#{1,6}\s+/m.test(chunk)));
  assert.ok(
    longChunks.every((chunk) => chunk
      .split("\n")
      .filter((line) => line.trim() && !/^#{1,6}\s+/u.test(line))
      .every((line) => line.startsWith("- Official source "))),
    "Long Markdown lists should split between complete list items.",
  );

  const hierarchicalDocuments = await createStaticMarkdownDocumentLoader({
    root: tempDir,
    readMarkdownFile: async () => [
      "# Competition catalog",
      "",
      "## Mathematics",
      "",
      "### International olympiads",
      "",
      "#### IMO",
      "",
      "Eligibility and award details.",
    ].join("\n"),
  })();
  const hierarchicalSource = hierarchicalDocuments.find((document) => document.pageContent.includes("Eligibility and award details."));
  assert.ok(hierarchicalSource.metadata.title.endsWith(" / IMO"));

  const source = serializeRagSource({
    id: "rag-test",
    type: "resource-library",
    title: "Resource",
    text: [" first line ", "", "second line", "x".repeat(400)].join("\n"),
  });
  assert.equal(source.typeLabel, "资源库");
  assert.equal(source.scope, "knowledge");
  assert.ok(source.snippet.length <= 260);
  assert.match(source.snippet, /^first line\nsecond line/);

  const langChainDocument = toLangChainRagDocument({
    id: "rag-doc",
    type: "school-encyclopedia",
    title: "MIT",
    text: "MIT maker evidence.",
  });
  assert.equal(langChainDocument.pageContent, "MIT maker evidence.");
  assert.deepEqual(langChainDocument.metadata, {
    id: "rag-doc",
    type: "school-encyclopedia",
    title: "MIT",
  });
  assert.deepEqual(serializeRagSource(langChainDocument), {
    id: "rag-doc",
    type: "school-encyclopedia",
    scope: "knowledge",
    typeLabel: "院校百科",
    title: "MIT",
    snippet: "MIT maker evidence.",
  });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeRagDataFiles(root) {
  const files = {
    "competitions.md": "## FRC/FTC Robotics\nFRC and FTC robotics teams can support engineering leadership evidence.",
    "summer-schools.md": "## Robotics Summer\nA summer robotics program can deepen engineering exploration.",
    "research-projects.md": "## Polygence Robotics\nPolygence can support a structured robotics research portfolio.",
    "extracurricular-activities.md": "## Robotics Club\nRobotics club activities should show role, artifact, and impact.",
    "international-journals.md": "## Publication Outlet\nVerified manuscripts only.",
    "schools.md": "## MIT\nMIT review should emphasize STEM depth, initiative, and maker evidence.",
    "international-schools.md": "## Oxford\nOxford context is present for multi-country comparison.",
    "other-region-schools.md": "## Waterloo\nWaterloo context is present for engineering comparison.",
    "majors.md": "## Computer Science\nComputer Science connects algorithms, systems, robotics, and AI.",
  };

  await Promise.all(
    Object.entries(files).map(([file, content]) =>
      writeFile(join(root, "data", file), `${content}\n`, "utf8")),
  );
}
