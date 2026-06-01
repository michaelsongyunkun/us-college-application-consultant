import { resolveApiKey } from "./api-key.mjs";

const ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "rd", "uc"];
const ROUND_LIMITS = Object.freeze({
  ed2: [1, 1],
  ea: [3, 5],
  rd: [8, 12],
  uc: [6, 6],
});

const SYSTEM_PROMPT = [
  "你是 US College Compass 的美本选校系统，服务对象是准备申请美国本科的学生和家长。",
  "你的任务是基于用户国籍、用户高中地区、用户的“我的申请档案”数据，以及用户补充偏好，生成一套分轮次美本选校方案。方案必须可执行、结构清晰、风险分层合理，并严格遵守申请轮次数量规则。",
  "",
  "核心判断维度：",
  "1. 学术匹配：GPA、课程体系、AP/IB/A-Level/校内难度、标化、语言成绩。",
  "2. 专业匹配：目标专业、课程背景、竞赛/科研/活动与专业方向的相关性。",
  "3. 活动匹配：活动深度、领导力、持续性、奖项含金量、文书可塑性。",
  "4. 地区与身份因素：用户国籍、高中所在地区、国际生/本土生身份、地区资源差异。",
  "5. 申请策略：早申风险、录取概率梯度、UC 体系独立覆盖、RD 兜底与冲刺平衡。",
  "6. 用户偏好：地理位置、专业方向、学校规模、城市/郊区、预算、家庭风险偏好等。",
  "",
  "硬性轮次规则：",
  "- REA / ED1 二选一，rea 和 ed1 两个数组合计必须且只能有 1 所学校。",
  "- ED2 必须 1 所。",
  "- EA 必须 3-5 所。",
  "- RD 必须 8-12 所。",
  "- UC 必须 6 所。",
  "- 不允许把同一所学校重复放入多个轮次，除非该校不同校区属于独立申请体系。",
  "- UC 必须只包含 University of California 系统校区。",
  "",
  "风险等级定义：",
  "- high：冲刺校，录取难度明显高于当前档案竞争力。",
  "- medium：匹配校，档案与学校录取画像较接近。",
  "- low：稳妥校，相对更有把握，但不能承诺录取。",
  "",
  "输出要求：",
  "- 只返回严格 JSON，不要 Markdown，不要代码块，不要解释性前后缀。",
  "- 不要编造学生没有提供的经历、奖项、成绩或活动；如果档案不足，只能在 gaps 或 nextActions 中提示需要补充。",
  "- 不承诺录取结果，riskLevel 只能使用 high、medium、low。",
  "- 涉及截止日期、费用、资格、轮次政策和专业限制时，提醒用户核验申请年度官网。",
  "",
  "输出 JSON 前，请自行检查：",
  "1. rea.length + ed1.length 是否等于 1。",
  "2. ed2.length 是否等于 1。",
  "3. ea.length 是否在 3 到 5 之间。",
  "4. rd.length 是否在 8 到 12 之间。",
  "5. uc.length 是否等于 6。",
  "6. riskLevel 是否只使用 high、medium、low。",
  "7. 是否存在重复学校。",
  "8. 是否输出了严格 JSON，没有 Markdown 或解释文字。",
  "9. 是否避免编造用户档案中不存在的信息。",
  "10. 是否提醒官网核验政策和截止日期。",
  "",
  "JSON schema:",
  JSON.stringify(
    {
      summary: "一句话概括选校策略",
      rounds: {
        rea: [],
        ed1: [
          {
            school: "学校英文名",
            major: "推荐专业或方向",
            riskLevel: "high|medium|low",
            matchReason: "匹配理由",
            gaps: ["需要补强或核验的点"],
            nextAction: "下一步行动",
          },
        ],
        ed2: [],
        ea: [],
        rd: [],
        uc: [],
      },
      nextActions: ["全局下一步行动"],
    },
    null,
    2,
  ),
].join("\n");

export class SchoolSelectionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "SchoolSelectionError";
    this.statusCode = statusCode;
  }
}

export function createSchoolSelectionService({ activityPortfolio }) {
  async function generateSelection({
    user,
    payload = {},
    env = process.env,
    deepSeekFetch = fetch,
  }) {
    const input = normalizeInput(payload);
    const apiKey = resolveApiKey({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new SchoolSelectionError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const portfolio = activityPortfolio.getPortfolio(user);
    const model = env.DEEPSEEK_SCHOOL_SELECTION_MODEL || env.DEEPSEEK_MODEL || "deepseek-v4-pro";
    const apiResponse = await deepSeekFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage({ input, portfolio }) },
        ],
        thinking: { type: "disabled" },
        stream: false,
        temperature: 0.2,
      }),
    });

    const data = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      throw new SchoolSelectionError(data.error?.message || "DeepSeek 选校调用失败。", apiResponse.status);
    }

    const answer = extractDeepSeekResponseText(data);
    if (!answer) throw new SchoolSelectionError("DeepSeek 未返回可解析的选校内容。", 502);

    return {
      selection: validateSchoolSelectionResult(parseSelectionJson(answer)),
    };
  }

  return { generateSelection };
}

export function validateSchoolSelectionResult(value) {
  const item = normalizeObject(value, "School selection result");
  const rounds = normalizeObject(item.rounds, "School selection rounds");
  const normalizedRounds = Object.fromEntries(
    ROUND_KEYS.map((key) => [key, normalizeRound(rounds[key], key)]),
  );

  if (normalizedRounds.rea.length + normalizedRounds.ed1.length !== 1) {
    throw new SchoolSelectionError("REA / ED1 只能二选一且合计 1 所。", 502);
  }
  assertNoDuplicateSchools(normalizedRounds);
  for (const [round, [min, max]] of Object.entries(ROUND_LIMITS)) {
    const count = normalizedRounds[round].length;
    if (count < min || count > max) {
      const required = min === max ? `${min} 所` : `${min}-${max} 所`;
      throw new SchoolSelectionError(`${round.toUpperCase()} 需要 ${required}。`, 502);
    }
  }

  return {
    summary: cleanString(item.summary),
    rounds: normalizedRounds,
    nextActions: normalizeStringList(item.nextActions).slice(0, 8),
  };
}

function normalizeInput(payload) {
  const item = normalizeObject(payload, "School selection request");
  const nationality = cleanString(item.nationality);
  const highSchoolRegion = cleanString(item.highSchoolRegion);
  if (!nationality) throw new SchoolSelectionError("请填写用户国籍。", 400);
  if (!highSchoolRegion) throw new SchoolSelectionError("请填写用户高中地区。", 400);
  return {
    nationality,
    highSchoolRegion,
    preferences: cleanString(item.preferences),
  };
}

function buildUserMessage({ input, portfolio }) {
  return [
    "请基于以下信息生成美本选校系统结果，并严格遵守系统提示中的 JSON schema 与轮次数量规则。",
    "请先判断学生整体竞争力，再分配 REA/ED1、ED2、EA、RD、UC。",
    "REA/ED1 只能选择其中一个方向，合计只能 1 所。",
    "每所学校都要说明推荐专业/方向、匹配理由、风险等级、短板和下一步动作。",
    "如果信息不足，明确写入 gaps，不要自行补全。",
    "",
    "用户国籍：",
    input.nationality,
    "",
    "用户高中地区：",
    input.highSchoolRegion,
    "",
    "补充偏好：",
    input.preferences || "无",
    "",
    "我的申请档案：",
    JSON.stringify(portfolio, null, 2),
  ].join("\n");
}

function assertNoDuplicateSchools(rounds) {
  const seen = new Map();
  for (const [round, schools] of Object.entries(rounds)) {
    for (const school of schools) {
      const key = normalizeSchoolName(school.school);
      if (!key) continue;
      const previousRound = seen.get(key);
      if (previousRound) {
        throw new SchoolSelectionError(
          `同一所学校不能重复出现在多个申请轮次中：${school.school} 已出现在 ${previousRound.toUpperCase()}。`,
          502,
        );
      }
      seen.set(key, round);
    }
  }
}

function normalizeSchoolName(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function parseSelectionJson(answer) {
  const trimmed = String(answer || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u)?.[1];
  try {
    return JSON.parse(fenced || trimmed);
  } catch {
    throw new SchoolSelectionError("DeepSeek 返回的选校 JSON 无法解析。", 502);
  }
}

function normalizeRound(value, round) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new SchoolSelectionError(`${round.toUpperCase()} 必须是数组。`, 502);
  }
  return value.map(normalizeSchool);
}

function normalizeSchool(value) {
  const item = normalizeObject(value, "School item");
  const school = cleanString(item.school);
  if (!school) throw new SchoolSelectionError("每所学校必须包含 school。", 502);
  return {
    school,
    major: cleanString(item.major),
    riskLevel: normalizeRiskLevel(item.riskLevel),
    matchReason: cleanString(item.matchReason),
    gaps: normalizeStringList(item.gaps).slice(0, 6),
    nextAction: cleanString(item.nextAction),
  };
}

function normalizeRiskLevel(value) {
  const normalized = cleanString(value).toLowerCase();
  return ["high", "medium", "low"].includes(normalized) ? normalized : "medium";
}

function normalizeStringList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [cleanString(value)].filter(Boolean);
  return value.map(cleanString).filter(Boolean);
}

function normalizeObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SchoolSelectionError(`${label} must be an object`, 400);
  }
  return value;
}

function extractDeepSeekResponseText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function cleanString(value) {
  return String(value ?? "").trim();
}
