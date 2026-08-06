import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  buildAdmissionsKnowledgeGraph,
  formatGraphFacts,
} from "../domain/admissions-knowledge-graph.mjs";
import { parseApplicationRoundSchoolsMarkdown } from "../domain/application-round-schools.mjs";
import { parseMajorsMarkdown } from "../domain/major-encyclopedia.mjs";
import { parseSchoolsMarkdown } from "../domain/school-encyclopedia.mjs";

const ADMISSIONS_GRAPH_FILES = new Set([
  "majors.md",
  "schools.md",
  "international-schools.md",
  "other-region-schools.md",
  "application-round-schools.md",
]);

export async function buildAdmissionsGraphFromMarkdownSources(sources: any[], { readMarkdownFile = readFile }: any = {}) {
  const selected = [...sources]
    .filter((source) => ADMISSIONS_GRAPH_FILES.has(basename(String(source.path || source.sourceId || ""))))
    .sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId)));
  const markdownByFile = new Map<string, string>();
  await Promise.all(selected.map(async (source) => {
    const file = basename(String(source.path || source.sourceId));
    markdownByFile.set(file, await readMarkdownFile(source.path, "utf8"));
  }));

  return buildAdmissionsKnowledgeGraph({
    majors: parseMajorsMarkdown(markdownByFile.get("majors.md") || ""),
    schools: ["schools.md", "international-schools.md", "other-region-schools.md"]
      .flatMap((file) => parseSchoolsMarkdown(markdownByFile.get(file) || "")),
    applicationRoundSchools: parseApplicationRoundSchoolsMarkdown(markdownByFile.get("application-round-schools.md") || ""),
  });
}

export async function ingestAdmissionsKnowledgeGraph({
  sources,
  repository,
  sourceVersion,
  now = () => new Date(),
}: any) {
  const graph = await buildAdmissionsGraphFromMarkdownSources(sources);
  const updatedAt = now().toISOString();
  await repository.replaceGraph(graph, { sourceVersion, updatedAt });
  return {
    entities: graph.entities.length,
    relations: graph.relations.length,
    sourceVersion,
    updatedAt,
  };
}

export function createPostgresKnowledgeGraphRepository({ pool }: any) {
  return {
    async replaceGraph(graph: any, { sourceVersion, updatedAt }: any) {
      const client = await pool.connect();
      const entityIds = graph.entities.map((entity: any) => entity.id);
      const relationIds = graph.relations.map((relation: any) => relation.id);
      try {
        await client.query("BEGIN");
        for (const entity of graph.entities) {
          await client.query(`INSERT INTO knowledge_entities (id, entity_type, name, aliases_json, metadata_json, source_version, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (id) DO UPDATE SET entity_type=EXCLUDED.entity_type, name=EXCLUDED.name, aliases_json=EXCLUDED.aliases_json,
            metadata_json=EXCLUDED.metadata_json, source_version=EXCLUDED.source_version, updated_at=EXCLUDED.updated_at`,
          [entity.id, entity.type, entity.name, entity.aliases || [], entity.metadata || {}, sourceVersion, updatedAt]);
        }
        for (const relation of graph.relations) {
          await client.query(`INSERT INTO knowledge_relations (id, from_entity_id, to_entity_id, relation_type, source_id, source_version, confidence, valid_from, valid_to, official_url, metadata_json, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (id) DO UPDATE SET from_entity_id=EXCLUDED.from_entity_id, to_entity_id=EXCLUDED.to_entity_id,
            relation_type=EXCLUDED.relation_type, source_id=EXCLUDED.source_id, source_version=EXCLUDED.source_version,
            confidence=EXCLUDED.confidence, valid_from=EXCLUDED.valid_from, valid_to=EXCLUDED.valid_to,
            official_url=EXCLUDED.official_url, metadata_json=EXCLUDED.metadata_json, updated_at=EXCLUDED.updated_at`,
          [relation.id, relation.from, relation.to, relation.type, relation.sourceId || "", sourceVersion,
            relation.confidence, relation.metadata?.validFrom || null, relation.metadata?.validTo || null,
            relation.metadata?.officialUrl || null, relation.metadata || {}, updatedAt]);
        }
        await client.query("DELETE FROM knowledge_relations WHERE NOT (id = ANY($1::text[]))", [relationIds]);
        await client.query("DELETE FROM knowledge_entities WHERE NOT (id = ANY($1::text[]))", [entityIds]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async search(query: string, { queryPlan = {}, seedLimit = 12, maxDepth = 2, factLimit = 16 }: any = {}) {
      const terms = buildKnowledgeGraphQueryTerms(query, queryPlan);
      if (!terms.length) return [];
      const { rows } = await pool.query(`WITH RECURSIVE query_terms AS (
          SELECT unnest($1::text[]) AS term
        ), seed AS (
          SELECT e.id, (
            SELECT COUNT(*) FROM query_terms qt
            WHERE e.name ILIKE '%' || qt.term || '%'
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(e.aliases_json) alias WHERE alias ILIKE '%' || qt.term || '%')
          ) AS match_score
          FROM knowledge_entities e
          WHERE EXISTS (
            SELECT 1 FROM query_terms qt
            WHERE e.name ILIKE '%' || qt.term || '%'
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(e.aliases_json) alias WHERE alias ILIKE '%' || qt.term || '%')
          )
          ORDER BY match_score DESC, e.id
          LIMIT $2
        ), walk(entity_id, depth, path) AS (
          SELECT id, 0, ARRAY[id]::text[] FROM seed
          UNION ALL
          SELECT CASE WHEN relation.from_entity_id = walk.entity_id THEN relation.to_entity_id ELSE relation.from_entity_id END,
            walk.depth + 1,
            walk.path || CASE WHEN relation.from_entity_id = walk.entity_id THEN relation.to_entity_id ELSE relation.from_entity_id END
          FROM walk
          JOIN knowledge_relations relation
            ON relation.from_entity_id = walk.entity_id OR relation.to_entity_id = walk.entity_id
          WHERE walk.depth < $3
            AND NOT (CASE WHEN relation.from_entity_id = walk.entity_id THEN relation.to_entity_id ELSE relation.from_entity_id END = ANY(walk.path))
        ), visited AS (
          SELECT entity_id, MIN(depth) AS depth FROM walk GROUP BY entity_id
        ), selected_relations AS (
          SELECT relation.*
          FROM knowledge_relations relation
          JOIN visited from_visit ON from_visit.entity_id = relation.from_entity_id
          JOIN visited to_visit ON to_visit.entity_id = relation.to_entity_id
          ORDER BY relation.confidence DESC, relation.id
          LIMIT $4
        )
        SELECT relation.id, relation.relation_type AS "relationType", relation.source_id AS "sourceId",
          relation.confidence, relation.metadata_json AS "relationMetadata",
          from_entity.id AS "fromId", from_entity.entity_type AS "fromType", from_entity.name AS "fromName",
          from_entity.aliases_json AS "fromAliases", from_entity.metadata_json AS "fromMetadata",
          to_entity.id AS "toId", to_entity.entity_type AS "toType", to_entity.name AS "toName",
          to_entity.aliases_json AS "toAliases", to_entity.metadata_json AS "toMetadata",
          EXISTS (
            SELECT 1 FROM seed
            WHERE seed.id = relation.from_entity_id OR seed.id = relation.to_entity_id
          ) AS "queryAnchored",
          (SELECT COUNT(*)::int FROM seed) AS "seedCount",
          (SELECT COUNT(*)::int FROM visited) AS "visitedCount"
        FROM selected_relations relation
        JOIN knowledge_entities from_entity ON from_entity.id = relation.from_entity_id
        JOIN knowledge_entities to_entity ON to_entity.id = relation.to_entity_id
        ORDER BY relation.confidence DESC, relation.id`, [terms, seedLimit, maxDepth, factLimit]);
      return rows;
    },
  };
}

export function createPostgresAdmissionsKnowledgeGraphAdapter({ pool, fallback = null, logger = null }: any) {
  const repository = createPostgresKnowledgeGraphRepository({ pool });
  return {
    async search(input: any = {}) {
      try {
        const rows = await repository.search(input.query, { queryPlan: input.queryPlan });
        if (!rows.length && fallback?.search) return fallback.search(input);
        const facts = rows.map(toGraphFact);
        return {
          adapter: "postgres-admissions-graph",
          status: "applied",
          facts,
          entities: uniqueEntities(facts),
          sourceIds: [...new Set(facts.map((fact: any) => fact.sourceId).filter(Boolean))],
          context: formatGraphFacts(facts),
          sources: facts.slice(0, 8).map(serializeGraphSource),
          traversal: {
            seedEntities: Array.from({ length: Number(rows[0]?.seedCount || 0) }, (_, index) => `seed-${index + 1}`),
            visitedEntities: Number(rows[0]?.visitedCount || 0),
            selectedFacts: facts.length,
            maxDepth: 2,
          },
        };
      } catch (error) {
        logger?.warn?.({ event: "postgres_knowledge_graph_fallback", errorName: error?.name || "Error" });
        if (fallback?.search) return fallback.search(input);
        throw error;
      }
    },
  };
}

export function buildKnowledgeGraphQueryTerms(query: string, queryPlan: any = {}, limit = 20) {
  const values = [
    query,
    ...(queryPlan.entities || []).map((entity: any) => entity.value),
    ...(queryPlan.constraints?.rounds || []),
  ];
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;
  const terms = values
    .flatMap((value) => {
      const normalized = String(value || "").normalize("NFKC").toLocaleLowerCase();
      if (!segmenter) return normalized.match(/[\p{L}\p{N}+#.-]{2,}/gu) || [];
      return [...segmenter.segment(normalized)]
        .filter((entry) => entry.isWordLike)
        .map((entry) => entry.segment);
    })
    .map((term) => term.trim())
    .filter((term) => !["什么", "怎么", "如何", "哪些", "the", "and", "with", "what", "which", "how"].includes(term));
  return [...new Set(terms)].slice(0, limit);
}

function toGraphFact(row: any) {
  return {
    id: row.id,
    subject: { id: row.fromId, type: row.fromType, name: row.fromName, aliases: row.fromAliases || [], metadata: row.fromMetadata || {} },
    predicate: row.relationType,
    object: { id: row.toId, type: row.toType, name: row.toName, aliases: row.toAliases || [], metadata: row.toMetadata || {} },
    sourceId: row.sourceId,
    confidence: Number(row.confidence || 0),
    queryAnchored: Boolean(row.queryAnchored),
    metadata: row.relationMetadata || {},
  };
}

function serializeGraphSource(fact: any) {
  return {
    id: `kg:${fact.id}`,
    type: "knowledge-graph",
    typeLabel: "知识图谱",
    title: `${fact.subject.name} → ${fact.object.name}`,
    snippet: `${fact.subject.name} --${fact.predicate}--> ${fact.object.name}`,
    sourceId: fact.sourceId,
    confidence: fact.confidence,
  };
}

function uniqueEntities(facts: any[]) {
  const byId = new Map();
  for (const fact of facts) {
    byId.set(fact.subject.id, fact.subject);
    byId.set(fact.object.id, fact.object);
  }
  return [...byId.values()];
}
