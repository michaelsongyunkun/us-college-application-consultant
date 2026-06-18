import { resolveApiKey } from "./api-key.mjs";
import { AI_QUALITY_VERSIONS, buildAiRequestQuality } from "./ai-quality.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";

const DEEPSEEK_CAPABILITY_MAX_TOKENS = 4200;
const MAX_AGENT_ATTEMPTS = 2;
const TEXT_LIMIT = 700;
const LIST_LIMIT = 8;

const CAPABILITY_DIMENSIONS = [
  {
    key: "academicReadiness",
    label: "学术准备度",
    nextAction: "补齐课程体系、最近 GPA/IB、SAT 和 AP 记录，形成统一成绩口径。",
  },
  {
    key: "directionConsistency",
    label: "专业方向一致性",
    nextAction: "把最能代表目标方向的 2-3 项经历补充为同一条申请主线。",
  },
  {
    key: "activityDepth",
    label: "活动深度",
    nextAction: "优先补齐核心活动的角色、持续时间、具体任务和可量化结果。",
  },
  {
    key: "outcomeImpact",
    label: "成果与影响力",
    nextAction: "给前 3 项经历补充数字结果、作品/报告链接或获奖证明。",
  },
  {
    key: "leadershipInitiative",
    label: "主动性与领导力",
    nextAction: "把核心经历改写为“我发起/组织/推动了什么”，并补个人贡献证据。",
  },
  {
    key: "competitiveExperience",
    label: "竞争性经历",
    nextAction: "补充竞赛结果、排名、录取项目难度或项目筛选门槛。",
  },
  {
    key: "materialsReadiness",
    label: "材料准备度",
    nextAction: "整理推荐信素材包，并给核心活动、竞赛、项目补证明链接。",
  },
];

export class PortfolioCapabilityAgentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PortfolioCapabilityAgentError";
    this.statusCode = statusCode;
  }
}

export function createPortfolioCapabilityAgentService({
  activityPortfolio,
  now = () => new Date(),
} = {}) {
  if (!activityPortfolio) {
    throw new PortfolioCapabilityAgentError("Activity portfolio service is required.", 500);
  }

  async function generateAssessment({
    user,
    payload = {},
    env = process.env,
    deepSeekFetch = fetch,
  } = {}) {
    const apiKey = resolveApiKey({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new PortfolioCapabilityAgentError(
        "DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。",
        400,
      );
    }

    const currentPortfolio = activityPortfolio.getPortfolio(user);
    const candidatePortfolio = isPlainObject(payload) && Object.keys(payload).length
      ? { ...currentPortfolio, ...payload }
      : currentPortfolio;
    const assessmentInput = buildAssessmentInput(candidatePortfolio);
    const baseline = buildRuleBaseline(assessmentInput);
    const model = normalizeDeepSeekModel(
      env.DEEPSEEK_CAPABILITY_ASSESSMENT_MODEL || env.DEEPSEEK_MODEL,
      "deepseek-v4-flash",
    );
    const maxTokens = normalizePositiveInteger(
      env.DEEPSEEK_CAPABILITY_ASSESSMENT_MAX_TOKENS,
      DEEPSEEK_CAPABILITY_MAX_TOKENS,
    );

    let repairMessage = "";
    for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt += 1) {
      const apiResponse = await deepSeekFetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt({ assessmentInput, baseline, repairMessage }) },
          ],
          thinking: { type: "disabled" },
          stream: false,
          temperature: attempt === 1 ? 0.25 : 0.1,
          max_tokens: maxTokens,
        }),
      });
      const data = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) {
        throw new PortfolioCapabilityAgentError(
          data.error?.message || "DeepSeek 能力评估调用失败。",
          apiResponse.status,
        );
      }

      try {
        const parsed = parseAgentJson(extractDeepSeekResponseText(data));
        const capabilityAssessment = normalizeAgentAssessment(parsed, baseline, now);
        const savedPortfolio = activityPortfolio.savePortfolio(user, {
          ...candidatePortfolio,
          capabilityAssessment,
        });
        return {
          capabilityAssessment: savedPortfolio.capabilityAssessment,
          portfolio: savedPortfolio,
          quality: buildAiRequestQuality({
            feature: "portfolio-capability-assessment",
            promptVersion: AI_QUALITY_VERSIONS.portfolioCapabilityPrompt,
            model,
            sourceSetVersion: AI_QUALITY_VERSIONS.noSourceSet,
            parserVersion: AI_QUALITY_VERSIONS.portfolioCapabilityParser,
          }),
        };
      } catch (error) {
        repairMessage = error.message || "DeepSeek 返回的能力评估 JSON 未通过校验。";
      }
    }

    throw new PortfolioCapabilityAgentError(
      `${repairMessage || "DeepSeek 能力评估结果未通过校验。"} 请稍后重试。`,
      502,
    );
  }

  return { generateAssessment };
}

function buildSystemPrompt() {
  return [
    "你是 US College Compass 的“档案能力评估智能体”。",
    "你的任务是生成一张能力雷达图；score 表示该维度“可验证申请证据的充分度”，不是录取竞争力、学校匹配度或学生潜力上限。",
    "你只评估学生自身申请资产：成绩与考试、课外活动、竞赛、夏校/项目、推荐信准备、证明材料。",
    "评分必须按同一把尺校准：0-20 基本无可用证据；21-40 只有零散记录或缺关键字段；41-60 有基础经历但缺角色、成果或证明；61-75 证据较完整且主线初步稳定；76-90 有多项具体、高质量、可验证证据；91-100 必须同时具备持续投入、量化成果、外部认可和强证明材料。",
    "证据权重从高到低：量化成果、奖项/筛选性项目结果、作品或报告产出、证明链接 > 个人角色与贡献、持续时间、任务细节 > 名称、意向、泛泛描述。",
    "信息缺失时必须降低 score 和 confidence，并在 missing 里写清缺口；不得用常识、目标专业、选校计划或理想化假设补全。",
    "radarScores 必须覆盖固定 7 个维度；每个维度独立评分，不要为了雷达图好看而拉平、抬高或平均化分数。",
    "overallSummary 只总结当前最强证据、最弱短板和优先补强方向，避免泛泛鼓励。",
    "严禁输出院校推荐、选校名单、录取概率、冲刺/匹配/保底判断。",
    "严禁从选校计划反推学生方向。系统不会提供选校计划；如果用户档案信息不足，必须说明缺口。",
    "只能输出一个 JSON 对象，不要使用 Markdown，不要解释 JSON 之外的内容。",
  ].join("\n");
}

function buildUserPrompt({ assessmentInput, baseline, repairMessage = "" }) {
  return [
    "请基于以下非选校申请档案，生成能力雷达评估。",
    "重要边界：输入不包含 applicationPlan 和 schoolSelectionVersions；你也不得臆测这些信息。",
    repairMessage ? `上一次输出未通过校验：${repairMessage}。请修正 JSON。` : "",
    "",
    "非选校档案 JSON：",
    JSON.stringify(assessmentInput, null, 2),
    "",
    "规则基线 JSON（可参考，但请给出你的顾问式判断）：",
    JSON.stringify(baseline, null, 2),
    "",
    "输出 JSON schema：",
    JSON.stringify({
      overallSummary: "一句话说明当前能力结构，不提具体学校和录取概率。",
      radarScores: CAPABILITY_DIMENSIONS.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        score: 0,
        confidence: "high | medium | low",
        evidence: ["来自档案的具体证据"],
        missing: ["影响判断的缺失字段"],
        nextAction: "最优先补强动作",
      })),
      strengths: ["最多 3 条最强证据"],
      gaps: ["最多 3 条优先短板"],
      actions30Days: ["最多 3 条 30 天动作"],
    }, null, 2),
  ].filter(Boolean).join("\n");
}

function buildAssessmentInput(portfolio = {}) {
  return {
    academicRecords: sanitizeLooseJson(portfolio.academicRecords || {}),
    activities: sanitizeRecords(portfolio.activities, [
      "activityName",
      "type",
      "timeStage",
      "role",
      "description",
      "outcome",
      "proofLink",
      "status",
    ], 10),
    competitions: sanitizeRecords(portfolio.competitions, [
      "competitionName",
      "subject",
      "yearGrade",
      "award",
      "contribution",
      "proofLink",
      "status",
    ], 5),
    summerSchools: sanitizeRecords(portfolio.summerSchools, [
      "programName",
      "organizer",
      "direction",
      "participationTime",
      "status",
      "output",
      "proofLink",
    ], 3),
    recommendationLetters: sanitizeLooseJson(portfolio.recommendationLetters || {}),
  };
}

function buildRuleBaseline(input) {
  const radarScores = [
    scoreAcademicReadiness(input),
    scoreDirectionConsistency(input),
    scoreActivityDepth(input),
    scoreOutcomeImpact(input),
    scoreLeadershipInitiative(input),
    scoreCompetitiveExperience(input),
    scoreMaterialsReadiness(input),
  ];
  return {
    inputCompleteness: calculateInputCompleteness(input),
    overallScore: averageScore(radarScores),
    radarScores,
  };
}

function scoreAcademicReadiness(input) {
  const records = input.academicRecords || {};
  const evidence = [];
  const missing = [];
  let score = 0;
  if (records.courseSystem) {
    score += 15;
    evidence.push(`课程体系：${records.courseSystem}`);
  } else {
    missing.push("课程体系");
  }
  if (records.ibPredictedScore) {
    const ibScore = Number(records.ibPredictedScore);
    score += ibScore >= 40 ? 35 : 26;
    evidence.push(`IB 预估分 ${records.ibPredictedScore}/45`);
  }
  if (Array.isArray(records.gpaRecords) && records.gpaRecords.length) {
    score += Math.min(30, 12 + records.gpaRecords.length * 4);
    evidence.push(`已记录 ${records.gpaRecords.length} 个 GPA 学期`);
  } else if (!records.ibPredictedScore) {
    missing.push("GPA 或 IB 成绩");
  }
  const satTests = Array.isArray(records.satTests) ? records.satTests : [];
  const bestSat = Math.max(0, ...satTests.map((test) => Number(test.totalScore) || 0));
  if (bestSat) {
    score += bestSat >= 1500 ? 25 : bestSat >= 1400 ? 20 : 14;
    evidence.push(`SAT 最高 ${bestSat}`);
  } else {
    missing.push("SAT 记录");
  }
  const apExams = Array.isArray(records.apExams) ? records.apExams : [];
  const highAp = apExams.filter((exam) => Number(exam.score) >= 4).length;
  if (apExams.length) {
    score += Math.min(20, apExams.length * 4 + highAp * 3);
    evidence.push(`AP ${apExams.length} 门，其中 ${highAp} 门 4 分以上`);
  } else {
    missing.push("AP 记录");
  }
  return capabilityDimension("academicReadiness", score, evidence, missing);
}

function scoreDirectionConsistency(input) {
  const tags = [
    ...input.activities.map((activity) => activity.type),
    ...input.competitions.map((competition) => competition.subject),
    ...input.summerSchools.map((program) => program.direction),
  ].filter(Boolean);
  const counts = tags.reduce((map, tag) => map.set(tag, (map.get(tag) || 0) + 1), new Map());
  const strongest = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  const evidence = strongest ? [`${strongest[0]} 方向出现 ${strongest[1]} 次`] : [];
  const missing = [];
  if (tags.length < 3) missing.push("活动、竞赛或夏校方向标签不足");
  if (!strongest || strongest[1] < 2) missing.push("缺少反复出现的主线方向");
  const score = tags.length >= 5 && strongest?.[1] >= 3
    ? 86
    : tags.length >= 3 && strongest?.[1] >= 2
      ? 72
      : tags.length
        ? 48
        : 22;
  return capabilityDimension("directionConsistency", score, evidence, missing);
}

function scoreActivityDepth(input) {
  const activities = input.activities || [];
  const roles = activities.filter((activity) => activity.role).length;
  const descriptions = activities.filter((activity) => activity.description).length;
  const outcomes = activities.filter((activity) => activity.outcome).length;
  const evidence = [];
  const missing = [];
  if (activities.length) evidence.push(`已记录 ${activities.length} 项活动`);
  if (roles) evidence.push(`${roles} 项写明角色`);
  if (outcomes) evidence.push(`${outcomes} 项写明成果`);
  if (activities.length < 3) missing.push("至少 3 项可讲述的核心活动");
  if (roles < Math.min(activities.length, 3)) missing.push("角色职责");
  if (outcomes < Math.min(activities.length, 3)) missing.push("可量化成果");
  return capabilityDimension(
    "activityDepth",
    18 + Math.min(28, activities.length * 5) + roles * 5 + descriptions * 4 + outcomes * 6,
    evidence,
    missing,
  );
}

function scoreOutcomeImpact(input) {
  const activityOutcomes = input.activities.filter((activity) => activity.outcome).length;
  const proofLinks = countProofLinks(input);
  const awards = input.competitions.filter((competition) => competition.award).length;
  const outputs = input.summerSchools.filter((program) => program.output).length;
  const evidence = [];
  const missing = [];
  if (activityOutcomes) evidence.push(`${activityOutcomes} 项活动有成果描述`);
  if (awards) evidence.push(`${awards} 项竞赛有奖项结果`);
  if (outputs) evidence.push(`${outputs} 项夏校/项目有产出`);
  if (proofLinks) evidence.push(`${proofLinks} 条证明材料链接`);
  if (!activityOutcomes) missing.push("活动成果");
  if (!awards && !outputs) missing.push("外部认可或项目产出");
  if (proofLinks < 2) missing.push("证明材料链接");
  return capabilityDimension(
    "outcomeImpact",
    24 + activityOutcomes * 10 + awards * 13 + outputs * 10 + Math.min(18, proofLinks * 5),
    evidence,
    missing,
  );
}

function scoreLeadershipInitiative(input) {
  const roles = input.activities.map((activity) => activity.role).filter(Boolean);
  const leadershipRoles = roles.filter((role) =>
    includesAny(role, ["负责人", "创始", "组织", "主席", "队长", "leader", "captain", "founder", "president"]),
  );
  const contribution = input.competitions.filter((competition) => competition.contribution).length;
  const evidence = [];
  const missing = [];
  if (roles.length) evidence.push(`${roles.length} 项活动写明角色`);
  if (leadershipRoles.length) evidence.push(`${leadershipRoles.length} 项有领导/发起信号`);
  if (contribution) evidence.push(`${contribution} 项竞赛写明个人贡献`);
  if (!roles.length) missing.push("活动角色");
  if (!leadershipRoles.length) missing.push("发起、组织或带动他人的证据");
  return capabilityDimension(
    "leadershipInitiative",
    26 + roles.length * 7 + leadershipRoles.length * 14 + contribution * 6,
    evidence,
    missing,
  );
}

function scoreCompetitiveExperience(input) {
  const competitions = input.competitions || [];
  const awarded = competitions.filter((competition) => competition.award).length;
  const completedPrograms = input.summerSchools.filter((program) =>
    includesAny([program.status, program.output].join(" "), ["已完成", "已录取", "完成", "录取"]),
  ).length;
  const apCount = Array.isArray(input.academicRecords?.apExams) ? input.academicRecords.apExams.length : 0;
  const evidence = [];
  const missing = [];
  if (competitions.length) evidence.push(`${competitions.length} 项竞赛经历`);
  if (awarded) evidence.push(`${awarded} 项有奖项结果`);
  if (completedPrograms) evidence.push(`${completedPrograms} 项高门槛项目/夏校有进展`);
  if (!competitions.length) missing.push("竞赛或奖项记录");
  if (!awarded && !completedPrograms) missing.push("竞争性结果");
  return capabilityDimension(
    "competitiveExperience",
    22 + competitions.length * 12 + awarded * 15 + completedPrograms * 12 + Math.min(12, apCount * 3),
    evidence,
    missing,
  );
}

function scoreMaterialsReadiness(input) {
  const recommendationLetters = input.recommendationLetters || {};
  const preparedMaterials = Array.isArray(recommendationLetters.preparedMaterials)
    ? recommendationLetters.preparedMaterials
    : [];
  const teacherCount = [recommendationLetters.teacher1, recommendationLetters.teacher2]
    .filter((teacher) => teacher && Object.values(teacher).some(Boolean)).length;
  const proofLinks = countProofLinks(input);
  const evidence = [];
  const missing = [];
  if (teacherCount) evidence.push(`${teacherCount} 位校内推荐人已有记录`);
  if (preparedMaterials.length) evidence.push(`已准备 ${preparedMaterials.length} 类推荐信素材`);
  if (proofLinks) evidence.push(`${proofLinks} 条证明材料链接`);
  if (!teacherCount) missing.push("校内推荐人");
  if (preparedMaterials.length < 3) missing.push("简历、活动清单、项目说明等素材包");
  if (proofLinks < 3) missing.push("核心经历证明链接");
  return capabilityDimension(
    "materialsReadiness",
    20 + teacherCount * 16 + preparedMaterials.length * 8 + Math.min(22, proofLinks * 4),
    evidence,
    missing,
  );
}

function capabilityDimension(key, score, evidence, missing) {
  const dimension = CAPABILITY_DIMENSIONS.find((item) => item.key === key);
  const safeEvidence = evidence.filter(Boolean).slice(0, 5);
  const safeMissing = missing.filter(Boolean).slice(0, 5);
  return {
    key,
    label: dimension.label,
    score: clampScore(score),
    confidence: safeEvidence.length >= 3 && safeMissing.length <= 1 ? "high" : safeEvidence.length >= 2 ? "medium" : "low",
    evidence: safeEvidence,
    missing: safeMissing,
    nextAction: dimension.nextAction,
  };
}

function normalizeAgentAssessment(parsed, baseline, now) {
  if (!isPlainObject(parsed)) {
    throw new PortfolioCapabilityAgentError("DeepSeek 返回的能力评估 JSON 必须是对象。", 502);
  }
  if (!Array.isArray(parsed.radarScores)) {
    throw new PortfolioCapabilityAgentError("DeepSeek 返回缺少 radarScores 数组。", 502);
  }
  const parsedByKey = new Map(
    parsed.radarScores
      .filter(isPlainObject)
      .map((entry) => [cleanString(entry.key), entry]),
  );
  const validCount = CAPABILITY_DIMENSIONS.filter((dimension) => parsedByKey.has(dimension.key)).length;
  if (validCount < 6) {
    throw new PortfolioCapabilityAgentError("DeepSeek 返回的能力维度少于 6 个。", 502);
  }
  const baselineByKey = new Map(baseline.radarScores.map((entry) => [entry.key, entry]));
  const radarScores = CAPABILITY_DIMENSIONS.map((dimension) => {
    const entry = parsedByKey.get(dimension.key) || {};
    const baselineEntry = baselineByKey.get(dimension.key) || capabilityDimension(dimension.key, 0, [], []);
    const score = normalizeScore(entry.score, baselineEntry.score);
    return {
      key: dimension.key,
      label: dimension.label,
      score,
      confidence: normalizeConfidence(entry.confidence || baselineEntry.confidence),
      evidence: normalizeTextList(entry.evidence, baselineEntry.evidence),
      missing: normalizeTextList(entry.missing, baselineEntry.missing),
      nextAction: cleanString(entry.nextAction).slice(0, TEXT_LIMIT) || baselineEntry.nextAction,
    };
  });
  const assessment = {
    version: "deepseek-v1",
    generatedAt: now().toISOString(),
    inputHash: `deepseek-v1:${JSON.stringify(baseline).length}`,
    inputCompleteness: baseline.inputCompleteness,
    overallScore: averageScore(radarScores),
    overallSummary: cleanString(parsed.overallSummary).slice(0, TEXT_LIMIT)
      || buildOverallSummary(radarScores),
    radarScores,
    strengths: normalizeTextList(parsed.strengths, buildStrengths(radarScores), 3),
    gaps: normalizeTextList(parsed.gaps, buildGaps(radarScores), 3),
    actions30Days: normalizeTextList(parsed.actions30Days, buildActions(radarScores), 3),
    generatedBy: "deepseek-capability-agent",
  };
  assertAssessmentBoundary(assessment);
  return assessment;
}

function assertAssessmentBoundary(assessment) {
  const text = JSON.stringify(assessment);
  if (/录取概率|录取率|冲刺\/匹配\/保底|冲刺、匹配、保底/u.test(text)) {
    throw new PortfolioCapabilityAgentError("DeepSeek 输出包含被禁止的选校或录取预测内容。", 502);
  }
}

function parseAgentJson(text) {
  const raw = cleanString(text);
  if (!raw) throw new PortfolioCapabilityAgentError("DeepSeek 未返回能力评估内容。", 502);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1];
  const candidate = fenced || raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new PortfolioCapabilityAgentError("DeepSeek 返回的能力评估 JSON 无法解析。", 502);
  }
}

function extractDeepSeekResponseText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function sanitizeRecords(value, fields, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map((item) => {
      if (!isPlainObject(item)) return {};
      return Object.fromEntries(fields.map((field) => [field, cleanString(item[field]).slice(0, TEXT_LIMIT)]));
    })
    .filter((item) => Object.values(item).some(Boolean));
}

function sanitizeLooseJson(value, depth = 0) {
  if (depth > 4) return "";
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeLooseJson(item, depth + 1)).filter(Boolean);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, entry]) => [cleanString(key).slice(0, 80), sanitizeLooseJson(entry, depth + 1)])
        .filter(([key, entry]) => key && !isEmptyLooseValue(entry)),
    );
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return cleanString(value).slice(0, TEXT_LIMIT);
}

function isEmptyLooseValue(value) {
  if (value === "" || value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function calculateInputCompleteness(input) {
  const records = input.academicRecords || {};
  const proofLinks = countProofLinks(input);
  const signals = [
    records.courseSystem,
    records.ibPredictedScore || records.gpaRecords?.length,
    records.satTests?.length || records.apExams?.length,
    input.activities.length >= 3,
    input.activities.some((activity) => activity.outcome),
    input.competitions.length > 0,
    input.summerSchools.length > 0,
    input.recommendationLetters && Object.keys(input.recommendationLetters).length > 0,
    proofLinks >= 2,
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}

function normalizeTextList(value, fallback = [], limit = LIST_LIMIT) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((item) => cleanString(item).slice(0, TEXT_LIMIT)).filter(Boolean).slice(0, limit);
}

function normalizeScore(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clampScore(number) : clampScore(fallback);
}

function normalizeConfidence(value) {
  const confidence = cleanString(value).toLowerCase();
  return ["high", "medium", "low"].includes(confidence) ? confidence : "medium";
}

function buildOverallSummary(scores) {
  const sorted = [...scores].sort((left, right) => right.score - left.score);
  return `当前最强维度是${sorted[0].label}，优先补强${sorted.at(-1).label}。`;
}

function buildStrengths(scores) {
  return [...scores]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => `${item.label}：${item.evidence[0] || "已有可用证据"}`);
}

function buildGaps(scores) {
  return [...scores]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((item) => `${item.label}：${item.missing[0] || item.nextAction}`);
}

function buildActions(scores) {
  return [...scores].sort((left, right) => left.score - right.score).slice(0, 3).map((item) => item.nextAction);
}

function averageScore(scores = []) {
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, item) => sum + clampScore(item.score), 0) / scores.length);
}

function countProofLinks(input) {
  return [
    ...(input.activities || []),
    ...(input.competitions || []),
    ...(input.summerSchools || []),
  ].filter((item) => item.proofLink).length;
}

function includesAny(value, keywords) {
  const text = cleanString(value).toLowerCase();
  return keywords.some((keyword) => text.includes(cleanString(keyword).toLowerCase()));
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
