#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbeddingClientFromEnv } from "../src/infrastructure/embedding-client.ts";
import { createPostgresKnowledgeRepository, ingestMarkdownSources } from "../src/infrastructure/markdown-ingestion.ts";
import {
  createPostgresKnowledgeGraphRepository,
  ingestAdmissionsKnowledgeGraph,
} from "../src/infrastructure/postgres-knowledge-graph.ts";
import { createPostgresPool, migratePostgres } from "../src/infrastructure/postgres.ts";
import { loadEnvFile } from "../src/server/env-loader.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnvFile(join(root, ".env"));
const keywordOnly = process.argv.includes("--keyword-only");
const markdownFiles = await findMarkdownFiles(join(root, "data"));
const sources = markdownFiles.map((path) => ({
  sourceId: relative(root, path).replace(/\\/gu, "/"),
  path,
  sourceType: "business-knowledge",
  title: relative(join(root, "data"), path).replace(/\\/gu, "/"),
  confidence: 80,
  officialUrl: null,
}));
const embedding = keywordOnly ? { modelVersion: "keyword-only", embed: async (texts) => texts.map(() => null) } : createEmbeddingClientFromEnv(process.env);
const pool = createPostgresPool(process.env);
try {
  await migratePostgres(pool);
  const report = await ingestMarkdownSources({
    sources,
    repository: createPostgresKnowledgeRepository({ pool }),
    embed: (texts) => embedding.embed(texts),
    sourceVersion: process.env.KNOWLEDGE_SOURCE_VERSION || new Date().toISOString().slice(0, 10),
    embeddingModelVersion: embedding.modelVersion,
  });
  const graphReport = await ingestAdmissionsKnowledgeGraph({
    sources,
    repository: createPostgresKnowledgeGraphRepository({ pool }),
    sourceVersion: process.env.KNOWLEDGE_SOURCE_VERSION || new Date().toISOString().slice(0, 10),
  });
  console.log(JSON.stringify({ ...report, knowledgeGraph: graphReport }, null, 2));
} finally { await pool.end(); }

async function findMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? findMarkdownFiles(join(directory, entry.name)) : entry.name.endsWith(".md") ? [join(directory, entry.name)] : []));
  return nested.flat().sort();
}
