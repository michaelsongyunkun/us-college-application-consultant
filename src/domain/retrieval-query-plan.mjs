export const RETRIEVAL_MODES = Object.freeze({
  DIRECT: "direct",
  HYBRID_RAG: "hybrid-rag",
  GRAPH_RAG: "graph-rag",
  GRAPH_RAG_WITH_CONSTRAINTS: "graph-rag-with-constraints",
});

const INTENT_SIGNALS = Object.freeze({
  school: [
    "学校", "院校", "选校", "录取", "冲刺", "保底", "匹配校", "ed", "ea", "rea", "rd", "uc",
    "college", "university", "school", "admission", "ed1", "ed2", "scea", "early decision", "early action",
  ],
  major: [
    "专业", "方向", "职业", "就业", "岗位", "major", "career", "computer science", "data science",
  ],
  resource: [
    "竞赛", "夏校", "科研", "实习", "活动", "项目", "期刊", "资源", "competition", "summer school",
    "research", "internship", "activity", "journal", "resource",
  ],
  academic: [
    "课程", "选课", "gpa", "sat", "act", "ap", "ib", "a-level", "标化", "成绩", "学术",
    "course", "academic", "testing",
  ],
  recommendation: [
    "推荐信", "推荐人", "老师", "recommender", "recommendation letter",
  ],
  profile: [
    "档案", "背景", "经历", "优势", "短板", "差距", "profile", "background", "portfolio", "gap",
  ],
});

const MULTI_HOP_SIGNALS = [
  "结合", "比较", "匹配", "适合", "一致", "差距", "补强", "规划", "策略", "如何安排",
  "优先级", "为什么", "取舍", "权衡", "compare", "match", "fit", "gap", "plan", "strategy",
  "recommend", "tradeoff", "why", "prioritize",
];

const ROUND_PATTERN = /\b(ED1|ED2|ED|EA|REA|SCEA|RD|UC)\b/giu;
const BUDGET_PATTERN = /(预算|奖学金|助学金|费用|学费|financial aid|scholarship|budget|tuition)/iu;
const REGION_PATTERN = /(地区|地理|城市|郊区|乡村|东海岸|西海岸|加州|纽约|东北部|region|location|urban|suburban|rural|california|new york|east coast|west coast)/iu;
const SIZE_PATTERN = /(规模|大型|中型|小型|school size|large school|small school)/iu;

export function createRetrievalQueryPlan({
  query = "",
  taskType = "application",
  assistantProfile = "",
} = {}) {
  const normalizedQuery = normalizeText(query);
  const normalizedTaskType = normalizeTaskType(taskType, assistantProfile);

  if (normalizedTaskType === "inspiration") {
    return {
      mode: RETRIEVAL_MODES.DIRECT,
      taskType: normalizedTaskType,
      primaryIntent: "conversation",
      intents: ["conversation"],
      entities: [],
      constraints: emptyConstraints(),
      steps: ["understand_query", "generate_response"],
      reason: "The inspiration assistant uses only the current conversation and does not retrieve application knowledge.",
    };
  }

  const intents = detectIntents(normalizedQuery, normalizedTaskType);
  const primaryIntent = selectPrimaryIntent(intents, normalizedTaskType);
  const entities = extractEntities(query, normalizedQuery);
  const constraints = extractConstraints(query);
  const hasMultiHopSignal = MULTI_HOP_SIGNALS.some((signal) => includesSignal(normalizedQuery, signal));
  const complex = hasMultiHopSignal || intents.length >= 2 || normalizedTaskType === "major-match" || normalizedTaskType === "school-selection";
  const needsConstraints = normalizedTaskType === "school-selection"
    || constraints.rounds.length > 0
    || constraints.budget
    || constraints.region
    || constraints.schoolSize;
  const mode = selectMode({ normalizedTaskType, primaryIntent, complex, needsConstraints });

  return {
    mode,
    taskType: normalizedTaskType,
    primaryIntent,
    intents,
    entities,
    constraints,
    steps: buildSteps(mode),
    reason: buildReason({ mode, normalizedTaskType, primaryIntent, complex, needsConstraints }),
  };
}

export function shouldUseKnowledgeGraph(plan = {}) {
  return plan.mode === RETRIEVAL_MODES.GRAPH_RAG
    || plan.mode === RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS;
}

function normalizeTaskType(taskType, assistantProfile) {
  if (assistantProfile === "inspiration") return "inspiration";
  if (assistantProfile === "major-match") return "major-match";
  if (taskType === "school-selection") return "school-selection";
  return "application";
}

function detectIntents(normalizedQuery, taskType) {
  if (taskType === "school-selection") return ["school"];
  if (taskType === "major-match") return ["major", "profile"];
  const matched = Object.entries(INTENT_SIGNALS)
    .filter(([, signals]) => signals.some((signal) => includesSignal(normalizedQuery, signal)))
    .map(([intent]) => intent);
  return matched.length ? matched : ["general"];
}

function selectPrimaryIntent(intents, taskType) {
  if (taskType === "school-selection") return "school";
  if (taskType === "major-match") return "major";
  return ["school", "major", "resource", "recommendation", "academic", "profile", "general"]
    .find((intent) => intents.includes(intent)) || "general";
}

function selectMode({ normalizedTaskType, primaryIntent, complex, needsConstraints }) {
  if (normalizedTaskType === "school-selection") return RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS;
  if (needsConstraints && primaryIntent === "school") return RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS;
  if (normalizedTaskType === "major-match") return RETRIEVAL_MODES.GRAPH_RAG;
  if (complex && ["school", "major", "resource", "academic", "recommendation"].includes(primaryIntent)) {
    return RETRIEVAL_MODES.GRAPH_RAG;
  }
  return RETRIEVAL_MODES.HYBRID_RAG;
}

function extractEntities(query, normalizedQuery) {
  const entities = [];
  for (const round of query.match(ROUND_PATTERN) || []) {
    entities.push({ type: "application-round", value: round.toUpperCase() });
  }
  for (const [type, signals] of Object.entries(INTENT_SIGNALS)) {
    for (const signal of signals) {
      if (signal.length < 3 || !includesSignal(normalizedQuery, signal)) continue;
      entities.push({ type, value: signal });
    }
  }
  return uniqueBy(entities, (entity) => `${entity.type}:${entity.value.toLocaleLowerCase()}`).slice(0, 16);
}

function extractConstraints(query) {
  const rounds = uniqueBy(
    (query.match(ROUND_PATTERN) || []).map((round) => normalizeRound(round)),
    (round) => round,
  );
  return {
    rounds,
    budget: BUDGET_PATTERN.test(query),
    region: REGION_PATTERN.test(query),
    schoolSize: SIZE_PATTERN.test(query),
  };
}

function normalizeRound(value) {
  const normalized = String(value).toUpperCase();
  if (normalized === "ED") return "ED1";
  if (normalized === "SCEA") return "REA";
  return normalized;
}

function emptyConstraints() {
  return { rounds: [], budget: false, region: false, schoolSize: false };
}

function buildSteps(mode) {
  const common = ["understand_query"];
  if (shouldUseKnowledgeGraph({ mode })) common.push("graph_traversal");
  if (mode !== RETRIEVAL_MODES.DIRECT) common.push("document_retrieval", "evidence_synthesis");
  if (mode === RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS) common.push("constraint_validation");
  common.push("generate_response");
  return common;
}

function buildReason({ mode, normalizedTaskType, primaryIntent, complex, needsConstraints }) {
  if (mode === RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS) {
    return `The ${normalizedTaskType} query combines ${primaryIntent} relationships with explicit decision constraints.`;
  }
  if (mode === RETRIEVAL_MODES.GRAPH_RAG) {
    return `The ${normalizedTaskType} query requires multi-hop ${primaryIntent} evidence${complex ? "" : " for this task"}.`;
  }
  return needsConstraints
    ? "The query contains constraints that can be answered from retrieved evidence without graph traversal."
    : "The query is a focused lookup or summary suited to hybrid document retrieval.";
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function includesSignal(value, signal) {
  if (!/^[a-z0-9 -]+$/u.test(signal)) return value.includes(signal);
  const escaped = signal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "u").test(value);
}

function uniqueBy(values, keyFor) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
