import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAdmissionsKnowledgeGraph,
  searchAdmissionsKnowledgeGraph,
} from "../domain/admissions-knowledge-graph.mjs";
import { parseApplicationRoundSchoolsMarkdown } from "../domain/application-round-schools.mjs";
import { parseMajorsMarkdown } from "../domain/major-encyclopedia.mjs";
import { parseSchoolsMarkdown } from "../domain/school-encyclopedia.mjs";

const SCHOOL_FILES = ["schools.md", "international-schools.md", "other-region-schools.md"];

export function createStaticAdmissionsKnowledgeGraphAdapter({
  root,
  planning = null,
  activityPortfolio = null,
  readMarkdownFile = readFile,
} = {}) {
  const loadGraph = createStaticAdmissionsKnowledgeGraphLoader({ root, readMarkdownFile });

  return {
    async search({
      user,
      query,
      queryPlan,
      profile = null,
      portfolio = null,
      usePersonalContext = true,
    } = {}) {
      const includePersonalContext = usePersonalContext !== false;
      const [graph, resolvedProfile, resolvedPortfolio] = await Promise.all([
        loadGraph(),
        includePersonalContext ? profile || planning?.getProfile?.(user) || {} : {},
        includePersonalContext ? portfolio || activityPortfolio?.getPortfolio?.(user) || {} : {},
      ]);
      const evidenceTexts = buildStudentEvidenceChunks(resolvedProfile, resolvedPortfolio);
      const result = searchAdmissionsKnowledgeGraph(graph, {
        query,
        queryPlan,
        evidenceTexts,
      });
      return {
        ...result,
        sources: serializeGraphSources(result.facts),
        adapter: "static-admissions-graph",
      };
    },
  };
}

export function createStaticAdmissionsKnowledgeGraphLoader({ root, readMarkdownFile = readFile } = {}) {
  let graphPromise = null;
  return async function loadStaticAdmissionsKnowledgeGraph() {
    if (!graphPromise) {
      graphPromise = Promise.all([
        readMarkdownFile(join(root, "data", "majors.md"), "utf8"),
        ...SCHOOL_FILES.map((file) => readMarkdownFile(join(root, "data", file), "utf8")),
        readMarkdownFile(join(root, "data", "application-round-schools.md"), "utf8"),
      ]).then(([majorsMarkdown, ...remaining]) => {
        const applicationRoundsMarkdown = remaining.at(-1);
        const schoolMarkdownGroups = remaining.slice(0, -1);
        return buildAdmissionsKnowledgeGraph({
          majors: parseMajorsMarkdown(majorsMarkdown),
          schools: schoolMarkdownGroups.flatMap((markdown) => parseSchoolsMarkdown(markdown)),
          applicationRoundSchools: parseApplicationRoundSchoolsMarkdown(applicationRoundsMarkdown),
        });
      });
    }
    try {
      return await graphPromise;
    } catch (error) {
      graphPromise = null;
      throw error;
    }
  };
}

export function buildStudentEvidenceText(profile = {}, portfolio = {}) {
  return buildStudentEvidenceChunks(profile, portfolio).join("\n");
}

export function buildStudentEvidenceChunks(profile = {}, portfolio = {}) {
  const normalizedProfile = profile?.profile && typeof profile.profile === "object" ? profile.profile : profile;
  const chunks = [];
  addEvidenceChunk(chunks, "student-profile", normalizedProfile);
  for (const [round, entries] of Object.entries(portfolio?.applicationPlan || {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      addEvidenceChunk(chunks, `application-plan:${round}`, entry);
    }
  }
  for (const activity of Array.isArray(portfolio?.activities) ? portfolio.activities : []) {
    addEvidenceChunk(chunks, "activity", activity);
  }
  for (const competition of Array.isArray(portfolio?.competitions) ? portfolio.competitions : []) {
    addEvidenceChunk(chunks, "competition", competition);
  }
  for (const program of Array.isArray(portfolio?.summerSchools) ? portfolio.summerSchools : []) {
    addEvidenceChunk(chunks, "summer-school", program);
  }
  for (const action of Array.isArray(portfolio?.planningActions) ? portfolio.planningActions : []) {
    addEvidenceChunk(chunks, "planning-action", action);
  }
  for (const note of Array.isArray(portfolio?.deepSeekNotes) ? portfolio.deepSeekNotes : []) {
    addEvidenceChunk(chunks, "saved-note", note);
  }
  addEvidenceChunk(chunks, "recommendation-letters", portfolio?.recommendationLetters);
  addEvidenceChunk(chunks, "academic-records", portfolio?.academicRecords);
  return chunks;
}

function serializeGraphSources(facts) {
  return facts.slice(0, 8).map((fact) => ({
    id: `kg:${fact.id}`,
    type: "knowledge-graph",
    typeLabel: "知识图谱",
    title: `${fact.subject?.name || fact.subject?.id} → ${fact.object?.name || fact.object?.id}`,
    snippet: `${fact.subject?.name || fact.subject?.id} --${fact.predicate}--> ${fact.object?.name || fact.object?.id}`,
    sourceId: fact.sourceId,
    confidence: fact.confidence,
  }));
}

function addEvidenceChunk(chunks, section, value) {
  const content = compactJson(value);
  if (content) chunks.push(`section:${section}\n${content}`);
}

function compactJson(value) {
  if (!value || typeof value !== "object" || !Object.keys(value).length) return "";
  return JSON.stringify(value);
}
