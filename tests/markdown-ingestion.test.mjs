import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMarkdownKnowledgeRecords,
  ingestMarkdownSources,
  splitMarkdownIntoStructuredChunks,
} from "../src/infrastructure/markdown-ingestion.ts";

const structured = splitMarkdownIntoStructuredChunks(`# Guide\n\nIntro.\n\n## Courses\n\n### AP Calculus BC\n\n${"Detailed course planning. ".repeat(12)}`, 120);
assert.equal(structured.length > 1, true);
assert.deepEqual(structured.at(-1).headingPath, ["Guide", "Courses", "AP Calculus BC"]);
assert.equal(structured.at(-1).headingLevel, 3);
assert.equal(structured.at(-1).sectionChunkIndex >= 0, true);
assert.equal(structured.every((chunk) => chunk.content.length <= 120), true);
assert.equal(
  structured.some((chunk) => chunk.content.trim().endsWith("## Courses")),
  false,
  "Headings without evidence should not become standalone knowledge chunks.",
);
assert.ok(
  structured
    .filter((chunk) => chunk.headingPath.at(-1) === "AP Calculus BC")
    .every((chunk) => chunk.content.includes("# Guide") && chunk.content.includes("## Courses")),
  "Every continuation chunk should retain its complete heading path.",
);

const root = await mkdtemp(join(tmpdir(), "consultant-ingestion-"));
try {
  const path = join(root, "schools.md");
  await writeFile(path, "# Schools\n\n## Example University\nOfficial deadline information.\n", "utf8");
  const source = { sourceId: "schools", path, sourceType: "school", officialUrl: "https://example.edu/admissions", confidence: 95 };
  const first = await buildMarkdownKnowledgeRecords([source], { sourceVersion: "2026-07-12", embeddingModelVersion: "embed-v1" });
  const second = await buildMarkdownKnowledgeRecords([source], { sourceVersion: "2026-07-12", embeddingModelVersion: "embed-v1" });
  assert.deepEqual(first, second, "ingestion records must be deterministic");
  assert.ok(first.every((record) => record.contentHash && record.sourceId && record.updatedAt === null));
  assert.ok(first.every((record) => record.metadata.chunkingVersion === "markdown-headings-v3"));
  assert.ok(first.every((record) => Array.isArray(record.metadata.headingPath)));
  assert.ok(first.every((record) => Number.isInteger(record.metadata.charCount)));

  const stored = new Map();
  let embeddingCalls = 0;
  const repository = {
    async getByIds(ids) { return ids.map((id) => stored.get(id)).filter(Boolean); },
    async upsertBatch(records) { records.forEach((record) => stored.set(record.id, record)); },
    async deleteStaleForSources() { return 0; },
  };
  const embed = async (texts) => { embeddingCalls += texts.length; return texts.map(() => [1, 0, 0]); };
  const report1 = await ingestMarkdownSources({ sources: [source], repository, embed, sourceVersion: "2026-07-12", embeddingModelVersion: "embed-v1" });
  const report2 = await ingestMarkdownSources({ sources: [source], repository, embed, sourceVersion: "2026-07-12", embeddingModelVersion: "embed-v1" });
  assert.ok(report1.embedded > 0);
  assert.equal(report2.embedded, 0, "unchanged Markdown must not be re-embedded");
  assert.equal(embeddingCalls, report1.embedded);

  const existingRows = first.map((record) => ({
    id: record.id,
    contentHash: record.contentHash,
    embeddingModelVersion: record.embeddingModelVersion,
    embedding: [1, 0, 0],
    updatedAt: "2026-07-12T00:00:00.000Z",
  }));
  let metadataRefreshUpserts = [];
  const metadataRefreshRepository = {
    async getByIds() { return existingRows; },
    async upsertBatch(records) { metadataRefreshUpserts = records; },
    async deleteStaleForSources() { return 0; },
  };
  const metadataRefresh = await ingestMarkdownSources({
    sources: [source],
    repository: metadataRefreshRepository,
    embed: async () => { throw new Error("unchanged content must not be embedded"); },
    sourceVersion: "2026-07-13",
    embeddingModelVersion: "embed-v1",
    now: () => new Date("2026-07-13T00:00:00.000Z"),
  });
  assert.equal(metadataRefresh.embedded, 0);
  assert.ok(metadataRefreshUpserts.every((record) => record.sourceId && record.title && record.content));
  assert.ok(metadataRefreshUpserts.every((record) => record.sourceVersion === "2026-07-13"));
  assert.ok(metadataRefreshUpserts.every((record) => record.updatedAt === "2026-07-12T00:00:00.000Z"));
  assert.ok(metadataRefreshUpserts.every((record) => record.embedding.length === 3));
} finally {
  await rm(root, { recursive: true, force: true });
}
