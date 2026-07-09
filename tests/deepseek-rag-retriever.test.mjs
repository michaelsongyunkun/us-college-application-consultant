import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRagRetriever,
  serializeRagSource,
  splitMarkdownIntoChunks,
  toLangChainRagDocument,
} from "../src/server/deepseek-rag-service.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-rag-retriever-"));

try {
  await mkdir(join(tempDir, "data"));
  await writeRagDataFiles(tempDir);

  const retrievalMetrics = [];
  const retriever = createRagRetriever({
    root: tempDir,
    planning: {
      getProfile() {
        return {
          grade: "10",
          majorDirection: "Computer Science",
          interests: "Robotics Portfolio",
        };
      },
      listRagBackups() {
        return [
          {
            sourceType: "snapshot",
            planName: "Robotics plan",
            note: "baseline",
            narrative: "Connect robotics research with community impact.",
          },
        ];
      },
    },
    activityPortfolio: {
      getPortfolio() {
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
  assert.match(result.context, /Robotics Portfolio/);
  assert.equal(result.retrieval.intent, "school");
  assert.ok(result.retrieval.totalDocuments >= 8);
  assert.ok(result.retrieval.selectedDocuments > 0);
  assert.ok(Number.isInteger(result.retrieval.retrievalMs));
  assert.ok(result.sources.some((source) => source.type === "application-portfolio"));
  assert.ok(result.sources.some((source) => source.type === "student-backup"));
  assert.ok(result.sources.some((source) => source.type === "resource-library"));
  assert.ok(result.sources.some((source) => source.type === "school-encyclopedia"));
  assert.ok(result.sources.some((source) => source.type === "major-encyclopedia"));
  assert.ok(result.missingFields.includes("推荐信准备"));
  assert.equal(retrievalMetrics.length, 1);
  assert.equal(retrievalMetrics[0].intent, "school");
  assert.equal(retrievalMetrics[0].selectedDocuments, result.retrieval.selectedDocuments);

  const chunks = splitMarkdownIntoChunks("## Alpha\nfirst\n\n## Beta\nsecond");
  assert.deepEqual(chunks, ["## Alpha\nfirst", "## Beta\nsecond"]);

  const longChunks = splitMarkdownIntoChunks(`## Long\n${Array.from({ length: 600 }, () => "long line").join("\n")}`);
  assert.ok(longChunks.length > 1);

  const source = serializeRagSource({
    id: "rag-test",
    type: "resource-library",
    title: "Resource",
    text: [" first line ", "", "second line", "x".repeat(400)].join("\n"),
  });
  assert.equal(source.typeLabel, "资源库");
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
    "international-journals.md": "## Student Research Journal\nUse journals only when the student has a verified manuscript.",
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
