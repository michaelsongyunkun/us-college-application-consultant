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
const MAX_EVIDENCE_CHARS = 8_000;

export function createStaticAdmissionsKnowledgeGraphAdapter({
  root,
  planning = null,
  activityPortfolio = null,
  readMarkdownFile = readFile,
} = {}) {
  const loadGraph = createStaticAdmissionsKnowledgeGraphLoader({ root, readMarkdownFile });

  return {
    async search({ user, query, queryPlan, profile = null, portfolio = null } = {}) {
      const [graph, resolvedProfile, resolvedPortfolio] = await Promise.all([
        loadGraph(),
        profile || planning?.getProfile?.(user) || {},
        portfolio || activityPortfolio?.getPortfolio?.(user) || {},
      ]);
      const evidenceText = buildStudentEvidenceText(resolvedProfile, resolvedPortfolio);
      const result = searchAdmissionsKnowledgeGraph(graph, {
        query,
        queryPlan,
        evidenceText,
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
  const normalizedProfile = profile?.profile && typeof profile.profile === "object" ? profile.profile : profile;
  const sections = [
    compactJson(normalizedProfile),
    compactJson({
      applicationPlan: portfolio?.applicationPlan,
      activities: compactList(portfolio?.activities, 12),
      competitions: compactList(portfolio?.competitions, 10),
      summerSchools: compactList(portfolio?.summerSchools, 8),
      recommendationLetters: portfolio?.recommendationLetters,
      academicRecords: portfolio?.academicRecords,
    }),
  ].filter(Boolean);
  return sections.join("\n").slice(0, MAX_EVIDENCE_CHARS);
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

function compactList(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function compactJson(value) {
  if (!value || typeof value !== "object" || !Object.keys(value).length) return "";
  return JSON.stringify(value);
}
