import { resolveApiKey } from "./api-key.mjs";

const ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "rd", "uc"];
const ROUND_LIMITS = Object.freeze({
  ed2: [1, 1],
  ea: [3, 5],
  rd: [8, 12],
  uc: [6, 6],
});

const SYSTEM_PROMPT = [
  "你是 US College Compass 的美本选校系统，服务对象是准备美本申请的学生和家长。",
  "你必须根据用户国籍、用户高中地区、我的申请档案中的成绩/活动/竞赛/夏校/推荐信/已有选校计划，生成结构化选校方案。",
  "",
  "硬性轮次规则：",
  "- REA / ED1 二选一，rea 和 ed1 两个数组合计必须且只能有 1 所学校。",
  "- ED2 必须 1 所。",
  "- EA 必须 3-5 所。",
  "- RD 必须 8-12 所。",
  "- UC 必须 6 所。",
  "",
  "输出要求：",
  "- 只返回严格 JSON，不要 Markdown，不要代码块，不要解释性前后缀。",
  "- 不要编造学生经历；如果档案不足，只能在 gaps 或 nextActions 中提示需要补充。",
  "- 不承诺录取结果，riskLevel 只能使用 high、medium、low。",
  "- 涉及截止日期、费用、资格、轮次政策和专业限制时，提醒用户核验申请年度官网。",
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
