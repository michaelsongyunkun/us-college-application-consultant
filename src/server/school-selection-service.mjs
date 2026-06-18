import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSchoolsMarkdown } from "../domain/school-encyclopedia.mjs";
import { resolveApiKey } from "./api-key.mjs";
import { AI_QUALITY_VERSIONS, evaluateAiAnswerQuality } from "./ai-quality.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";

const ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "rd", "uc"];
const MAX_SELECTION_ATTEMPTS = 2;
const MAX_RAG_SOURCES = 8;
const MAX_RAG_CONTEXT_CHARS = 12_000;
const DEEPSEEK_SCHOOL_SELECTION_MAX_TOKENS = 9000;
const ROUND_LIMITS = Object.freeze({
  ed2: [1, 1],
  ea: [3, 5],
  rd: [8, 12],
  uc: [6, 6],
});

const SCHOOL_ENCYCLOPEDIA_FILES = [
  { file: "schools.md", label: "综合大学与文理学院" },
  { file: "international-schools.md", label: "英港澳加新院校" },
  { file: "other-region-schools.md", label: "其他地区院校" },
];
const LOW_FRIENDLINESS_SCORE = 5;
const MEDIUM_FRIENDLINESS_SCORE = 6.5;
const EXTRA_ADMISSION_PROBABILITY_BOOST_MULTIPLIER = 1.15;
const BOOST_ADMISSION_PROBABILITY_LOWER_MULTIPLIER = 1.15 * EXTRA_ADMISSION_PROBABILITY_BOOST_MULTIPLIER;
const BOOST_ADMISSION_PROBABILITY_UPPER_MULTIPLIER = 1.2 * EXTRA_ADMISSION_PROBABILITY_BOOST_MULTIPLIER;
const UF_TOP30_PROBABILITY_MULTIPLIER = 0.75;
const MAX_ADMISSION_PROBABILITY_PERCENT = 95;
const SCHOOL_NAME_ALIASES = new Map(Object.entries({
  mit: "massachusettsinstituteoftechnology",
  yale: "yaleuniversity",
  duke: "dukeuniversity",
  jhu: "johnshopkinsuniversity",
  johnshopkins: "johnshopkinsuniversity",
  upenn: "universityofpennsylvania",
  penn: "universityofpennsylvania",
  caltech: "californiainstituteoftechnology",
  uchicago: "universityofchicago",
  washu: "washingtonuniversityinstlouis",
  notredame: "universityofnotredame",
  cmu: "carnegiemellonuniversity",
  umich: "universityofmichiganannarbor",
  michigan: "universityofmichiganannarbor",
  unc: "universityofnorthcarolinaatchapelhill",
  uva: "universityofvirginia",
  usc: "universityofsoutherncalifornia",
  uf: "universityofflorida",
  ucla: "universityofcalifornialosangeles",
  ucberkeley: "universityofcaliforniaberkeley",
  berkeley: "universityofcaliforniaberkeley",
  ucsd: "universityofcaliforniasandiego",
  ucsandiego: "universityofcaliforniasandiego",
  ucsb: "universityofcaliforniasantabarbara",
  ucsantabarbara: "universityofcaliforniasantabarbara",
  ucdavis: "universityofcaliforniadavis",
  ucirvine: "universityofcaliforniairvine",
  uiuc: "universityofillinoisurbana-champaign",
  uwmadison: "universityofwisconsinmadison",
  wisconsinmadison: "universityofwisconsinmadison",
  rutgers: "rutgersuniversitynewbrunswick",
  uw: "universityofwashington",
  utaustin: "universityoftexasataustin",
  texasataustin: "universityoftexasataustin",
  gt: "georgiainstituteoftechnology",
  gatech: "georgiainstituteoftechnology",
  georgiatech: "georgiainstituteoftechnology",
  bc: "bostoncollege",
  bu: "bostonuniversity",
  osu: "theohiostateuniversity",
  ohiostate: "theohiostateuniversity",
  ohiostateuniversity: "theohiostateuniversity",
  lehigh: "lehighuniversity",
  umd: "universityofmarylandcollegepark",
  maryland: "universityofmarylandcollegepark",
  uga: "universityofgeorgia",
  tamu: "texasamuniversity",
  texasam: "texasamuniversity",
  wfu: "wakeforestuniversity",
  brandeis: "brandeisuniversity",
  wm: "williamandmary",
  williammary: "williamandmary",
  cwru: "casewesternreserveuniversity",
  neu: "northeasternuniversity",
  northeastern: "northeasternuniversity",
  tulane: "tulaneuniversity",
  fsu: "floridastateuniversity",
  floridastate: "floridastateuniversity",
  pepperdine: "pepperdineuniversity",
  umassamherst: "universityofmassachusettsamherst",
  pennstate: "pennsylvaniastateuniversityuniversitypark",
  pennstateuniversity: "pennsylvaniastateuniversityuniversitypark",
  pitt: "universityofpittsburgh",
  rpi: "rensselaerpolytechnicinstitute",
  uconn: "universityofconnecticut",
  villanova: "villanovauniversity",
  gwu: "georgewashingtonuniversity",
  stevens: "stevensinstituteoftechnology",
  american: "americanuniversity",
  usna: "unitedstatesnavalacademy",
  cmc: "claremontmckennacollege",
  usma: "unitedstatesmilitaryacademyatwestpoint",
  wl: "washingtonandleeuniversity",
  wlu: "washingtonandleeuniversity",
  usafa: "unitedstatesairforceacademy",
  soka: "sokauniversityofamerica",
  kenyon: "kenyoncollege",
  lafayette: "lafayettecollege",
  occidental: "occidentalcollege",
  trinity: "trinitycollege",
  skidmore: "skidmorecollege",
  pitzer: "pitzercollege",
  bucknell: "bucknelluniversity",
  spelman: "spelmancollege",
  sewanee: "theuniversityofthesouth",
  sewaneetheuniversityofthesouth: "theuniversityofthesouth",
  whitman: "whitmancollege",
  berea: "bereacollege",
  dickinson: "dickinsoncollege",
  depauw: "depauwuniversity",
  centre: "centrecollege",
  furman: "furmanuniversity",
  earlham: "earlhamcollege",
  lawrence: "lawrenceuniversity",
  stjohns: "stjohnscollege",
  stolaf: "stolafcollege",
  union: "unioncollege",
}));
const ADMISSION_PROBABILITY_BOOST_SCHOOLS = [
  "University of California, Santa Barbara",
  "University of California, Davis",
  "University of California, Irvine",
  "University of Illinois Urbana-Champaign",
  "University of Wisconsin--Madison",
  "Rutgers University--New Brunswick",
  "University of Washington",
  "The Ohio State University",
  "Lehigh University",
  "University of Maryland, College Park",
  "University of Georgia",
  "Texas A&M University",
  "Wake Forest University",
  "Brandeis University",
  "William & Mary",
  "Case Western Reserve University",
  "Northeastern University",
  "Tulane University",
  "Virginia Tech",
  "Florida State University",
  "Pepperdine University",
  "University of Massachusetts Amherst",
  "Pennsylvania State University--University Park",
  "University of Pittsburgh",
  "Rensselaer Polytechnic Institute",
  "University of Connecticut",
  "Villanova University",
  "George Washington University",
  "Stevens Institute of Technology",
  "American University",
  "Soka University of America",
  "Kenyon College",
  "Colorado College",
  "Lafayette College",
  "Occidental College",
  "Trinity College",
  "Skidmore College",
  "Pitzer College",
  "Connecticut College",
  "Bucknell University",
  "Spelman College",
  "Sewanee--The University of the South",
  "Whitman College",
  "Berea College",
  "Dickinson College",
  "DePauw University",
  "Centre College",
  "Furman University",
  "Earlham College",
  "Lawrence University",
  "St. John's College",
  "St. Olaf College",
  "Union College",
];
const ADMISSION_PROBABILITY_BOOST_SCHOOL_KEYS = new Set(
  ADMISSION_PROBABILITY_BOOST_SCHOOLS.flatMap(buildFriendlinessSchoolKeys),
);
const UF_TOP30_SCHOOL_KEYS = new Set(buildFriendlinessSchoolKeys("University of Florida"));

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
  "- University of California 系统校区只能放入 uc 数组，不要放入 RD、EA、ED 或 REA。",
  "",
  "风险等级定义：",
  "- high：冲刺校，录取难度明显高于当前档案竞争力。",
  "- medium：匹配校，档案与学校录取画像较接近。",
  "- low：稳妥校，相对更有把握，但不能承诺录取。",
  "",
  "录取概率区间校准：",
  "- Top30 或同等超高选择性学校可以保持非常保守的概率区间；这些学校即使背景优秀也不要给出确定性表述。",
  "- Top30 之后的学校要按学生背景、专业匹配、成绩/课程、活动/竞赛、国际生身份和学校录取画像综合校准，不要把 Top30 的极低概率口径套用到所有学校。",
  "- 对 Top30 之后且与学生档案明显匹配的 medium/low 学校，概率区间应体现更高把握度，避免系统性低估；低风险学校通常应明显高于匹配校，匹配校通常应明显高于冲刺校。",
  "- 必须充分使用院校百科中的“中国学生录取友好度”字段校准每所学校的 admissionProbability；友好度低的学校，即使学生背景较强，也要下调录取概率区间并避免标为过于乐观的风险等级。",
  "- 友好度 1.0-3.5 视为低友好，概率应显著下调；4.0-5.0 视为中低友好，概率应下调；5.5-6.5 视为中等友好，概率口径应略偏保守；7.0 以上不因该字段额外压低。",
  "- University of Florida / UF 必须按 Top30 学校处理，即使院校百科友好度较高，也要使用更保守的录取概率区间，避免把 UF 当作普通 Top30 之后学校。",
  `- 对以下指定学校，admissionProbability 应在此前 15%-20% 上调基础上再次上调 15%，且该上调优先于友好度下调：${ADMISSION_PROBABILITY_BOOST_SCHOOLS.join("、")}。`,
  "- 不要把官网整体录取率直接等同于该学生个人录取概率；官网录取率只能作为选择性参考，最终 admissionProbability 必须结合该学生档案竞争力和专业适配度给出区间。",
  "- 信息不足时用更宽的区间并在 gaps 中说明缺口，不要因为缺少信息就把 Top30 之后的学校全部压到极低概率。",
  "",
  "输出要求：",
  "- 只返回严格 JSON，不要 Markdown，不要代码块，不要解释性前后缀。",
  "- 不要编造学生没有提供的经历、奖项、成绩或活动；如果档案不足，只能在 gaps 或 nextActions 中提示需要补充。",
  "- 不承诺录取结果，riskLevel 只能使用 high、medium、low。",
  "- 每所学校必须输出 admissionProbability，字段值使用录取概率区间，例如 5%-10%、15%-25%；这是规划估算，不是录取承诺。",
  "- 涉及截止日期、费用、资格、轮次政策和专业限制时，提醒用户核验申请年度官网。",
  "",
  "输出 JSON 前，请自行检查：",
  "1. rea.length + ed1.length 是否等于 1。",
  "2. ed2.length 是否等于 1。",
  "3. ea.length 是否在 3 到 5 之间。",
  "4. rd.length 是否在 8 到 12 之间。",
  "5. uc.length 是否等于 6。",
  "6. riskLevel 是否只使用 high、medium、low。",
  "7. 每所学校是否都有 admissionProbability，且是录取概率区间而不是录取承诺。",
  "8. 是否存在重复学校。",
  "9. 是否输出了严格 JSON，没有 Markdown 或解释文字。",
  "10. 是否避免编造用户档案中不存在的信息。",
  "11. 是否提醒官网核验政策和截止日期。",
  "",
  "JSON schema:",
  JSON.stringify(
    {
      summary: "一句话概括选校策略",
      strategy: {
        earlyStrategy: "REA/ED1/ED2 的早申策略摘要",
        ucStrategy: "UC 体系申请策略摘要",
        rdStrategy: "RD 轮次分层申请策略摘要",
      },
      rounds: {
        rea: [],
        ed1: [
          {
            school: "学校英文名",
            major: "推荐专业或方向",
            riskLevel: "high|medium|low",
            admissionProbability: "录取概率区间，例如 5%-10%；不是录取承诺",
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

export function createSchoolSelectionService({ activityPortfolio, root = process.cwd() }) {
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
    const ragSources = await buildSchoolSelectionRagSources({ root, input, portfolio });
    const friendlinessIndex = await buildSchoolFriendlinessIndex(root);
    const ragContext = buildRagContext(ragSources);
    const model = normalizeDeepSeekModel(env.DEEPSEEK_SCHOOL_SELECTION_MODEL, "deepseek-v4-flash");
    const maxTokens = normalizePositiveInteger(
      env.DEEPSEEK_SCHOOL_SELECTION_MAX_TOKENS,
      DEEPSEEK_SCHOOL_SELECTION_MAX_TOKENS,
    );
    let lastValidationError = null;
    for (let attempt = 1; attempt <= MAX_SELECTION_ATTEMPTS; attempt += 1) {
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
            {
              role: "user",
              content: buildUserMessage({
                input,
                portfolio,
                ragContext,
                repairMessage: lastValidationError?.message || "",
              }),
            },
          ],
          thinking: { type: "disabled" },
          stream: false,
          temperature: attempt === 1 ? 0.2 : 0.1,
          max_tokens: maxTokens,
        }),
      });

      const data = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) {
        throw new SchoolSelectionError(data.error?.message || "DeepSeek 选校调用失败。", apiResponse.status);
      }

      const answer = extractDeepSeekResponseText(data);
      if (!answer) {
        lastValidationError = new SchoolSelectionError("DeepSeek 未返回可解析的选校内容。", 502);
        continue;
      }

      try {
        const validatedSelection = validateSchoolSelectionResult(parseSelectionJson(answer));
        const serializedRagSources = ragSources.map(serializeRagSource);
        return {
          selection: calibrateSelectionWithFriendliness(validatedSelection, friendlinessIndex),
          selectionVersion: input.strategyMode,
          ragSources: serializedRagSources,
          attempts: attempt,
          quality: evaluateAiAnswerQuality({
            answer,
            sources: serializedRagSources,
            expectedSourceTypes: ["school-encyclopedia"],
            metadata: {
              feature: "school-selection",
              promptVersion: AI_QUALITY_VERSIONS.schoolSelectionPrompt,
              model,
              sourceSetVersion: AI_QUALITY_VERSIONS.schoolSelectionSourceSet,
              parserVersion: AI_QUALITY_VERSIONS.schoolSelectionParser,
            },
          }),
        };
      } catch (error) {
        if (!(error instanceof SchoolSelectionError) || attempt === MAX_SELECTION_ATTEMPTS) {
          throw error;
        }
        lastValidationError = error;
      }
    }
    throw lastValidationError || new SchoolSelectionError("DeepSeek 选校结果未通过二次校验。", 502);
  }

  return { generateSelection };
}

export function validateSchoolSelectionResult(value) {
  const item = normalizeObject(value, "School selection result");
  const rounds = normalizeObject(item.rounds, "School selection rounds");
  let normalizedRounds = repairUcRoundDuplicates(Object.fromEntries(
    ROUND_KEYS.map((key) => [key, normalizeRound(rounds[key], key)]),
  ));
  normalizedRounds = repairEarlyApplicationChoice(normalizedRounds);
  normalizedRounds = repairRoundDuplicates(normalizedRounds);

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
    strategy: normalizeStrategy(item.strategy),
    rounds: normalizedRounds,
    nextActions: normalizeStringList(item.nextActions).slice(0, 8),
  };
}

async function buildSchoolFriendlinessIndex(root) {
  try {
    const markdown = await readFile(join(root, "data", "schools.md"), "utf8");
    return buildSchoolFriendlinessIndexFromSchools(parseSchoolsMarkdown(markdown));
  } catch {
    return { entries: [], byKey: new Map() };
  }
}

function buildSchoolFriendlinessIndexFromSchools(schools) {
  const entries = schools
    .map((school) => {
      const friendliness = parseFriendlinessText(school.chinaApplicantFriendliness);
      if (!friendliness) return null;
      const keys = buildFriendlinessSchoolKeys(school.name);
      return {
        schoolName: school.name,
        keys,
        ...friendliness,
      };
    })
    .filter(Boolean);
  const byKey = new Map();
  for (const entry of entries) {
    for (const key of entry.keys) {
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }
  return { entries, byKey };
}

function parseFriendlinessText(value) {
  const text = cleanString(value);
  const score = Number(text.match(/(\d+(?:\.\d+)?)\s*\/\s*10/u)?.[1]);
  if (!Number.isFinite(score)) return null;
  return {
    text,
    score,
    tier: text.match(/（([^）]+)）/u)?.[1] || "",
  };
}

function calibrateSelectionWithFriendliness(selection, friendlinessIndex) {
  return {
    ...selection,
    rounds: Object.fromEntries(
      ROUND_KEYS.map((round) => [
        round,
        (selection.rounds?.[round] || []).map((school) =>
          calibrateSchoolWithFriendliness(school, friendlinessIndex),
        ),
      ]),
    ),
  };
}

function calibrateSchoolWithFriendliness(school, friendlinessIndex) {
  if (isUfTop30School(school.school)) {
    const probability = scaleAdmissionProbability(school.admissionProbability, UF_TOP30_PROBABILITY_MULTIPLIER);
    const riskLevel = calibrateRiskLevelForUfTop30(school.riskLevel);
    const changed = probability.changed || riskLevel !== school.riskLevel;
    if (!changed) return school;
    return {
      ...school,
      riskLevel,
      admissionProbability: probability.value,
      gaps: appendUfTop30CalibrationGap(school.gaps),
    };
  }

  if (isAdmissionProbabilityBoostSchool(school.school)) {
    const probability = boostAdmissionProbability(school.admissionProbability);
    return probability.changed ? { ...school, admissionProbability: probability.value } : school;
  }

  if (!friendlinessIndex?.entries?.length) return school;

  const friendliness = findFriendlinessRecord(school.school, friendlinessIndex);
  if (!friendliness || friendliness.score > MEDIUM_FRIENDLINESS_SCORE) return school;

  const multiplier = friendlinessProbabilityMultiplier(friendliness.score);
  const probability = scaleAdmissionProbability(school.admissionProbability, multiplier);
  const riskLevel = calibrateRiskLevelWithFriendliness(school.riskLevel, friendliness.score);
  const changed = probability.changed || riskLevel !== school.riskLevel;
  if (!changed) return school;

  return {
    ...school,
    riskLevel,
    admissionProbability: probability.value,
    gaps: appendFriendlinessCalibrationGap(school.gaps, friendliness),
  };
}

function findFriendlinessRecord(schoolName, friendlinessIndex) {
  const schoolKey = canonicalSchoolKey(schoolName);
  const directMatch = friendlinessIndex.byKey.get(schoolKey);
  if (directMatch) return directMatch;

  let bestMatch = null;
  let bestKeyLength = 0;
  for (const entry of friendlinessIndex.entries) {
    for (const entryKey of entry.keys) {
      if (entryKey.length < 4) continue;
      if (!schoolKey.includes(entryKey) && !entryKey.includes(schoolKey)) continue;
      if (entryKey.length > bestKeyLength) {
        bestMatch = entry;
        bestKeyLength = entryKey.length;
      }
    }
  }
  return bestMatch;
}

function isAdmissionProbabilityBoostSchool(schoolName) {
  return buildFriendlinessSchoolKeys(schoolName).some((key) => ADMISSION_PROBABILITY_BOOST_SCHOOL_KEYS.has(key));
}

function isUfTop30School(schoolName) {
  return buildFriendlinessSchoolKeys(schoolName).some((key) => UF_TOP30_SCHOOL_KEYS.has(key));
}

function friendlinessProbabilityMultiplier(score) {
  if (score <= 3.5) return 0.45;
  if (score <= LOW_FRIENDLINESS_SCORE) return 0.65;
  if (score <= MEDIUM_FRIENDLINESS_SCORE) return 0.85;
  return 1;
}

function calibrateRiskLevelWithFriendliness(riskLevel, score) {
  const normalized = cleanString(riskLevel).toLowerCase();
  if (score <= 3.5) return "high";
  if (score <= LOW_FRIENDLINESS_SCORE && normalized === "low") return "medium";
  return normalized || "medium";
}

function calibrateRiskLevelForUfTop30(riskLevel) {
  const normalized = cleanString(riskLevel).toLowerCase();
  return normalized === "low" ? "medium" : normalized || "medium";
}

function scaleAdmissionProbability(value, multiplier) {
  return scaleAdmissionProbabilityBounds(value, multiplier, multiplier);
}

function boostAdmissionProbability(value) {
  return scaleAdmissionProbabilityBounds(
    value,
    BOOST_ADMISSION_PROBABILITY_LOWER_MULTIPLIER,
    BOOST_ADMISSION_PROBABILITY_UPPER_MULTIPLIER,
  );
}

function scaleAdmissionProbabilityBounds(value, lowerMultiplier, upperMultiplier) {
  const original = cleanString(value);
  if (lowerMultiplier === 1 && upperMultiplier === 1) return { value: original, changed: false };

  const match = original.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:-|–|—|~|至|到)\s*(\d+(?:\.\d+)?)\s*%/u);
  if (!match) return scaleSingleAdmissionProbability(original, upperMultiplier);

  const lower = Number(match[1]);
  const upper = Number(match[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return { value: original, changed: false };
  }

  const sortedLower = Math.min(lower, upper);
  const sortedUpper = Math.max(lower, upper);
  const scaledLower = scalePercentValue(sortedLower, lowerMultiplier);
  const scaledUpper = scalePercentValue(sortedUpper, upperMultiplier);
  const adjustedUpper = Math.min(MAX_ADMISSION_PROBABILITY_PERCENT, Math.max(scaledLower + 1, scaledUpper));
  const adjustedLower = Math.min(scaledLower, Math.max(1, adjustedUpper - 1));
  const adjusted = `${formatPercentValue(adjustedLower)}%-${formatPercentValue(adjustedUpper)}%`;
  return { value: adjusted, changed: adjusted !== original };
}

function scaleSingleAdmissionProbability(value, multiplier) {
  const original = cleanString(value);
  const single = original.match(/(\d+(?:\.\d+)?)\s*%/u);
  if (!single) return { value: original, changed: false };
  const upper = Number(single[1]);
  if (!Number.isFinite(upper)) return { value: original, changed: false };
  const adjustedUpper = scalePercentValue(upper, multiplier);
  const adjustedLower = Math.max(1, adjustedUpper - 2);
  const adjusted = `${formatPercentValue(adjustedLower)}%-${formatPercentValue(adjustedUpper)}%`;
  return { value: adjusted, changed: adjusted !== original };
}

function scalePercentValue(value, multiplier) {
  if (value <= 0) return 0;
  return Math.min(MAX_ADMISSION_PROBABILITY_PERCENT, Math.max(1, Math.round(value * multiplier)));
}

function formatPercentValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, "");
}

function appendFriendlinessCalibrationGap(gaps, friendliness) {
  const note = [
    `院校百科中国学生录取友好度为 ${friendliness.score}/10`,
    friendliness.tier ? `（${friendliness.tier}）` : "",
    "，已据此下调录取概率区间。",
  ].join("");
  const existing = normalizeStringList(gaps);
  if (existing.includes(note)) return existing;
  return [...existing.slice(0, 5), note];
}

function appendUfTop30CalibrationGap(gaps) {
  const note = "UF 按 Top30 学校口径保守校准，已下调录取概率区间。";
  const existing = normalizeStringList(gaps);
  if (existing.includes(note)) return existing;
  return [...existing.slice(0, 5), note];
}

function buildFriendlinessSchoolKeys(name) {
  const candidates = [
    name,
    extractEnglishSchoolName(name),
  ].filter(Boolean);
  return [...new Set(candidates.flatMap((candidate) => {
    const rawKey = normalizeSchoolKey(candidate);
    const canonicalKey = canonicalSchoolKey(candidate);
    return [rawKey, canonicalKey].filter(Boolean);
  }))];
}

function extractEnglishSchoolName(value) {
  return (String(value || "").match(/[A-Za-z][A-Za-z .&'()/-]*/g) || [])
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function canonicalSchoolKey(value) {
  const key = normalizeSchoolKey(value);
  return SCHOOL_NAME_ALIASES.get(key) || key;
}

function normalizeSchoolKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeStrategy(value) {
  if (value === undefined || value === null) {
    return {
      earlyStrategy: "",
      ucStrategy: "",
      rdStrategy: "",
    };
  }
  const item = normalizeObject(value, "School selection strategy");
  return {
    earlyStrategy: cleanString(item.earlyStrategy),
    ucStrategy: cleanString(item.ucStrategy),
    rdStrategy: cleanString(item.rdStrategy),
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
    targetMajor: cleanString(item.targetMajor),
    budgetSensitivity: cleanString(item.budgetSensitivity),
    regionPreference: cleanString(item.regionPreference),
    campusSetting: cleanString(item.campusSetting),
    schoolSize: cleanString(item.schoolSize),
    edRiskTolerance: cleanString(item.edRiskTolerance),
    scholarshipNeed: cleanString(item.scholarshipNeed),
    strategyMode: normalizeStrategyMode(item.strategyMode),
    preferences: cleanString(item.preferences),
  };
}

function buildUserMessage({ input, portfolio, ragContext = "", repairMessage = "" }) {
  return [
    "请基于以下信息生成美本选校系统结果，并严格遵守系统提示中的 JSON schema 与轮次数量规则。",
    "请先判断学生整体竞争力，再分配 REA/ED1、ED2、EA、RD、UC。",
    `本次策略版本：${input.strategyMode}。保守版降低早申和冲刺比例；均衡版兼顾意愿与风险；冲刺版可以提高高风险学校比例但仍要保留稳妥覆盖。`,
    "REA/ED1 只能选择其中一个方向，合计只能 1 所。",
    "每所学校都要说明推荐专业/方向、匹配理由、风险等级、短板和下一步动作。",
    "如果信息不足，明确写入 gaps，不要自行补全。",
    repairMessage
      ? `上一次输出未通过二次校验：${repairMessage}。请只修正 JSON，不要解释。`
      : "",
    "",
    "用户国籍：",
    input.nationality,
    "",
    "用户高中地区：",
    input.highSchoolRegion,
    "",
    "结构化偏好：",
    `- 目标专业/方向：${input.targetMajor || "无"}`,
    `- 预算敏感度：${input.budgetSensitivity || "无"}`,
    `- 地区偏好：${input.regionPreference || "无"}`,
    `- 校园环境：${input.campusSetting || "无"}`,
    `- 学校规模：${input.schoolSize || "无"}`,
    `- ED 风险承受度：${input.edRiskTolerance || "无"}`,
    `- 奖学金需求：${input.scholarshipNeed || "无"}`,
    "",
    "补充偏好：",
    input.preferences || "无",
    "",
    "院校百科 RAG 参考：",
    ragContext || "未匹配到高相关院校百科片段；仍需提醒用户核验申请年度官网。",
    "",
    "我的申请档案：",
    JSON.stringify(buildSchoolSelectionPortfolioContext(portfolio), null, 2),
  ].join("\n");
}

function buildSchoolSelectionPortfolioContext(portfolio = {}) {
  const academicRecords = portfolio.academicRecords || {};
  return {
    applicationPlan: compactApplicationPlan(portfolio.applicationPlan),
    activities: compactList(portfolio.activities, 10, [
      "activityName",
      "type",
      "timeStage",
      "role",
      "description",
      "outcome",
      "status",
    ]),
    competitions: compactList(portfolio.competitions, 5, [
      "competitionName",
      "subject",
      "yearGrade",
      "award",
      "contribution",
      "status",
    ]),
    summerSchools: compactList(portfolio.summerSchools, 3, [
      "programName",
      "organizer",
      "direction",
      "participationTime",
      "status",
      "output",
    ]),
    recommendationLetters: compactObject(portfolio.recommendationLetters),
    planningActions: compactList(portfolio.planningActions, 8, ["text", "source"]),
    deepSeekNotes: compactList(portfolio.deepSeekNotes, 5, ["title", "content", "source"]),
    academicRecords: {
      courseSystem: cleanString(academicRecords.courseSystem),
      ibPredictedScore: cleanString(academicRecords.ibPredictedScore),
      gpaScale: cleanString(academicRecords.gpaScale),
      gpaRecords: compactList(academicRecords.gpaRecords, 8, ["gradeLevel", "term", "gpa"]),
      satTests: compactList(academicRecords.satTests, 3, ["totalScore", "englishScore", "mathScore", "testDate"]),
      apExams: compactList(academicRecords.apExams, 12, ["courseName", "score", "examYear"]),
    },
  };
}

function compactApplicationPlan(applicationPlan = {}) {
  return Object.fromEntries(
    ["rea", "ed1", "ed2", "ea", "uc", "rd", "multiCountry"].map((round) => [
      round,
      compactList(applicationPlan[round], 24, ["school", "major"]),
    ]),
  );
}

function compactList(items, limit, fields) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map((item) => compactObject(item, fields));
}

function compactObject(item, fields) {
  if (!item || typeof item !== "object") return {};
  const entries = fields ? fields.map((field) => [field, item[field]]) : Object.entries(item);
  return Object.fromEntries(
    entries
      .map(([key, value]) => [key, compactValue(value)])
      .filter(([, value]) => value !== "" && value !== undefined && value !== null),
  );
}

function compactValue(value) {
  if (Array.isArray(value)) {
    return value.map(compactValue).filter((item) => item !== "" && item !== undefined && item !== null);
  }
  if (value && typeof value === "object") return compactObject(value);
  return truncateText(cleanString(value), 500);
}

function truncateText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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

function repairUcRoundDuplicates(rounds) {
  const ucSchoolKeys = new Set((rounds.uc || []).map((school) => normalizeSchoolName(school.school)).filter(Boolean));
  if (!ucSchoolKeys.size) return rounds;

  let changed = false;
  const repairedRounds = { ...rounds };
  for (const round of ROUND_KEYS.filter((key) => key !== "uc")) {
    const originalSchools = repairedRounds[round] || [];
    const filteredSchools = originalSchools.filter((school) => {
      const shouldRemove = ucSchoolKeys.has(normalizeSchoolName(school.school)) && isUniversityOfCaliforniaCampus(school.school);
      if (shouldRemove) changed = true;
      return !shouldRemove;
    });
    repairedRounds[round] = filteredSchools;
  }
  return changed ? repairedRounds : rounds;
}

function repairEarlyApplicationChoice(rounds) {
  const earlyChoices = [
    ...(rounds.ed1 || []).map((school) => ({ round: "ed1", school })),
    ...(rounds.rea || []).map((school) => ({ round: "rea", school })),
  ];
  if (earlyChoices.length === 1) return rounds;

  if (earlyChoices.length === 0) {
    const donorRound = ["rd", "ea"].find((round) => {
      const minimum = ROUND_LIMITS[round]?.[0] || 0;
      return (rounds[round] || []).length > minimum;
    });
    if (!donorRound) return rounds;
    const donorSchools = [...rounds[donorRound]];
    const promotedSchool = donorSchools.pop();
    return {
      ...rounds,
      [donorRound]: donorSchools,
      rea: [],
      ed1: [promotedSchool],
    };
  }

  const preferredChoice = earlyChoices[0];
  return {
    ...rounds,
    rea: preferredChoice.round === "rea" ? [preferredChoice.school] : [],
    ed1: preferredChoice.round === "ed1" ? [preferredChoice.school] : [],
  };
}

function repairRoundDuplicates(rounds) {
  const seen = new Set();
  const removedByRound = Object.fromEntries(ROUND_KEYS.map((round) => [round, 0]));
  let changed = false;
  const repairedRounds = {};

  for (const round of ROUND_KEYS) {
    const schools = rounds[round] || [];
    repairedRounds[round] = [];
    for (const school of schools) {
      const key = normalizeSchoolName(school.school);
      const minimum = ROUND_LIMITS[round]?.[0] || 0;
      if (key && seen.has(key) && schools.length - removedByRound[round] - 1 >= minimum) {
        removedByRound[round] += 1;
        changed = true;
        continue;
      }
      if (key) seen.add(key);
      repairedRounds[round].push(school);
    }
  }

  return changed ? { ...rounds, ...repairedRounds } : rounds;
}

function isUniversityOfCaliforniaCampus(value) {
  return /\buniversity of california\b|\buc\b/iu.test(cleanString(value));
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
  const major = cleanString(item.major);
  if (!major) throw new SchoolSelectionError(`每所学校必须包含专业方向：${school}。`, 502);
  const riskLevel = normalizeRiskLevel(item.riskLevel, school);
  const admissionProbability = normalizeAdmissionProbability(item.admissionProbability, school);
  const matchReason = cleanString(item.matchReason);
  if (!matchReason) throw new SchoolSelectionError(`每所学校必须包含匹配理由：${school}。`, 502);
  const nextAction = cleanString(item.nextAction);
  if (!nextAction) throw new SchoolSelectionError(`每所学校必须包含下一步行动：${school}。`, 502);
  return {
    school,
    major,
    riskLevel,
    admissionProbability,
    matchReason,
    gaps: normalizeStringList(item.gaps).slice(0, 6),
    nextAction,
  };
}

function normalizeAdmissionProbability(value, school) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new SchoolSelectionError(`每所学校必须包含录取概率区间：${school}。`, 502);
  }
  return normalized;
}

function normalizeRiskLevel(value, school) {
  const normalized = cleanString(value).toLowerCase();
  if (!["high", "medium", "low"].includes(normalized)) {
    throw new SchoolSelectionError(`riskLevel 只能使用 high、medium、low：${school}。`, 502);
  }
  return normalized;
}

async function buildSchoolSelectionRagSources({ root, input, portfolio }) {
  const documents = await buildSchoolEncyclopediaDocuments(root);
  const query = [
    input.targetMajor,
    input.preferences,
    input.regionPreference,
    input.campusSetting,
    input.schoolSize,
    ...Object.values(portfolio.applicationPlan || {}).flatMap((entries) =>
      Array.isArray(entries) ? entries.flatMap((entry) => [entry.school, entry.major]) : [],
    ),
  ].filter(Boolean).join(" ");
  const tokens = tokenize(query || "美本 选校 UC ED EA RD");
  return documents
    .map((document, index) => ({ ...document, index, score: scoreRagDocument(document, tokens) }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_RAG_SOURCES);
}

async function buildSchoolEncyclopediaDocuments(root) {
  const documents = [];
  for (const entry of SCHOOL_ENCYCLOPEDIA_FILES) {
    const text = await readFile(join(root, "data", entry.file), "utf8");
    splitMarkdownIntoChunks(text).forEach((chunk, index) => {
      const heading = chunk.match(/^#{1,6}\s+(.+)$/m)?.[1]?.replace(/\*+/g, "").trim() || "";
      documents.push({
        id: `school-rag-${entry.file}-${index}`,
        type: "school-encyclopedia",
        title: `院校百科：${entry.label}${heading ? ` / ${heading}` : ""}`,
        text: chunk.trim(),
      });
    });
  }
  return documents;
}

function splitMarkdownIntoChunks(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n(?=#{2,4}\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function scoreRagDocument(document, tokens) {
  const searchable = normalizeSearchText(`${document.title}\n${document.text}`);
  return tokens.reduce((score, token) => {
    if (!searchable.includes(token)) return score;
    return score + (token.length >= 4 ? 3 : 1);
  }, 0);
}

function buildRagContext(sources) {
  const sections = [];
  let totalChars = 0;
  for (const [index, source] of sources.entries()) {
    const block = [`[${index + 1}] ${source.title}`, source.text].join("\n");
    if (totalChars + block.length > MAX_RAG_CONTEXT_CHARS) break;
    sections.push(block);
    totalChars += block.length;
  }
  return sections.join("\n\n---\n\n");
}

function serializeRagSource(source) {
  return {
    id: source.id,
    type: source.type,
    title: source.title,
    snippet: source.text.slice(0, 260),
  };
}

function normalizeStrategyMode(value) {
  const normalized = cleanString(value);
  return ["保守版", "均衡版", "冲刺版"].includes(normalized) ? normalized : "均衡版";
}

function tokenize(value) {
  const text = String(value || "").toLowerCase();
  const asciiTokens = text.match(/[a-z0-9][a-z0-9.+#-]*/g) || [];
  const cjkChars = Array.from(text).filter((char) => /\p{Script=Han}/u.test(char));
  const cjkBigrams = [];
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    cjkBigrams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  return [...new Set([...asciiTokens, ...cjkBigrams])].filter((token) => token.length >= 2);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.+#-]+/gu, " ")
    .trim();
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

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
