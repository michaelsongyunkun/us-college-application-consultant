import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildAdmissionsGraphFromMarkdownSources,
  buildKnowledgeGraphQueryTerms,
  createPostgresAdmissionsKnowledgeGraphAdapter,
  createPostgresKnowledgeGraphRepository,
  ingestAdmissionsKnowledgeGraph,
} from "../src/infrastructure/postgres-knowledge-graph.ts";

const root = await mkdtemp(join(tmpdir(), "admissions-graph-"));
try {
  const files = {
    "majors.md": "# 专业\n\n## 计算机\n\n### 001. Computer Science 计算机科学\n- 常见学习内容：编程、算法\n- 就业方向：软件工程师\n- 专业强校：MIT\n",
    "schools.md": "## 综合性大学\n\n#### #1 麻省理工 MIT\n- **地理位置**：Cambridge, Massachusetts\n",
    "international-schools.md": "# 国际院校\n",
    "other-region-schools.md": "# 其他地区\n",
    "application-round-schools.md": "# 轮次\n\n#### Massachusetts Institute of Technology\n- EA：是\n- RD：是\n- ED1：否\n",
  };
  const sources = [];
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await writeFile(path, content, "utf8");
    sources.push({ sourceId: `data/${file}`, path });
  }

  const graph = await buildAdmissionsGraphFromMarkdownSources(sources);
  assert.ok(graph.entities.some((entity) => entity.type === "major"));
  assert.ok(graph.relations.some((relation) => relation.type === "SUPPORTS_APPLICATION_ROUND"));

  let replaced = null;
  const report = await ingestAdmissionsKnowledgeGraph({
    sources,
    repository: { async replaceGraph(nextGraph, metadata) { replaced = { nextGraph, metadata }; } },
    sourceVersion: "2026-08-03",
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });
  assert.equal(report.entities, replaced.nextGraph.entities.length);
  assert.equal(replaced.metadata.sourceVersion, "2026-08-03");
} finally {
  await rm(root, { recursive: true, force: true });
}

const terms = buildKnowledgeGraphQueryTerms("MIT 的 EA 和 Computer Science", {
  entities: [{ type: "application-round", value: "EA" }],
  constraints: { rounds: ["EA"] },
});
assert.ok(terms.includes("mit"));
assert.ok(terms.includes("ea"));

const migration = await readFile(new URL("../drizzle/0003_admissions_knowledge_graph.sql", import.meta.url), "utf8");
assert.match(migration, /CREATE TABLE IF NOT EXISTS "knowledge_entities"/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS "knowledge_relations"/u);
assert.match(migration, /knowledge_relations_confidence_check/u);
const migrationJournal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
assert.equal(migrationJournal.entries.some((entry) => entry.tag === "0003_admissions_knowledge_graph"), true);

let capturedSql = "";
let capturedParameters = [];
const repository = createPostgresKnowledgeGraphRepository({
  pool: {
    async query(sql, parameters) {
      capturedSql = sql;
      capturedParameters = parameters;
      return { rows: [] };
    },
  },
});
await repository.search("MIT EA", { queryPlan: { constraints: { rounds: ["EA"] } } });
assert.match(capturedSql, /WITH RECURSIVE/u);
assert.match(capturedSql, /knowledge_relations/u);
assert.deepEqual(capturedParameters[0], ["mit", "ea"]);

const adapter = createPostgresAdmissionsKnowledgeGraphAdapter({
  pool: {
    async query() {
      return {
        rows: [{
          id: "relation-1",
          relationType: "SUPPORTS_APPLICATION_ROUND",
          sourceId: "data/application-round-schools.md",
          confidence: 95,
          fromId: "school:mit",
          fromType: "school",
          fromName: "MIT",
          fromAliases: [],
          fromMetadata: {},
          toId: "application-round:ea",
          toType: "application-round",
          toName: "EA",
          toAliases: [],
          toMetadata: {},
          relationMetadata: {},
          queryAnchored: true,
          seedCount: 2,
          visitedCount: 4,
        }],
      };
    },
  },
});
const result = await adapter.search({ query: "MIT EA", queryPlan: { constraints: { rounds: ["EA"] } } });
assert.equal(result.adapter, "postgres-admissions-graph");
assert.equal(result.facts[0].predicate, "SUPPORTS_APPLICATION_ROUND");
assert.equal(result.facts[0].queryAnchored, true);
assert.match(result.context, /MIT/u);
