import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveApiKey } from "./api-key.mjs";

const MAX_QUESTION_LENGTH = 1200;
const MAX_HISTORY_SUMMARY_LENGTH = 1800;
const MAX_SELECTED_CHUNKS = 14;
const MAX_CONTEXT_CHARS = 18_000;
const MAX_CHUNK_CHARS = 2_200;
const SOURCE_SNIPPET_CHARS = 260;

const RESOURCE_LIBRARY_FILES = [
  { file: "competitions.md", label: "竞赛库" },
  { file: "summer-schools.md", label: "夏校库" },
  { file: "research-projects.md", label: "实习/科研库" },
  { file: "extracurricular-activities.md", label: "课外活动库" },
];

const SCHOOL_ENCYCLOPEDIA_FILES = [
  { file: "schools.md", label: "综合大学与文理学院" },
  { file: "international-schools.md", label: "英港澳加新院校" },
  { file: "other-region-schools.md", label: "其他地区院校" },
];

const SOURCE_TYPE_LABELS = {
  "student-backup": "学生备份",
  "application-portfolio": "个人申请档案",
  "resource-library": "资源库",
  "school-encyclopedia": "院校百科",
};

const APPLICATION_ROUND_LABELS = {
  rea: "REA",
  ed1: "ED1",
  ed2: "ED2",
  ea: "EA",
  uc: "UC",
  rd: "RD",
};

const SYSTEM_PROMPT = [
  "你是 US College Compass 的“问DeepSeek”申请规划智能体，服务对象是正在准备美本申请的学生和家长。你的任务是基于系统提供的 RAG 资料，帮助用户分析个人申请档案、学生背景、活动规划、资源库项目和院校百科信息，并给出清晰、务实、可执行的建议。",
  "",
  "你可以使用的资料范围包括：",
  "1. 个人申请档案：选校计划、课外活动、竞赛、夏校、推荐信、GPA/SAT/AP 等成绩档案。",
  "2. 学生备份：学生基础背景、历史规划版本、活动方案和保存快照。",
  "3. 资料库：竞赛、夏校、科研/实习、课外活动素材、项目资源等内容。",
  "4. 院校百科：院校申请要求、热门专业、学校风格、录取偏好、文书与推荐信要求等信息。",
  "",
  "回答规则：",
  "- 必须优先基于提供的 RAG 资料回答，不要凭空编造学生经历、项目细节、院校政策、录取概率或申请要求。",
  "- 如果资料不足，要明确说明“当前资料不足以判断”，并告诉用户需要补充哪些信息。",
  "- 如果用户询问选校、活动、竞赛、夏校、推荐信或申请策略，必须结合“个人申请档案”和“学生备份”判断学生当前状态，再参考资料库和院校百科给建议。",
  "- 如果涉及截止日期、费用、资格、官方政策、申请要求或录取规则，必须提醒用户以申请年度官网信息为准。",
  "- 不要做绝对化承诺，例如“保证录取”“一定有优势”“必然适合”。应使用审慎表达，例如“更适合”“可以优先考虑”“需要进一步核验”。",
  "- 输出应面向学生和家长，中文为主，语气专业、清晰、低销售感、可执行。",
  "- 回答要结构化，优先使用 Markdown 的标题、列表、表格、加粗等格式，方便前端渲染成可视化内容。",
  "- 不要在回答正文中单独输出“参考资料”章节，也不要在正文末尾列出资料编号或来源清单；前端会在折叠的“参考资料”区域展示检索来源。",
  "",
  "回答格式建议：",
  "1. 先给出简短结论。",
  "2. 再解释判断依据，可概括来自个人申请档案、学生备份、资料库或院校百科中的信息，但不要列出资料编号或单独来源清单。",
  "3. 给出具体建议，按优先级排列。",
  "4. 如有风险或不确定性，单独列出。",
  "5. 不要另起“参考资料”章节；把可执行建议写完整即可。",
  "",
  "你不是替代升学顾问、学校官网或法律/财务/签证专业意见的工具。你的作用是帮助用户整理信息、发现问题、形成下一步申请规划。",
].join("\n");

export class DeepSeekRagError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "DeepSeekRagError";
    this.statusCode = statusCode;
  }
}

export function createDeepSeekRagService({ root, planning, activityPortfolio }) {
  async function answerQuestion({
    user,
    question,
    historySummary = "",
    env = process.env,
    deepSeekFetch = fetch,
  }) {
    const normalizedQuestion = normalizeQuestion(question);
    const normalizedHistorySummary = normalizeHistorySummary(historySummary);
    const apiKey = resolveApiKey({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new DeepSeekRagError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const profile = planning.getProfile(user);
    const portfolio = activityPortfolio.getPortfolio(user);
    const missingFields = buildMissingFieldChecklist({ profile, portfolio });
    const documents = await buildRagDocuments({
      root,
      user,
      planning,
      activityPortfolio,
      profile,
      portfolio,
    });
    const intentProfile = analyzeQuestionIntent(normalizedQuestion);
    const weightedSelected = selectRelevantDocuments(documents, normalizedQuestion, intentProfile);
    const context = buildContext(weightedSelected);
    const model = env.DEEPSEEK_RAG_MODEL || env.DEEPSEEK_MODEL || "deepseek-v4-pro";

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
            content: buildUserMessage(
              normalizedQuestion,
              context,
              normalizedHistorySummary,
              missingFields,
              intentProfile,
            ),
          },
        ],
        thinking: { type: "disabled" },
        stream: false,
        temperature: 0.25,
      }),
    });

    const data = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      throw new DeepSeekRagError(data.error?.message || "DeepSeek RAG 调用失败。", apiResponse.status);
    }

    const answer = extractDeepSeekResponseText(data);
    if (!answer) throw new DeepSeekRagError("DeepSeek 未返回可解析的问答内容。", 502);

    return {
      answer,
      sources: weightedSelected.map(serializeSource),
      missingFields,
      retrieval: {
        totalDocuments: documents.length,
        selectedDocuments: weightedSelected.length,
        intent: intentProfile.intent,
        intentReason: intentProfile.reason,
        sourceWeights: intentProfile.sourceWeights,
      },
    };
  }

  return {
    answerQuestion,
  };
}

async function buildRagDocuments({
  root,
  user,
  planning,
  activityPortfolio,
  profile = planning.getProfile(user),
  portfolio = activityPortfolio.getPortfolio(user),
}) {
  return [
    ...buildStudentDocuments({ user, planning, profile, portfolio }),
    ...(await buildMarkdownDocuments(root, RESOURCE_LIBRARY_FILES, "resource-library")),
    ...(await buildMarkdownDocuments(root, SCHOOL_ENCYCLOPEDIA_FILES, "school-encyclopedia")),
  ].filter((document) => document.text.trim());
}

function buildStudentDocuments({ user, planning, profile, portfolio }) {
  const documents = [];
  addJsonDocument(documents, {
    type: "student-backup",
    title: "学生备份：基础信息",
    data: profile,
  });

  addJsonDocument(documents, {
    type: "application-portfolio",
    title: "个人申请档案：选校、活动、竞赛、夏校、推荐信、成绩",
    data: summarizeApplicationPortfolio(portfolio),
  });

  for (const backup of planning.listRagBackups(user)) {
    addJsonDocument(documents, {
      type: "student-backup",
      title:
        backup.sourceType === "snapshot"
          ? `学生备份：${backup.planName} / ${backup.note || "历史快照"}`
          : `学生备份：${backup.planName} / 当前方案`,
      data: backup,
    });
  }

  return documents;
}

function addJsonDocument(documents, { type, title, data }) {
  const text = typeof data === "string" ? data : stringifyForRag(data);
  if (!hasMeaningfulText(text)) return;
  documents.push({
    id: stableId(`${type}:${title}`),
    type,
    title,
    text,
  });
}

function summarizeApplicationPortfolio(portfolio = {}) {
  const sections = [];
  const applicationPlan = portfolio.applicationPlan || {};
  const planLines = Object.entries(applicationPlan).flatMap(([round, entries]) =>
    (Array.isArray(entries) ? entries : [])
      .filter(hasFilledField)
      .map((entry) => {
        const label = APPLICATION_ROUND_LABELS[round] || round.toUpperCase();
        return `- ${label}: ${joinParts([entry.school, entry.major], " / ")}`;
      }),
  );
  addTextSection(sections, "选校计划", planLines);

  addTextSection(
    sections,
    "课外活动",
    (portfolio.activities || []).filter(hasFilledField).map((activity) =>
      formatRecord(activity.activityName || "未命名活动", [
        ["类型", activity.type],
        ["时间", activity.timeStage],
        ["角色", activity.role],
        ["描述", activity.description],
        ["成果", activity.outcome],
        ["证明链接", activity.proofLink],
        ["状态", activity.status],
      ]),
    ),
  );

  addTextSection(
    sections,
    "竞赛",
    (portfolio.competitions || []).filter(hasFilledField).map((competition) =>
      formatRecord(competition.competitionName || "未命名竞赛", [
        ["学科", competition.subject],
        ["年级/年份", competition.yearGrade],
        ["奖项", competition.award],
        ["贡献", competition.contribution],
        ["证明链接", competition.proofLink],
        ["状态", competition.status],
      ]),
    ),
  );

  addTextSection(
    sections,
    "夏校",
    (portfolio.summerSchools || []).filter(hasFilledField).map((program) =>
      formatRecord(program.programName || "未命名夏校", [
        ["主办方", program.organizer],
        ["方向", program.direction],
        ["参与时间", program.participationTime],
        ["状态", program.status],
        ["产出", program.output],
        ["证明链接", program.proofLink],
      ]),
    ),
  );

  const recommendationLetters = portfolio.recommendationLetters || {};
  addTextSection(sections, "推荐信", [
    recommendationLetters.counselorStatus ? `- Counselor: ${recommendationLetters.counselorStatus}` : "",
    formatNestedRecord("Teacher 1", recommendationLetters.teacher1),
    formatNestedRecord("Teacher 2", recommendationLetters.teacher2),
    formatNestedRecord("校外推荐人", recommendationLetters.outsideRecommender),
    recommendationLetters.preparedMaterials?.length
      ? `- 已准备材料: ${recommendationLetters.preparedMaterials.join("、")}`
      : "",
    recommendationLetters.notes ? `- 备注: ${recommendationLetters.notes}` : "",
  ]);

  const academicRecords = portfolio.academicRecords || {};
  addTextSection(sections, "成绩档案", [
    academicRecords.gpaScale ? `- GPA 制度: ${academicRecords.gpaScale}` : "",
    ...(academicRecords.gpaRecords || [])
      .filter((record) => record.gpa)
      .map((record) => `- GPA: ${joinParts([record.gradeLevel, record.term, record.gpa], " / ")}`),
    ...(academicRecords.satTests || [])
      .filter(hasFilledField)
      .map((test) =>
        formatRecord("SAT", [
          ["总分", test.totalScore],
          ["阅读写作", test.englishScore],
          ["数学", test.mathScore],
          ["考试日期", test.testDate],
        ]),
      ),
    ...(academicRecords.apExams || [])
      .filter(hasFilledField)
      .map((exam) => `- AP: ${joinParts([exam.courseName, exam.score, exam.examYear], " / ")}`),
  ]);

  addTextSection(
    sections,
    "DeepSeek 行动清单",
    (portfolio.planningActions || []).filter(hasFilledField).map((action) =>
      formatRecord(action.text || "未命名行动", [["来源", action.source]]),
    ),
  );

  addTextSection(
    sections,
    "DeepSeek 保存摘录",
    (portfolio.deepSeekNotes || []).filter(hasFilledField).map((note) =>
      formatRecord(note.title || "DeepSeek 摘录", [
        ["内容", note.content],
        ["来源", note.source],
      ]),
    ),
  );

  return sections.join("\n\n");
}

function buildMissingFieldChecklist({ profile = {}, portfolio = {} }) {
  const missing = [];
  if (!hasFilledField(profile)) missing.push("学生基础信息");
  if (!hasFilledApplicationPlan(portfolio.applicationPlan)) missing.push("选校计划");
  if (!(portfolio.activities || []).some(hasFilledField)) missing.push("课外活动记录");
  if (!(portfolio.competitions || []).some(hasFilledField)) missing.push("竞赛/奖项记录");
  if (!(portfolio.summerSchools || []).some(hasFilledField)) missing.push("夏校/项目经历");
  if (!hasFilledField(portfolio.recommendationLetters || {})) missing.push("推荐信准备");
  if (!hasFilledAcademicRecords(portfolio.academicRecords || {})) missing.push("GPA/SAT/AP 成绩档案");
  return missing;
}

function hasFilledApplicationPlan(applicationPlan = {}) {
  return Object.values(applicationPlan).some((entries) =>
    Array.isArray(entries) && entries.some(hasFilledField),
  );
}

function hasFilledAcademicRecords(academicRecords = {}) {
  return Boolean(
    cleanText(academicRecords.gpaScale)
      || (academicRecords.gpaRecords || []).some((record) => cleanText(record.gpa))
      || (academicRecords.satTests || []).some(hasFilledField)
      || (academicRecords.apExams || []).some(hasFilledField),
  );
}

function addTextSection(sections, title, lines) {
  const filtered = lines.filter(Boolean);
  if (!filtered.length) return;
  sections.push([`## ${title}`, ...filtered].join("\n"));
}

function formatRecord(title, fields) {
  const detail = fields
    .map(([label, value]) => (cleanText(value) ? `${label}: ${cleanText(value)}` : ""))
    .filter(Boolean)
    .join("；");
  return detail ? `- ${title}：${detail}` : "";
}

function formatNestedRecord(title, value) {
  if (!value || !hasFilledField(value)) return "";
  return formatRecord(
    title,
    Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? entry.join("、") : entry]),
  );
}

function joinParts(parts, separator) {
  return parts.map(cleanText).filter(Boolean).join(separator);
}

function hasFilledField(value) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => {
    if (Array.isArray(entry)) return entry.some((item) => cleanText(item));
    if (entry && typeof entry === "object") return hasFilledField(entry);
    return Boolean(cleanText(entry));
  });
}

function cleanText(value) {
  return String(value ?? "").trim();
}

async function buildMarkdownDocuments(root, files, type) {
  const documents = [];
  for (const entry of files) {
    const text = await readFile(join(root, "data", entry.file), "utf8");
    const chunks = splitMarkdownIntoChunks(text);
    chunks.forEach((chunk, index) => {
      const heading = getChunkHeading(chunk);
      documents.push({
        id: stableId(`${type}:${entry.file}:${index}:${heading}`),
        type,
        title: `${SOURCE_TYPE_LABELS[type]}：${entry.label}${heading ? ` / ${heading}` : ""}`,
        text: chunk.trim(),
      });
    });
  }
  return documents;
}

function splitMarkdownIntoChunks(text) {
  const sections = text
    .replace(/\r\n/g, "\n")
    .split(/\n(?=#{2,4}\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);
  return sections.flatMap((section) => splitLongSection(section));
}

function splitLongSection(section) {
  if (section.length <= MAX_CHUNK_CHARS) return [section];
  const chunks = [];
  const lines = section.split("\n");
  let current = "";
  for (const line of lines) {
    if (current && `${current}\n${line}`.length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) chunks.push(current);
  return chunks;
}

function getChunkHeading(chunk) {
  const heading = chunk.match(/^#{1,6}\s+(.+)$/m)?.[1] || "";
  return heading.replace(/\*+/g, "").trim().slice(0, 90);
}

function analyzeQuestionIntent(question) {
  const normalized = normalizeSearchText(question);
  const hasAny = (patterns) => patterns.some((pattern) => normalized.includes(pattern));
  if (hasAny(["选校", "院校", "学校", "ed", "ea", "rd", "uc", "rea", "match", "mit", "college", "university"])) {
    return intentProfile("school", "问题包含院校、轮次或具体学校信号。", {
      "student-backup": 1.3,
      "application-portfolio": 1.6,
      "resource-library": 0.9,
      "school-encyclopedia": 3.4,
    });
  }
  if (hasAny(["竞赛", "夏校", "科研", "项目", "polygence", "活动", "resource", "competition", "summer"])) {
    return intentProfile("resource", "问题包含项目、竞赛、夏校或活动资源信号。", {
      "student-backup": 1.3,
      "application-portfolio": 1.7,
      "resource-library": 3.3,
      "school-encyclopedia": 1.2,
    });
  }
  if (hasAny(["推荐信", "推荐人", "素材", "counselor", "teacher", "recommendation"])) {
    return intentProfile("recommendation", "问题包含推荐信或推荐人材料信号。", {
      "student-backup": 2.2,
      "application-portfolio": 3.1,
      "resource-library": 1.0,
      "school-encyclopedia": 1.5,
    });
  }
  if (hasAny(["gpa", "sat", "ap", "课程", "成绩", "标化", "academic"])) {
    return intentProfile("academic", "问题包含成绩、课程或标化信号。", {
      "student-backup": 2.1,
      "application-portfolio": 3.0,
      "resource-library": 1.1,
      "school-encyclopedia": 1.7,
    });
  }
  return intentProfile("general", "未识别到强意图，采用均衡检索。", {
    "student-backup": 1.6,
    "application-portfolio": 1.8,
    "resource-library": 1.4,
    "school-encyclopedia": 1.4,
  });
}

function intentProfile(intent, reason, sourceWeights) {
  return { intent, reason, sourceWeights };
}

function selectRelevantDocuments(documents, question, intentProfile = analyzeQuestionIntent(question)) {
  const queryTokens = tokenize(question);
  const scored = documents
    .map((document, index) => ({
      ...document,
      index,
      score: scoreDocument(document, queryTokens, question, intentProfile),
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = new Map();
  for (const document of ensureBaselineContext(documents, scored, intentProfile)) {
    selected.set(document.id, document);
  }
  for (const document of scored) {
    if (selected.size >= MAX_SELECTED_CHUNKS) break;
    selected.set(document.id, document);
  }

  return [...selected.values()]
    .sort((left, right) => right.score - left.score || sourcePriority(left.type, intentProfile) - sourcePriority(right.type, intentProfile))
    .slice(0, MAX_SELECTED_CHUNKS);
}

function ensureBaselineContext(documents, scored, intentProfile) {
  const portfolio =
    scored.find((document) => document.type === "application-portfolio")
    || documents
      .filter((document) => document.type === "application-portfolio")
      .map((document) => ({ ...document, score: 0.3 }))[0];
  const studentScored = scored.filter((document) => document.type === "student-backup");
  const studentDocuments = studentScored.length
    ? studentScored.slice(0, 3)
    : documents
        .filter((document) => document.type === "student-backup")
        .slice(0, 2)
        .map((document) => ({ ...document, score: 0.1 }));
  const school =
    scored.find((document) => document.type === "school-encyclopedia")
    || documents
      .filter((document) => document.type === "school-encyclopedia")
      .map((document) => ({ ...document, score: 0.1 }))[0];
  const resource =
    scored.find((document) => document.type === "resource-library")
    || documents
      .filter((document) => document.type === "resource-library")
      .map((document) => ({ ...document, score: intentProfile.sourceWeights["resource-library"] || 0.1 }))[0];
  const baselines = [portfolio, ...studentDocuments, school, resource].filter(Boolean);
  return baselines.sort((left, right) => sourcePriority(left.type, intentProfile) - sourcePriority(right.type, intentProfile));
}

function scoreDocument(document, queryTokens, question, intentProfile) {
  const searchable = normalizeSearchText(`${document.title}\n${document.text}`);
  const title = normalizeSearchText(document.title);
  const sourceWeight = intentProfile.sourceWeights[document.type] || 1;
  let score = sourceWeight;
  for (const token of queryTokens) {
    if (!token) continue;
    if (searchable.includes(token)) score += (token.length >= 4 ? 3 : 1) * sourceWeight;
    if (title.includes(token)) score += 2 * sourceWeight;
  }
  const normalizedQuestion = normalizeSearchText(question);
  if (normalizedQuestion && searchable.includes(normalizedQuestion)) score += 8;
  return score;
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

function buildContext(selected) {
  const sections = [];
  let totalChars = 0;
  for (const [index, source] of selected.entries()) {
    const block = [
      `[${index + 1}] ${SOURCE_TYPE_LABELS[source.type]} | ${source.title}`,
      source.text.trim(),
    ].join("\n");
    if (totalChars + block.length > MAX_CONTEXT_CHARS) break;
    sections.push(block);
    totalChars += block.length;
  }
  return sections.join("\n\n---\n\n");
}

function buildUserMessage(question, context, historySummary, missingFields = [], intentProfile = analyzeQuestionIntent(question)) {
  return [
    `问题：${question}`,
    "",
    `问题意图：${intentProfile.intent}`,
    `意图判断依据：${intentProfile.reason}`,
    `检索权重：${JSON.stringify(intentProfile.sourceWeights)}`,
    "",
    "对话记忆摘要：",
    historySummary || "暂无上一轮对话记忆。",
    "",
    "可用资料范围：学生备份、个人申请档案、资源库、院校百科。",
    "请先判断资料是否足以回答；不要在正文末尾列出参考资料，检索来源会由页面的“参考资料”下拉区展示。",
    missingFields.length
      ? `当前资料缺失字段清单：${missingFields.join("、")}。如果这些字段会影响判断，请在回答中明确提示需要补充。`
      : "当前资料缺失字段清单：未发现明显缺失项。",
    "",
    "检索到的资料片段：",
    context || "未检索到高相关资料。请说明当前资料不足，并建议用户补充信息。",
  ].join("\n");
}

function serializeSource(source) {
  return {
    id: source.id,
    type: source.type,
    typeLabel: SOURCE_TYPE_LABELS[source.type] || source.type,
    title: source.title,
    snippet: formatSourceSnippet(source.text),
  };
}

function formatSourceSnippet(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, SOURCE_SNIPPET_CHARS);
}

function normalizeQuestion(value) {
  const question = String(value ?? "").trim();
  if (!question) throw new DeepSeekRagError("请输入要咨询 DeepSeek 的问题。", 400);
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new DeepSeekRagError(`问题不能超过 ${MAX_QUESTION_LENGTH} 个字符。`, 400);
  }
  return question;
}

function normalizeHistorySummary(value) {
  return String(value ?? "").trim().slice(0, MAX_HISTORY_SUMMARY_LENGTH);
}

function extractDeepSeekResponseText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function stringifyForRag(data) {
  return JSON.stringify(data, null, 2);
}

function hasMeaningfulText(text) {
  return /[A-Za-z0-9\p{Script=Han}]/u.test(text);
}

function stableId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `rag-${hash.toString(36)}`;
}

function sourcePriority(type, intentProfile = analyzeQuestionIntent("")) {
  const priority = {
    "student-backup": 0,
    "application-portfolio": 1,
    "resource-library": 2,
    "school-encyclopedia": 3,
  }[type] ?? 9;
  const weight = intentProfile.sourceWeights[type] || 1;
  return priority - weight;
}
