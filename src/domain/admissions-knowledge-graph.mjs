const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_FACT_LIMIT = 8;

export function buildAdmissionsKnowledgeGraph({
  majors = [],
  schools = [],
  applicationRoundSchools = [],
} = {}) {
  const entities = new Map();
  const relations = new Map();
  const aliasIndex = new Map();
  const schoolEntityIds = new Set();
  const schoolSearchIndex = new Map();

  const addEntity = (value) => {
    const entity = normalizeEntity(value);
    if (!entity.id || !entity.name) return null;
    const existing = entities.get(entity.id);
    const merged = existing
      ? {
          ...existing,
          ...entity,
          aliases: uniqueStrings([...(existing.aliases || []), ...(entity.aliases || [])]),
          metadata: { ...(existing.metadata || {}), ...(entity.metadata || {}) },
        }
      : entity;
    entities.set(merged.id, merged);
    if (merged.type === "school") {
      schoolEntityIds.add(merged.id);
      const normalizedAliases = uniqueStrings([merged.name, ...merged.aliases].map(normalizeLookup));
      schoolSearchIndex.set(merged.id, normalizedAliases);
      for (const key of normalizedAliases) {
        if (key && !aliasIndex.has(key)) aliasIndex.set(key, merged.id);
      }
    }
    return merged;
  };

  const addRelation = (value) => {
    const relation = normalizeRelation(value);
    if (!relation.from || !relation.to || !relation.type) return null;
    if (!entities.has(relation.from) || !entities.has(relation.to)) return null;
    relations.set(relation.id, relation);
    return relation;
  };

  for (const school of schools) {
    const schoolEntity = addEntity({
      id: `school:${slugify(school.id || school.name)}`,
      type: "school",
      name: school.name,
      aliases: buildSchoolAliases(school.name),
      metadata: {
        category: school.category || "",
        rank: school.rank || "",
        location: school.location || "",
        region: school.region || "",
        popularMajors: school.popularMajors || "",
        admissionPreferences: school.admissionPreferences || "",
        officialUrl: school.website || "",
        sourceId: schoolSourceId(school),
      },
    });
    if (!schoolEntity) continue;

    for (const location of uniqueStrings([school.region, school.location])) {
      const locationEntity = addEntity({
        id: `location:${slugify(location)}`,
        type: "location",
        name: location,
      });
      addRelation({
        from: schoolEntity.id,
        to: locationEntity?.id,
        type: "LOCATED_IN",
        sourceId: schoolEntity.metadata.sourceId,
        confidence: 90,
      });
    }
  }

  for (const major of majors) {
    const sourceId = "data/majors.md";
    const majorEntity = addEntity({
      id: `major:${slugify(major.id || major.englishName || major.title)}`,
      type: "major",
      name: major.title || major.englishName || major.chineseName,
      aliases: uniqueStrings([major.englishName, major.chineseName, major.searchName]),
      metadata: {
        category: major.category || "",
        admissionDifficulty: major.admissionDifficulty || "",
        sourceId,
      },
    });
    if (!majorEntity) continue;

    if (major.category) {
      const category = addEntity({
        id: `major-category:${slugify(major.category)}`,
        type: "major-category",
        name: major.category,
        metadata: { sourceId },
      });
      addRelation({
        from: majorEntity.id,
        to: category?.id,
        type: "BELONGS_TO_CATEGORY",
        sourceId,
        confidence: 100,
      });
    }

    for (const topic of splitKnowledgeList(major.learningContent, 10)) {
      const topicEntity = addEntity({
        id: `learning-topic:${slugify(topic)}`,
        type: "learning-topic",
        name: topic,
        metadata: { sourceId },
      });
      addRelation({
        from: majorEntity.id,
        to: topicEntity?.id,
        type: "STUDIES_TOPIC",
        sourceId,
        confidence: 90,
      });
    }

    for (const career of splitKnowledgeList(major.careerPaths, 8)) {
      const careerEntity = addEntity({
        id: `career:${slugify(career)}`,
        type: "career",
        name: career,
        metadata: { sourceId },
      });
      addRelation({
        from: majorEntity.id,
        to: careerEntity?.id,
        type: "LEADS_TO_CAREER",
        sourceId,
        confidence: 85,
      });
    }

    for (const schoolName of splitKnowledgeList(major.strongSchools, 12)) {
      const schoolEntity = resolveOrCreateSchool({
        name: schoolName,
        entities,
        aliasIndex,
        schoolEntityIds,
        schoolSearchIndex,
        addEntity,
        sourceId,
      });
      addRelation({
        from: schoolEntity?.id,
        to: majorEntity.id,
        type: "STRONG_FOR_MAJOR",
        sourceId,
        confidence: 80,
      });
    }
  }

  for (const school of applicationRoundSchools) {
    const schoolEntity = resolveOrCreateSchool({
      name: school.name,
      entities,
      aliasIndex,
      schoolEntityIds,
      schoolSearchIndex,
      addEntity,
      sourceId: "data/application-round-schools.md",
    });
    if (!schoolEntity) continue;
    for (const [round, value] of Object.entries(school.rounds || {})) {
      if (!isSupportedRound(round, value)) continue;
      const roundEntity = addEntity({
        id: `application-round:${round.toLocaleLowerCase()}`,
        type: "application-round",
        name: round.toUpperCase(),
        aliases: round === "rea" ? ["SCEA"] : [],
        metadata: { sourceId: "data/application-round-schools.md" },
      });
      addRelation({
        from: schoolEntity.id,
        to: roundEntity?.id,
        type: "SUPPORTS_APPLICATION_ROUND",
        sourceId: "data/application-round-schools.md",
        confidence: 95,
        metadata: { value: String(value) },
      });
    }
  }

  linkSchoolMajorMentions({ entities, relations, addRelation });

  return {
    entities: [...entities.values()].sort(compareById),
    relations: [...relations.values()].sort(compareById),
  };
}

export function searchAdmissionsKnowledgeGraph(graph = {}, {
  query = "",
  queryPlan = {},
  evidenceText = "",
  maxDepth = DEFAULT_MAX_DEPTH,
  factLimit = DEFAULT_FACT_LIMIT,
} = {}) {
  const entities = new Map((graph.entities || []).map((entity) => [entity.id, entity]));
  const relations = graph.relations || [];
  if (!entities.size || !relations.length) return emptyGraphSearchResult();

  const queryTerms = buildSearchTerms(query);
  const evidenceTerms = buildSearchTerms(evidenceText);
  const requestedRounds = new Set((queryPlan.constraints?.rounds || []).map((round) => round.toUpperCase()));
  const scoredEntities = [...entities.values()].map((entity) => {
    const queryScore = scoreEntity(entity, queryTerms, queryPlan);
    const evidenceScore = scoreEntity(entity, evidenceTerms, queryPlan, { includeConstraintBoost: false });
    return { entity, queryScore, score: queryScore * 3 + evidenceScore };
  });
  const queryMatchedEntityIds = new Set(scoredEntities
    .filter(({ queryScore }) => queryScore > 0)
    .map(({ entity }) => entity.id));
  const evidenceMatchedEntityIds = new Set(scoredEntities
    .filter(({ score, queryScore }) => score > 0 && score > queryScore * 3)
    .map(({ entity }) => entity.id));
  const seedScores = scoredEntities
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.entity.id.localeCompare(right.entity.id))
    .slice(0, 12);

  if (!seedScores.length) return emptyGraphSearchResult();

  const adjacency = buildAdjacency(relations);
  const seedEntityIds = new Set(seedScores.map(({ entity }) => entity.id));
  const visited = new Map(seedScores.map(({ entity, score }) => [entity.id, { depth: 0, score }]));
  let frontier = seedScores.map(({ entity }) => entity.id);

  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next = [];
    for (const entityId of frontier) {
      for (const relation of adjacency.get(entityId) || []) {
        const relatedId = relation.from === entityId ? relation.to : relation.from;
        if (visited.has(relatedId)) continue;
        const relationBoost = requestedRounds.size && relation.type === "SUPPORTS_APPLICATION_ROUND"
          && requestedRounds.has(entities.get(relatedId)?.name?.toUpperCase()) ? 4 : 0;
        visited.set(relatedId, {
          depth,
          score: (visited.get(entityId)?.score || 0) * 0.65 + relation.confidence / 100 + relationBoost,
        });
        next.push(relatedId);
      }
    }
    frontier = next;
  }

  const rankedFacts = relations
    .filter((relation) => visited.has(relation.from) && visited.has(relation.to))
    .map((relation) => ({
      id: relation.id,
      subject: entities.get(relation.from),
      predicate: relation.type,
      object: entities.get(relation.to),
      sourceId: relation.sourceId,
      confidence: relation.confidence,
      metadata: relation.metadata || {},
      queryAnchored: queryMatchedEntityIds.has(relation.from)
        || queryMatchedEntityIds.has(relation.to),
      evidenceAnchored: evidenceMatchedEntityIds.has(relation.from)
        || evidenceMatchedEntityIds.has(relation.to),
      score: (visited.get(relation.from)?.score || 0)
        + (visited.get(relation.to)?.score || 0)
        + (seedEntityIds.has(relation.from) ? 10 : 0)
        + (seedEntityIds.has(relation.to) ? 10 : 0)
        + (queryMatchedEntityIds.has(relation.from) ? 10 : 0)
        + (queryMatchedEntityIds.has(relation.to) ? 10 : 0),
    }))
    .filter((fact) => !requestedRounds.size
      || fact.predicate !== "SUPPORTS_APPLICATION_ROUND"
      || requestedRounds.has(fact.object?.name?.toUpperCase()))
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.id.localeCompare(right.id));
  const anchoredFacts = rankedFacts.filter((fact) => fact.queryAnchored || fact.evidenceAnchored);
  const facts = selectDiverseGraphFacts(anchoredFacts, { queryMatchedEntityIds, factLimit });

  const selectedEntityIds = new Set(facts.flatMap((fact) => [fact.subject?.id, fact.object?.id]).filter(Boolean));
  const selectedEntities = [...selectedEntityIds]
    .map((id) => entities.get(id))
    .filter(Boolean);

  return {
    entities: selectedEntities,
    facts,
    sourceIds: uniqueStrings(facts.map((fact) => fact.sourceId)),
    context: formatGraphFacts(facts),
    traversal: {
      seedEntities: seedScores.map(({ entity }) => entity.id),
      visitedEntities: visited.size,
      selectedFacts: facts.length,
      maxDepth,
    },
  };
}

function selectDiverseGraphFacts(rankedFacts, { queryMatchedEntityIds, factLimit }) {
  const selected = [];
  const selectedIds = new Set();
  const add = (fact) => {
    if (!fact || selectedIds.has(fact.id) || selected.length >= factLimit) return;
    selected.push(fact);
    selectedIds.add(fact.id);
  };

  for (const fact of rankedFacts) {
    if (queryMatchedEntityIds.has(fact.subject?.id) && queryMatchedEntityIds.has(fact.object?.id)) add(fact);
    if (selected.length >= Math.min(8, factLimit)) break;
  }

  const groupCounts = new Map();
  for (const fact of selected) {
    const key = `${fact.subject?.id || ""}:${fact.predicate}`;
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }
  for (const fact of rankedFacts) {
    if (selected.length >= factLimit) break;
    if (selectedIds.has(fact.id)) continue;
    const key = `${fact.subject?.id || ""}:${fact.predicate}`;
    if ((groupCounts.get(key) || 0) >= 4) continue;
    add(fact);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }
  return selected;
}

export function formatGraphFacts(facts = []) {
  if (!facts.length) return "";
  return facts.map((fact, index) => {
    const source = fact.sourceId ? `；来源：${fact.sourceId}` : "";
    return `[KG-${index + 1}] ${fact.subject?.name || fact.subject?.id} --${fact.predicate}--> ${fact.object?.name || fact.object?.id}${source}`;
  }).join("\n");
}

function resolveOrCreateSchool({
  name,
  entities,
  aliasIndex,
  schoolEntityIds,
  schoolSearchIndex,
  addEntity,
  sourceId,
}) {
  const normalized = normalizeLookup(name);
  if (!normalized) return null;
  const exactId = aliasIndex.get(normalized);
  if (exactId) return entities.get(exactId);
  const aliases = buildSchoolAliases(name);
  const aliasMatches = uniqueStrings(aliases
    .filter((alias) => /^[A-Z0-9]{3,6}$/u.test(alias))
    .map(normalizeLookup)
    .map((alias) => aliasIndex.get(alias))
    .filter(Boolean));
  if (aliasMatches.length === 1) {
    const matched = entities.get(aliasMatches[0]);
    return addEntity({ ...matched, aliases: [...(matched.aliases || []), name, ...aliases] });
  }
  const partial = [...schoolEntityIds]
    .find((id) => (schoolSearchIndex.get(id) || []).some((candidate) => (
      candidate.length >= 4 && (candidate.includes(normalized) || normalized.includes(candidate))
    )));
  if (partial) {
    const entity = entities.get(partial);
    const updated = addEntity({ ...entity, aliases: [...(entity.aliases || []), name] });
    aliasIndex.set(normalized, updated.id);
    return updated;
  }
  return addEntity({
    id: `school:${slugify(name)}`,
    type: "school",
    name,
    aliases: buildSchoolAliases(name),
    metadata: { sourceId },
  });
}

function linkSchoolMajorMentions({ entities, relations, addRelation }) {
  const majors = [...entities.values()].filter((entity) => entity.type === "major");
  const schools = [...entities.values()].filter((entity) => entity.type === "school");
  for (const school of schools) {
    const searchable = normalizeLookup([
      school.name,
      ...(school.aliases || []),
      school.metadata?.popularMajors,
      school.metadata?.admissionPreferences,
    ].filter(Boolean).join(" "));
    if (!searchable) continue;
    for (const major of majors) {
      const matched = [major.name, ...(major.aliases || [])]
        .map(normalizeLookup)
        .filter((alias) => alias.length >= 4)
        .some((alias) => searchable.includes(alias));
      if (!matched) continue;
      addRelation({
        from: school.id,
        to: major.id,
        type: "MENTIONS_MAJOR",
        sourceId: school.metadata?.sourceId,
        confidence: 70,
      });
    }
  }
}

function normalizeEntity(value = {}) {
  return {
    id: String(value.id || "").trim(),
    type: String(value.type || "entity").trim(),
    name: String(value.name || "").trim(),
    aliases: uniqueStrings(value.aliases || []),
    metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
  };
}

function normalizeRelation(value = {}) {
  const from = String(value.from || "").trim();
  const to = String(value.to || "").trim();
  const type = String(value.type || "").trim();
  return {
    id: String(value.id || `${from}:${type}:${to}`).trim(),
    from,
    to,
    type,
    sourceId: String(value.sourceId || "").trim(),
    confidence: clampConfidence(value.confidence),
    metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
  };
}

function buildAdjacency(relations) {
  const adjacency = new Map();
  for (const relation of relations) {
    for (const entityId of [relation.from, relation.to]) {
      const entries = adjacency.get(entityId) || [];
      entries.push(relation);
      adjacency.set(entityId, entries);
    }
  }
  return adjacency;
}

function scoreEntity(entity, terms, queryPlan, { includeConstraintBoost = true } = {}) {
  const searchableValues = uniqueStrings([entity.name, ...(entity.aliases || [])])
    .map(normalizeLookup)
    .filter(Boolean);
  if (!searchableValues.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    if (searchableValues.some((candidate) => candidate === term)) score += 10;
    else if ((term.length >= 3 || /[^\x00-\x7F]/u.test(term))
      && searchableValues.some((candidate) => candidate.includes(term) || term.includes(candidate))) {
      score += Math.min(6, 1 + term.length / 2);
    }
  }
  const matchesRoundConstraint = includeConstraintBoost
    && (queryPlan.constraints?.rounds || []).includes(entity.name?.toUpperCase());
  if (score <= 0 && !matchesRoundConstraint) return 0;
  const primaryIntent = queryPlan.primaryIntent;
  if (primaryIntent === "school" && ["school", "application-round", "location"].includes(entity.type)) score += 1.5;
  if (primaryIntent === "major" && ["major", "major-category", "learning-topic", "career"].includes(entity.type)) score += 1.5;
  if (matchesRoundConstraint) score += 8;
  return score;
}

function buildSearchTerms(value) {
  const normalized = String(value || "").normalize("NFKC").toLocaleLowerCase();
  const wordTerms = normalized.match(/[\p{L}\p{N}+#.-]{2,}/gu) || [];
  const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) || [];
  const cjkTerms = cjkRuns.flatMap((run) => {
    if (run.length <= 4) return [run];
    const output = [run];
    for (let index = 0; index <= run.length - 2 && output.length < 24; index += 1) output.push(run.slice(index, index + 2));
    return output;
  });
  return uniqueStrings([...wordTerms, ...cjkTerms]).slice(0, 48);
}

function buildSchoolAliases(name) {
  const value = String(name || "").trim();
  const latin = "\\p{Script=Latin}";
  const english = value.match(new RegExp(`[${latin}][${latin}\\p{N}&.' -]+`, "gu"))
    ?.map((entry) => entry.trim()) || [];
  const chinese = value.replace(new RegExp(`[${latin}\\p{N}&.' -]+`, "gu"), " ").replace(/\s+/gu, " ").trim();
  const initials = english.flatMap((entry) => {
    const words = entry.split(/\s+/gu).filter((word) => !["of", "the", "and", "at"].includes(word.toLocaleLowerCase()));
    return words.length >= 2 ? [words.map((word) => word[0]).join("").toUpperCase()] : [];
  });
  return uniqueStrings([...english, ...initials, chinese]);
}

function splitKnowledgeList(value, limit) {
  return uniqueStrings(String(value || "")
    .split(/[、，,；;|\n]+/gu)
    .map((entry) => entry.replace(/[。.]$/u, "").trim())
    .filter((entry) => entry.length >= 2))
    .slice(0, limit);
}

function schoolSourceId(school) {
  if (school.category === "international") return "data/international-schools.md";
  if (school.category === "other-region") return "data/other-region-schools.md";
  return "data/schools.md";
}

function isSupportedRound(round, value) {
  const normalized = String(value || "").trim().toLocaleLowerCase();
  if (!normalized || ["否", "特殊", "no", "false"].includes(normalized)) return false;
  if (round === "rd" && normalized === "类rd") return false;
  return true;
}

function emptyGraphSearchResult() {
  return {
    entities: [],
    facts: [],
    sourceIds: [],
    context: "",
    traversal: { seedEntities: [], visitedEntities: 0, selectedFacts: 0, maxDepth: DEFAULT_MAX_DEPTH },
  };
}

function normalizeLookup(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, "")
    .trim();
}

function slugify(value) {
  const normalized = String(value || "").normalize("NFKC").toLocaleLowerCase();
  const ascii = normalized.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (ascii) return ascii;
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `entity-${(hash >>> 0).toString(36)}`;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 80;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}
