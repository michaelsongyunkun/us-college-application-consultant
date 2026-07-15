import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function buildMarkdownKnowledgeRecords(sources: any[], { sourceVersion, embeddingModelVersion }: any) {
  const records: any[] = [];
  for (const source of [...sources].sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId)))) {
    const markdown = await readFile(source.path, "utf8");
    const chunks = splitMarkdownIntoStructuredChunks(markdown);
    chunks.forEach((chunk, index) => {
      const heading = chunk.headingPath.at(-1) || source.title || source.sourceId;
      const chunkSourceId = `${source.sourceId}#${chunk.sectionIndex}.${chunk.sectionChunkIndex}:${heading}`;
      records.push({
        id: sha256(chunkSourceId),
        sourceId: chunkSourceId,
        rootSourceId: source.sourceId,
        sourceType: source.sourceType,
        title: `${source.title || source.sourceId} / ${heading}`,
        content: chunk.content,
        contentHash: sha256(chunk.content),
        sourceVersion,
        updatedAt: null,
        confidence: Number.isInteger(source.confidence) ? source.confidence : 80,
        officialUrl: source.officialUrl || null,
        embeddingModelVersion,
        metadata: {
          sourcePath: source.path,
          chunkIndex: index,
          sectionIndex: chunk.sectionIndex,
          sectionChunkIndex: chunk.sectionChunkIndex,
          headingPath: chunk.headingPath,
          headingLevel: chunk.headingLevel,
          charCount: chunk.content.length,
          chunkingVersion: "markdown-headings-v2",
        },
      });
    });
  }
  return records;
}

export async function ingestMarkdownSources({ sources, repository, embed, sourceVersion, embeddingModelVersion, now = () => new Date() }: any) {
  const records = await buildMarkdownKnowledgeRecords(sources, { sourceVersion, embeddingModelVersion });
  const existing = await repository.getByIds(records.map((record: any) => record.id));
  const existingById = new Map(existing.map((record: any) => [record.id, record]));
  const changed = records.filter((record: any) => {
    const stored = existingById.get(record.id);
    return !stored || stored.contentHash !== record.contentHash || stored.embeddingModelVersion !== embeddingModelVersion;
  });
  const embeddings = changed.length ? await embed(changed.map((record: any) => record.content)) : [];
  const ingestionTimestamp = now().toISOString();
  const changedById = new Map(changed.map((record: any, index: number) => [record.id, { ...record, embedding: embeddings[index], updatedAt: ingestionTimestamp }]));
  const upserts = records.map((record: any) => {
    const changedRecord = changedById.get(record.id);
    if (changedRecord) return changedRecord;
    const stored = existingById.get(record.id) || {};
    return {
      ...record,
      embedding: stored.embedding ?? null,
      updatedAt: stored.updatedAt || ingestionTimestamp,
    };
  });
  await repository.upsertBatch(upserts);
  const deleted = await repository.deleteStaleForSources(
    sources.map((source: any) => source.sourceId),
    records.map((record: any) => record.id),
  );
  return { sources: sources.length, records: records.length, embedded: changed.length, unchanged: records.length - changed.length, deleted, sourceVersion, embeddingModelVersion };
}

export function createPostgresKnowledgeRepository({ pool }: any) {
  return {
    async getByIds(ids: string[]) {
      if (!ids.length) return [];
      const { rows } = await pool.query(`SELECT id, source_id AS "sourceId", source_type AS "sourceType", title, content,
        content_hash AS "contentHash", source_version AS "sourceVersion", updated_at AS "updatedAt", confidence,
        official_url AS "officialUrl", embedding::text AS embedding, embedding_model_version AS "embeddingModelVersion",
        metadata_json AS metadata FROM knowledge_documents WHERE id = ANY($1::text[])`, [ids]);
      return rows;
    },
    async upsertBatch(records: any[]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const record of records) {
          await client.query(`INSERT INTO knowledge_documents (id, source_id, source_type, title, content, content_hash, source_version, updated_at, confidence, official_url, embedding, embedding_model_version, metadata_json)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector,$12,$13)
            ON CONFLICT (id) DO UPDATE SET source_id=EXCLUDED.source_id, source_type=EXCLUDED.source_type, title=EXCLUDED.title, content=EXCLUDED.content,
            content_hash=EXCLUDED.content_hash, source_version=EXCLUDED.source_version, updated_at=EXCLUDED.updated_at, confidence=EXCLUDED.confidence,
            official_url=EXCLUDED.official_url, embedding=EXCLUDED.embedding, embedding_model_version=EXCLUDED.embedding_model_version, metadata_json=EXCLUDED.metadata_json`,
          [record.id, record.sourceId, record.sourceType, record.title, record.content, record.contentHash, record.sourceVersion, record.updatedAt,
            record.confidence, record.officialUrl, vectorLiteral(record.embedding), record.embeddingModelVersion, record.metadata || {}]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async deleteStaleForSources(rootSourceIds: string[], activeIds: string[]) {
      if (!rootSourceIds.length) return 0;
      const { rowCount } = await pool.query("DELETE FROM knowledge_documents WHERE split_part(source_id, '#', 1) = ANY($1::text[]) AND NOT (id = ANY($2::text[]))", [rootSourceIds, activeIds]);
      return rowCount || 0;
    },
    async keywordSearch(query: string, { limit = 20 }: any = {}) {
      const terms = buildKeywordSearchTerms(query);
      const { rows } = await pool.query(`WITH query_terms AS (SELECT unnest($2::text[]) AS term)
        SELECT id, source_id AS "sourceId", source_type AS "sourceType", title, content, content_hash AS "contentHash",
        source_version AS "sourceVersion", updated_at AS "updatedAt", confidence, official_url AS "officialUrl", embedding_model_version AS "embeddingModelVersion",
        (ts_rank_cd(content_tsv, websearch_to_tsquery('simple', $1)) * 1.5 + COALESCE((
          SELECT SUM(
            CASE WHEN knowledge_documents.title ILIKE '%' || term || '%' THEN 0.8 ELSE 0 END +
            CASE WHEN knowledge_documents.content ILIKE '%' || term || '%' THEN 0.25 ELSE 0 END +
            word_similarity(term, knowledge_documents.title) * 0.2
          ) FROM query_terms
        ), 0)) * (confidence / 100.0) AS score
        FROM knowledge_documents
        WHERE content_tsv @@ websearch_to_tsquery('simple', $1)
          OR EXISTS (SELECT 1 FROM query_terms WHERE title ILIKE '%' || term || '%' OR content ILIKE '%' || term || '%')
        ORDER BY score DESC, updated_at DESC, id LIMIT $3`, [query, terms, limit]);
      return rows;
    },
    async vectorSearch(embedding: number[], { limit = 20, embeddingModelVersion = "" }: any = {}) {
      const { rows } = await pool.query(`SELECT id, source_id AS "sourceId", source_type AS "sourceType", title, content, content_hash AS "contentHash",
        source_version AS "sourceVersion", updated_at AS "updatedAt", confidence, official_url AS "officialUrl", embedding_model_version AS "embeddingModelVersion",
        (1 - (embedding <=> $1::vector)) * (confidence / 100.0) AS score
        FROM knowledge_documents WHERE embedding IS NOT NULL AND ($2 = '' OR embedding_model_version = $2)
        ORDER BY embedding <=> $1::vector, confidence DESC, id LIMIT $3`, [vectorLiteral(embedding), embeddingModelVersion, limit]);
      return rows;
    },
  };
}

export function splitMarkdownForIngestion(markdown: string, maxChars = 4_000) {
  return splitMarkdownIntoStructuredChunks(markdown, maxChars).map((chunk) => chunk.content);
}

export function splitMarkdownIntoStructuredChunks(markdown: string, maxChars = 4_000) {
  const normalized = String(markdown).replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const sections = parseMarkdownSections(normalized);
  return sections.flatMap((section, sectionIndex) => {
    const prefix = section.headingPathEntries
      .map((entry: any) => `${"#".repeat(entry.level)} ${entry.title}`)
      .join("\n\n");
    const body = section.body.trim();
    const complete = [prefix, body].filter(Boolean).join("\n\n");
    if (complete.length <= maxChars) return [toStructuredChunk(section, sectionIndex, 0, complete)];

    const safePrefix = prefix.length >= maxChars ? prefix.slice(0, maxChars) : prefix;
    const availableBodyChars = Math.max(1, maxChars - safePrefix.length - (safePrefix ? 2 : 0));
    const bodyChunks = splitTextToMax(body || complete, availableBodyChars);
    return bodyChunks.map((bodyChunk, sectionChunkIndex) => {
      const content = [safePrefix, bodyChunk].filter(Boolean).join("\n\n").slice(0, maxChars);
      return toStructuredChunk(section, sectionIndex, sectionChunkIndex, content);
    });
  });
}

export function buildKeywordSearchTerms(query: string, maxTerms = 12) {
  const normalized = String(query).normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalized) return [];
  const stopWords = new Set(["the", "and", "for", "with", "how", "what", "which", "怎么", "如何", "哪些", "什么", "一个"]);
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;
  const segmented = segmenter
    ? [...segmenter.segment(normalized)].filter((item) => item.isWordLike).map((item) => item.segment)
    : normalized.match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}]{2,}/gu) || [];
  const terms: string[] = [];
  for (const rawTerm of segmented) {
    const term = rawTerm.trim();
    if (term.length < 2 || stopWords.has(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length >= maxTerms) break;
  }
  for (const run of normalized.match(/[\p{Script=Han}]{3,}/gu) || []) {
    for (let index = 0; index <= run.length - 3 && terms.length < maxTerms; index += 1) {
      const trigram = run.slice(index, index + 3);
      if (!terms.includes(trigram)) terms.push(trigram);
    }
  }
  return terms.length ? terms : [normalized];
}

function parseMarkdownSections(markdown: string) {
  const sections: any[] = [];
  const headingPathEntries: any[] = [];
  let current: any = { headingPathEntries: [], bodyLines: [] };
  const flush = () => {
    const body = current.bodyLines.join("\n").trim();
    if (body || current.headingPathEntries.length) sections.push({ headingPathEntries: current.headingPathEntries, body });
  };
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/u);
    if (!heading) {
      current.bodyLines.push(line);
      continue;
    }
    flush();
    const level = heading[1].length;
    headingPathEntries.splice(level - 1);
    headingPathEntries[level - 1] = { level, title: heading[2].trim() };
    current = { headingPathEntries: headingPathEntries.filter(Boolean).map((entry) => ({ ...entry })), bodyLines: [] };
  }
  flush();
  return sections;
}

function splitTextToMax(text: string, maxChars: number) {
  if (!text) return [""];
  const output: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/gu).map((entry) => entry.trim()).filter(Boolean)) {
    if (paragraph.length > maxChars) {
      if (current) { output.push(current); current = ""; }
      for (let offset = 0; offset < paragraph.length; offset += maxChars) output.push(paragraph.slice(offset, offset + maxChars));
      continue;
    }
    const combined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (combined.length > maxChars) { output.push(current); current = paragraph; }
    else current = combined;
  }
  if (current) output.push(current);
  return output.length ? output : [text.slice(0, maxChars)];
}

function toStructuredChunk(section: any, sectionIndex: number, sectionChunkIndex: number, content: string) {
  const headingPath = section.headingPathEntries.map((entry: any) => entry.title);
  return {
    content,
    headingPath,
    headingLevel: section.headingPathEntries.at(-1)?.level || 0,
    sectionIndex,
    sectionChunkIndex,
  };
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function vectorLiteral(value: any) {
  if (Array.isArray(value)) return `[${value.map((entry) => Number(entry)).join(",")}]`;
  if (typeof value === "string" && /^\[(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?:,-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)*\]$/iu.test(value.replace(/\s+/gu, ""))) return value;
  return null;
}
