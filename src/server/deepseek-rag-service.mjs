import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveApiKey } from "./api-key.mjs";

const MAX_QUESTION_LENGTH = 1200;
const MAX_SELECTED_CHUNKS = 14;
const MAX_CONTEXT_CHARS = 18_000;
const MAX_CHUNK_CHARS = 2_200;
const SOURCE_SNIPPET_CHARS = 260;

const RESOURCE_LIBRARY_FILES = [
  { file: "competitions.md", label: "竞赛库" },
  { file: "summer-schools.md", label: "夏校库" },
  { file: "research-projects.md", label: "实习/科研库" },
];

const SCHOOL_ENCYCLOPEDIA_FILES = [
  { file: "schools.md", label: "综合大学与文理学院" },
  { file: "international-schools.md", label: "英港澳加新院校" },
  { file: "other-region-schools.md", label: "其他地区院校" },
];

const SOURCE_TYPE_LABELS = {
  "student-backup": "学生备份",
  "resource-library": "资源库",
  "school-encyclopedia": "院校百科",
};

const SYSTEM_PROMPT = [
  "你是 US College Compass 的 DeepSeek RAG 问答助手。",
  "你只能基于用户问题和提供的检索资料回答，不要凭空编造项目、院校政策、申请要求或学生经历。",
  "如果资料不足，请明确说明缺少哪些证据，并给出下一步核验建议。",
  "涉及项目资格、申请截止日期、费用、院校政策和录取要求时，必须提醒用户以申请年度官方信息为准。",
  "回答应面向学生和家长，中文为主，结构清晰、务实、低销售感。",
].join("\n");

export class DeepSeekRagError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "DeepSeekRagError";
    this.statusCode = statusCode;
  }
}

export function createDeepSeekRagService({ root, planning, activityPortfolio }) {
  async function answerQuestion({ user, question, env = process.env, deepSeekFetch = fetch }) {
    const normalizedQuestion = normalizeQuestion(question);
    const apiKey = resolveApiKey({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new DeepSeekRagError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const documents = await buildRagDocuments({ root, user, planning, activityPortfolio });
    const selected = selectRelevantDocuments(documents, normalizedQuestion);
    const context = buildContext(selected);
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
          { role: "user", content: buildUserMessage(normalizedQuestion, context) },
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
      sources: selected.map(serializeSource),
      retrieval: {
        totalDocuments: documents.length,
        selectedDocuments: selected.length,
      },
    };
  }

  return {
    answerQuestion,
  };
}

async function buildRagDocuments({ root, user, planning, activityPortfolio }) {
  return [
    ...buildStudentDocuments({ user, planning, activityPortfolio }),
    ...(await buildMarkdownDocuments(root, RESOURCE_LIBRARY_FILES, "resource-library")),
    ...(await buildMarkdownDocuments(root, SCHOOL_ENCYCLOPEDIA_FILES, "school-encyclopedia")),
  ].filter((document) => document.text.trim());
}

function buildStudentDocuments({ user, planning, activityPortfolio }) {
  const documents = [];
  const profile = planning.getProfile(user);
  addJsonDocument(documents, {
    type: "student-backup",
    title: "学生备份：基础信息",
    data: profile,
  });

  addJsonDocument(documents, {
    type: "student-backup",
    title: "学生备份：我的申请档案",
    data: activityPortfolio.getPortfolio(user),
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
  const text = stringifyForRag(data);
  if (!hasMeaningfulText(text)) return;
  documents.push({
    id: stableId(`${type}:${title}`),
    type,
    title,
    text,
  });
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

function selectRelevantDocuments(documents, question) {
  const queryTokens = tokenize(question);
  const scored = documents
    .map((document, index) => ({
      ...document,
      index,
      score: scoreDocument(document, queryTokens, question),
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = new Map();
  for (const document of scored.slice(0, MAX_SELECTED_CHUNKS)) {
    selected.set(document.id, document);
  }

  for (const document of ensureStudentContext(documents, scored)) {
    selected.set(document.id, document);
  }

  return [...selected.values()]
    .sort((left, right) => right.score - left.score || sourcePriority(left.type) - sourcePriority(right.type))
    .slice(0, MAX_SELECTED_CHUNKS);
}

function ensureStudentContext(documents, scored) {
  const studentScored = scored.filter((document) => document.type === "student-backup");
  if (studentScored.length) return studentScored.slice(0, 3);
  return documents
    .filter((document) => document.type === "student-backup")
    .slice(0, 2)
    .map((document) => ({ ...document, score: 0.1 }));
}

function scoreDocument(document, queryTokens, question) {
  const searchable = normalizeSearchText(`${document.title}\n${document.text}`);
  const title = normalizeSearchText(document.title);
  let score = document.type === "student-backup" ? 0.2 : 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (searchable.includes(token)) score += token.length >= 4 ? 3 : 1;
    if (title.includes(token)) score += 2;
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

function buildUserMessage(question, context) {
  return [
    `问题：${question}`,
    "",
    "可用资料范围：学生备份、资源库、院校百科。",
    "请先判断资料是否足以回答；回答末尾用“参考资料”列出你实际使用的资料编号。",
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
    snippet: source.text.replace(/\s+/g, " ").trim().slice(0, SOURCE_SNIPPET_CHARS),
  };
}

function normalizeQuestion(value) {
  const question = String(value ?? "").trim();
  if (!question) throw new DeepSeekRagError("请输入要咨询 DeepSeek 的问题。", 400);
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new DeepSeekRagError(`问题不能超过 ${MAX_QUESTION_LENGTH} 个字符。`, 400);
  }
  return question;
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

function sourcePriority(type) {
  return {
    "student-backup": 0,
    "resource-library": 1,
    "school-encyclopedia": 2,
  }[type] ?? 9;
}
