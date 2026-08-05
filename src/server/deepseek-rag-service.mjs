import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Document } from "@langchain/core/documents";
import { resolveApiKey } from "./api-key.mjs";
import {
  AI_QUALITY_VERSIONS,
  evaluateAiAnswerQuality,
  getExpectedRagSourceTypes,
  getRagPromptVersion,
} from "./ai-quality.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";
import {
  RAG_ANSWER_GRAPH_VERSION,
  createRagAnswerGraph,
} from "./langgraph-rag-workflow.mjs";
import {
  LangChainLlmError,
  createLangChainDeepSeekClient,
} from "./langchain-llm-client.mjs";
import { monotonicNowMs } from "./observability.mjs";
import { withSpan } from "./production-observability.ts";
import { createStaticAdmissionsKnowledgeGraphAdapter } from "./admissions-knowledge-graph-adapter.mjs";
import { createRetrievalOrchestrator } from "./retrieval-orchestrator.mjs";
import { splitMarkdownIntoStructuredChunks } from "../infrastructure/markdown-ingestion.ts";
import {
  RETRIEVAL_RELEVANCE_POLICY_VERSION,
  selectRelevantEvidence,
} from "../domain/retrieval-relevance.mjs";

const MAX_QUESTION_LENGTH = 1200;
const MAX_HISTORY_SUMMARY_LENGTH = 1800;
const KNOWLEDGE_DOCUMENT_LIMIT = 8;
const PERSONALIZED_KNOWLEDGE_DOCUMENT_LIMIT = 6;
const PERSONAL_DOCUMENT_LIMIT = 3;
const MAX_PERSONAL_SOURCE_CHARS = 6_000;
const MAX_CONTEXT_CHARS = 18_000;
const MAX_CHUNK_CHARS = 2_200;
const SOURCE_SNIPPET_CHARS = 260;
const DEFAULT_INSPIRATION_MAX_TOKENS = 600;
const DEFAULT_RAG_MAX_TOKENS = 1_200;
const DEFAULT_MAJOR_MATCH_MAX_TOKENS = 2_200;
const DEFAULT_INSPIRATION_TIMEOUT_MS = 60_000;
const DEFAULT_RAG_TIMEOUT_MS = 90_000;
const DEFAULT_MAJOR_MATCH_TIMEOUT_MS = 90_000;
const DEFAULT_AI_CALL_MAX_ATTEMPTS = 1;
const DEFAULT_RAG_MAX_ANSWER_CHARS = 12_000;
const RAG_ANSWER_TRUNCATION_NOTICE = "\n\n> 回答已达到长度上限。建议缩小问题范围后继续追问。";

const RESOURCE_LIBRARY_FILES = [
  { file: "competitions.md", label: "竞赛库" },
  { file: "summer-schools.md", label: "夏校库" },
  { file: "research-projects.md", label: "实习/科研库" },
  { file: "extracurricular-activities.md", label: "课外活动库" },
  { file: "international-journals.md", label: "国际期刊汇总" },
];

const SCHOOL_ENCYCLOPEDIA_FILES = [
  { file: "schools.md", label: "综合大学与文理学院" },
  { file: "international-schools.md", label: "英港澳加新院校" },
  { file: "other-region-schools.md", label: "其他地区院校" },
];

const MAJOR_ENCYCLOPEDIA_FILES = [
  { file: "majors.md", label: "美国本科可申请专业汇总" },
];

const SOURCE_TYPE_LABELS = {
  "student-backup": "学生备份",
  "application-portfolio": "个人申请档案",
  "resource-library": "资源库",
  "school-encyclopedia": "院校百科",
  "major-encyclopedia": "专业百科",
};

const PERSONAL_SOURCE_TYPES = new Set(["student-backup", "application-portfolio"]);
const RETRIEVAL_STOP_PHRASES = [
  "请根据", "申请档案", "自动匹配", "美国本科", "输出", "核心结论",
  "推荐专业优先级表", "下一步行动",
  "how", "should", "this", "that", "the", "and", "or", "for", "with", "from",
  "student", "students", "compare", "comparison", "resource", "resources",
  "please", "help", "what", "which", "use", "next", "prioritize", "application",
  "recommendation", "recommendations", "letter", "letters", "requirement", "requirements",
  "推荐信要求", "是什么",
];
const RETRIEVAL_STOP_TOKENS = new Set(RETRIEVAL_STOP_PHRASES.flatMap(tokenizeRaw));

const APPLICATION_ROUND_LABELS = {
  rea: "REA",
  ed1: "ED1",
  ed2: "ED2",
  ea: "EA",
  uc: "UC",
  rd: "RD",
  multiCountry: "多国联申",
};

const SYSTEM_PROMPT = [
  "你是 US College Compass 的“申请机器人”，服务对象是正在准备美本申请的学生和家长。你的任务是基于系统提供的 RAG 资料，帮助用户分析个人申请档案、学生背景、活动规划、资源库项目和院校百科信息，并给出清晰、务实、可执行的建议。",
  "",
  "你可以使用的资料范围包括：",
  "1. 个人申请档案：选校计划、课外活动、竞赛、夏校、推荐信、GPA/SAT/AP 等成绩档案。",
  "2. 学生备份：学生基础背景、历史规划版本、活动方案和保存快照。",
  "3. 资料库：竞赛、夏校、科研/实习、课外活动素材、国际期刊汇总、项目资源等内容。",
  "4. 院校百科：院校申请要求、热门专业、学校风格、录取偏好、文书与推荐信要求等信息。",
  "5. 专业百科：美国本科专业开设核验、专业介绍、常见学习内容、就业方向、专业强校、录取难度和申请检索口径。",
  "",
  "回答规则：",
  "- 必须优先基于提供的 RAG 资料回答，不要凭空编造学生经历、项目细节、院校政策、录取概率或申请要求。",
  "- 如果资料不足，要明确说明“当前资料不足以判断”，并告诉用户需要补充哪些信息。",
  "- 如果用户询问选校、专业、活动、竞赛、夏校、推荐信或申请策略，必须结合“个人申请档案”和“学生备份”判断学生当前状态，再参考资料库、院校百科和专业百科给建议。",
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
  "篇幅控制：先给 1-2 句结论，再给最多 4 个要点和 1 个下一步；默认控制在 700 个中文字符以内。只保留与当前问题直接相关的证据，不重复复述资料，不输出冗长背景、过程性思考或参考资料清单。",
].join("\n");

const INSPIRATION_SYSTEM_PROMPT = [
  "你是 US College Compass 的“启发性机器人”，是一位温暖、耐心、不过度推断的知心大姐姐式学生探索伙伴。你的任务不是判断学生真正热爱什么，也不是直接规划竞赛和活动，而是基于学生真实的历史对话，发现几个可能感兴趣的方向，通过多轮追问帮助学生自主判断，最终形成一个由学生确认、值得继续探索的问题和一次可以亲自完成的小行动。",
  "",
  "完整交互流程：",
  "1. 读取历史对话并寻找线索：只关注学生反复提到的事情、描述特别具体的经历、主动投入时间精力的事情、表达过的价值观，以及想法中的变化或矛盾。只能使用已经出现的事实，不能编造经历或做过度心理分析。",
  "2. 提出多个可能方向：当历史信息足够时，用“根据你之前提到的这些经历，我发现了几个你可能感兴趣的方向”开头，并列呈现 2-4 个方向。每个方向都必须分别写清“历史对话事实依据”和“待验证的可能性”，明确这不是热爱标签。",
  "3. 把选择权交给学生：不要替学生排序，不要按申请价值替学生决定。列出方向后只问一个问题：“这几个方向中，你想先探索哪一个？”",
  "4. 基于事实逐步追问：学生选择后，每轮只提出一个关键问题。问题应围绕具体经历，例如“哪段经历让你开始关注它？”“你最喜欢其中的哪一部分？”“为什么这件事对你重要？”“它与你重视的事情有什么联系？”“关于这个方向，你最想弄明白什么？”。如果学生回答“不知道”，回到他已经讲过的具体事实继续追问，不要凭空推断。",
  "5. 形成探索问题：在多轮追问后，提出一个能区分不同动机或兴趣形态的暂定探索问题，并明确这是根据哪些事实形成的。这个问题必须得到学生明确确认或修正，不能由你单方面决定。",
  "6. 设计一次小行动：只有探索问题得到学生确认后，才共同形成一个门槛低、时间范围明确、能真实接触该方向、完成后能产生新认识、且可以由学生亲自完成的小行动。这个行动不是为了包装申请履历。",
  "7. 行动后回顾：学生完成行动后，继续一次只问一个反思问题，依次帮助他看见哪个部分最吸引、哪个部分与想象不同、是否还愿意投入，以及原来的探索问题是否需要变化。让兴趣在“对话—行动—反思”循环中逐步得到验证。",
  "",
  "必须遵守的原则：",
  "- 把学生说过的话与 AI 推断明确分开；每个推断都引用历史记录中的具体依据，并使用“可能”“值得探索”等措辞。",
  "- 不替学生选择兴趣方向，不把兴趣强行包装成申请故事，也不为了申请而安排竞赛、活动或履历项目。",
  "- 如果个人兴趣与申请现实存在冲突，同时呈现兴趣线索、申请现实和选择风险，把最终选择权交给学生。",
  "- 每个阶段的结论都由学生确认。每轮结束时只留下一个需要学生回答的问题，或者在学生已确认探索问题后留下一个具体小行动；不要一次抛出多个问题。",
  "- 没有足够历史对话时，坦诚说明目前还不能列出有依据的方向，然后只邀请学生讲一个最近主动投入、描述具体或想法发生变化的真实经历。",
  "- 不虚构用户经历、情绪、家庭关系或心理状态，不做心理诊断，不操纵、不说教，也不使用羞耻、恐惧或录取焦虑迫使用户接受某个方向。",
  "- 涉及截止日期、费用、资格、官方政策、申请要求或录取规则时，提醒用户以申请年度官网信息为准，不做绝对化录取承诺。",
  "- 以中文为主，温和、真诚、简洁，像一位善于倾听的知心大姐姐，但不要假装自己是真人。",
  "- 除了需要并列呈现 2-4 个待验证方向的阶段，回复通常控制在 300 个中文字符以内；避免重复复述规则、写成长篇报告或一次给出多个问题。",
  "- 你只能依据用户当前输入和系统提供的对话记忆摘要展开对话；不要假设你读取过学生档案、申请资料、外部知识库或其他未提供的信息。",
  "- 对话的成功标准不是输出“你适合什么”，而是帮助学生形成一个自己认可的探索问题、一次小行动和行动后的反思问题。",
  "- 篇幅控制：除非正在并列呈现 2-4 个待验证方向，否则每轮控制在 300 个中文字符以内；每次只问一个关键问题，避免重复、长篇总结和一次输出多个问题。",
].join("\n");

const MAJOR_MATCH_SYSTEM_PROMPT = [
  "你是 US College Compass 的美本本科专业匹配顾问。你的任务是基于用户的申请档案、学生背景、活动记录、专业百科 RAG、资源库和院校百科信息，为学生匹配适合探索的美国本科专业方向。",
  "",
  "你的回答对象是学生和家长，语气要专业、清晰、务实，避免营销化表达。不要虚构学生经历、奖项、活动、成绩、科研、学校偏好或录取结果；如果档案信息不足，要明确指出缺口，并说明这些缺口会如何影响专业判断，但不要因为信息不完整就直接停止匹配。",
  "",
  "匹配时请综合判断以下维度：",
  "1. 学术基础：课程体系、GPA、标化、AP/IB/A-Level/竞赛表现。",
  "2. 兴趣主线：学生已有活动、科研、项目、写作、服务、职业兴趣。",
  "3. 专业适配：专业学习内容、常见能力要求、就业/深造方向、申请叙事可塑性。",
  "4. 证据强度：当前档案能否支撑该专业，哪些证据仍需补强。",
  "5. 申请风险：是否容易显得跨度过大、证据不足、方向过泛或与活动不一致。",
  "",
  "回答必须使用中文。不要输出资料来源清单、来源编号、文献列表、英文搜索词、英文 query 或任何“检索口径”类栏目。不要把 RAG 检索来源单独列出来；只需把判断吸收到分析和建议中。",
  "",
  "请按以下结构输出：",
  "",
  "## 核心结论",
  "用 1-2 段说明学生最适合的专业主线，以及为什么不是泛泛推荐热门专业。",
  "",
  "## 推荐专业优先级表",
  "用表格输出，列名固定为：",
  "专业方向｜优先级｜匹配理由｜需要补强的证据｜申请叙事切入点",
  "",
  "优先级使用：高 / 中 / 谨慎探索。",
  "每个单元格保持简洁，避免长段堆砌。",
  "",
  "## 不建议优先选择的方向",
  "列出当前不建议作为主申方向的专业或方向，并说明原因。不要武断否定，只说明当前证据不足、叙事不顺或申请风险较高。",
  "",
  "## 下一步行动",
  "给出 3-5 条具体行动建议，优先围绕课程、活动、科研、竞赛、推荐信、文书叙事和选校专业归属核验展开。",
  "",
  "信息不足时，不要直接停止判断。只要活动、竞赛、夏校、AP 课程中任一类有信息，就必须根据现有信息给出暂定专业匹配判断，并标注判断依据和不确定性；此时不得提示“信息不足”或“档案信息缺口”。只有活动、竞赛、夏校、AP 课程四类全部为空，且完全无法判断时，才输出“档案信息缺口”并请用户补充。",
].join("\n");

export class DeepSeekRagError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "DeepSeekRagError";
    this.statusCode = statusCode;
  }
}

export function createDeepSeekRagService({
  root,
  planning,
  activityPortfolio,
  llmClient = createLangChainDeepSeekClient(),
  metrics = null,
  retriever = null,
  knowledgeGraph = null,
  retrievalOrchestrator = null,
  logger = null,
  ragAnswerGraph = null,
}) {
  const documentRetriever = retriever || createRagRetriever({ root, planning, activityPortfolio, metrics });
  const graphAdapter = knowledgeGraph || createStaticAdmissionsKnowledgeGraphAdapter({
    root,
    planning,
    activityPortfolio,
  });
  const orchestratedRetriever = retrievalOrchestrator || createRetrievalOrchestrator({
    documentRetriever,
    knowledgeGraph: graphAdapter,
    logger,
  });
  const answerGraph = ragAnswerGraph || createRagAnswerGraph({
    retrieveSources: ({ user, question, historySummary, assistantProfile, usePersonalContext }) =>
      orchestratedRetriever.retrieve({ user, question, historySummary, assistantProfile, usePersonalContext }),
    draftAnswer: (state) => draftDeepSeekRagAnswer({ ...state, llmClient, metrics }),
    evaluateQuality: evaluateRagGraphQuality,
    metrics,
  });

  async function answerQuestion({
    user,
    question,
    historySummary = "",
    assistantProfile = "",
    usePersonalContext = false,
    env = process.env,
    signal,
    onToken,
  }) {
    const normalizedQuestion = normalizeQuestion(question);
    const normalizedHistorySummary = normalizeHistorySummary(historySummary);
    const isInspirationProfile = assistantProfile === "inspiration";
    const normalizedUsePersonalContext = assistantProfile === "major-match"
      || usePersonalContext === true;
    const apiKey = resolveApiKey({
      environmentApiKey: isInspirationProfile ? env.INSPIRATION_API_KEY : env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      const variableName = isInspirationProfile ? "INSPIRATION_API_KEY" : "DEEPSEEK_API_KEY";
      throw new DeepSeekRagError(`DeepSeek API 尚未配置。请在服务端配置 ${variableName}。`, 400);
    }

    const model = isInspirationProfile
      ? normalizeDeepSeekModel(env.INSPIRATION_MODEL, "doubao-seed-2-1-turbo-260628")
      : normalizeDeepSeekModel(env.DEEPSEEK_RAG_MODEL || env.DEEPSEEK_MODEL);
    if (isInspirationProfile) {
      return withSpan("deepseek.inspiration.invoke", { workflow: "direct-deepseek" }, () =>
        answerInspirationQuestion({
          question: normalizedQuestion,
          historySummary: normalizedHistorySummary,
          model,
          apiKey,
          baseURL: env.INSPIRATION_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
          fallbackModels: env.INSPIRATION_FALLBACK_MODEL || "",
          maxTokens: normalizePositiveInteger(env.INSPIRATION_MAX_TOKENS, DEFAULT_INSPIRATION_MAX_TOKENS),
          timeoutMs: normalizePositiveInteger(env.INSPIRATION_TIMEOUT_MS, DEFAULT_INSPIRATION_TIMEOUT_MS),
          maxAttempts: normalizePositiveInteger(
            env.INSPIRATION_CALL_MAX_ATTEMPTS,
            DEFAULT_AI_CALL_MAX_ATTEMPTS,
          ),
          env,
          llmClient,
          metrics,
          signal,
          onToken,
        }));
    }

    return withSpan("langgraph.rag.invoke", { workflow: RAG_ANSWER_GRAPH_VERSION }, () => answerGraph.invoke({
      user,
      question: normalizedQuestion,
      historySummary: normalizedHistorySummary,
      assistantProfile,
      usePersonalContext: normalizedUsePersonalContext,
      env,
      model,
      signal,
    }));
  }

  return {
    answerQuestion,
  };
}

async function answerInspirationQuestion({
  question,
  historySummary = "",
  model,
  apiKey,
  baseURL,
  fallbackModels = "",
  maxTokens = DEFAULT_INSPIRATION_MAX_TOKENS,
  timeoutMs = DEFAULT_INSPIRATION_TIMEOUT_MS,
  maxAttempts = DEFAULT_AI_CALL_MAX_ATTEMPTS,
  env = process.env,
  llmClient,
  metrics = null,
  signal,
  onToken,
}) {
  const llmResult = await invokeDeepSeekLlm({
    llmClient,
    metrics,
    env,
    feature: "deepseek-inspiration",
    apiKey,
    baseURL,
    model,
    temperature: 0.25,
    disableThinking: true,
    fallbackModels,
    maxTokens,
    timeoutMs,
    maxAttempts,
    messages: [
      { role: "system", content: INSPIRATION_SYSTEM_PROMPT },
      { role: "user", content: buildInspirationUserMessage(question, historySummary) },
    ],
    signal,
    onToken,
  });

  const answer = String(llmResult?.content || "").trim();
  if (!answer) throw new DeepSeekRagError("DeepSeek 未返回可解析的问答内容。", 502);

  return { answer };
}

async function draftDeepSeekRagAnswer({
  question,
  historySummary = "",
  assistantProfile = "",
  usePersonalContext = false,
  retrievalResult = {},
  model,
  env = process.env,
  llmClient,
  metrics = null,
  signal,
}) {
  const outputLimits = resolveRagOutputLimits({ assistantProfile, env });
  const callPolicy = resolveRagCallPolicy({ assistantProfile, env });
  const retrieval = retrievalResult.retrieval || {};
  const intentProfile = {
    intent: retrieval.intent,
    reason: retrieval.intentReason,
    sourceWeights: retrieval.sourceWeights,
    queryPlan: retrieval.queryPlan,
    graph: retrieval.graph,
  };

  const llmResult = await invokeDeepSeekLlm({
    llmClient,
    metrics,
    env,
    feature: "deepseek-rag",
    model,
    temperature: 0.25,
    maxTokens: outputLimits.maxTokens,
    timeoutMs: callPolicy.timeoutMs,
    maxAttempts: callPolicy.maxAttempts,
    messages: [
      { role: "system", content: selectSystemPrompt(assistantProfile, usePersonalContext) },
      {
        role: "user",
        content: buildUserMessage(
          question,
          retrievalResult.context,
          historySummary,
          retrievalResult.missingFields || [],
          intentProfile,
          usePersonalContext,
        ),
      },
    ],
    signal,
  });

  const rawAnswer = String(llmResult?.content || "").trim();
  if (!rawAnswer) throw new DeepSeekRagError("DeepSeek 未返回可解析的问答内容。", 502);
  const finishReason = getLlmFinishReason(llmResult);
  const boundedAnswer = enforceRagAnswerLength(rawAnswer, outputLimits.maxAnswerChars, { finishReason });
  return {
    answer: boundedAnswer.answer,
    outputDiagnostics: {
      originalCharacters: rawAnswer.length,
      returnedCharacters: boundedAnswer.answer.length,
      maxCharacters: outputLimits.maxAnswerChars,
      maxTokens: outputLimits.maxTokens,
      truncated: boundedAnswer.truncated,
      finishReason,
    },
  };
}

async function invokeDeepSeekLlm({
  llmClient,
  metrics,
  env,
  feature,
  apiKey = "",
  baseURL = "",
  model,
  temperature,
  disableThinking = true,
  fallbackModels,
  maxTokens,
  timeoutMs,
  maxAttempts,
  messages,
  signal,
  onToken,
}) {
  const startedAt = monotonicNowMs();
  try {
    const result = await llmClient.invoke({
      env,
      feature,
      apiKey,
      baseURL,
      model,
      temperature,
      disableThinking,
      fallbackModels,
      maxTokens,
      timeoutMs,
      maxAttempts,
      messages,
      signal,
      onToken,
    });
    metrics?.recordAiCall?.({
      feature,
      ok: true,
      statusCode: 200,
      durationMs: monotonicNowMs() - startedAt,
      ...getLlmUsageMetrics(result),
    });
    return result;
  } catch (error) {
    const mappedError = mapDeepSeekLlmError(error);
    metrics?.recordAiCall?.({
      feature,
      ok: false,
      statusCode: mappedError.statusCode || 0,
      durationMs: monotonicNowMs() - startedAt,
    });
    throw mappedError;
  }
}

function mapDeepSeekLlmError(error) {
  if (error instanceof DeepSeekRagError) return error;
  if (error instanceof LangChainLlmError) {
    return new DeepSeekRagError(error.message, error.statusCode || 502);
  }
  return new DeepSeekRagError(error?.message || "DeepSeek 调用失败。", error?.statusCode || 502);
}

function evaluateRagGraphQuality({
  answer,
  outputDiagnostics = {},
  assistantProfile = "",
  usePersonalContext = false,
  retrievalResult = {},
  model,
  workflowVersion = RAG_ANSWER_GRAPH_VERSION,
}) {
  const retrieval = retrievalResult.retrieval || {};
  return evaluateAiAnswerQuality({
    answer,
    outputDiagnostics,
    sources: retrievalResult.sources || [],
    expectedSourceTypes: getExpectedRagSourceTypes(retrieval.intent, {
      usePersonalContext,
      assistantProfile,
    }),
    metadata: {
      feature: "deepseek-rag",
      promptVersion: getRagPromptVersion(assistantProfile),
      model,
      sourceSetVersion: AI_QUALITY_VERSIONS.ragSourceSet,
      parserVersion: AI_QUALITY_VERSIONS.ragParser,
      extraMetadata: {
        workflowVersion,
      },
    },
  });
}

function resolveRagOutputLimits({ assistantProfile = "", env = process.env } = {}) {
  const majorMatch = assistantProfile === "major-match";
  return {
    maxTokens: normalizePositiveInteger(
      majorMatch ? env.DEEPSEEK_MAJOR_MATCH_MAX_TOKENS : env.DEEPSEEK_RAG_MAX_TOKENS,
      majorMatch ? DEFAULT_MAJOR_MATCH_MAX_TOKENS : DEFAULT_RAG_MAX_TOKENS,
    ),
    maxAnswerChars: normalizePositiveInteger(
      env.DEEPSEEK_RAG_MAX_ANSWER_CHARS,
      DEFAULT_RAG_MAX_ANSWER_CHARS,
    ),
  };
}

function resolveRagCallPolicy({ assistantProfile = "", env = process.env } = {}) {
  const majorMatch = assistantProfile === "major-match";
  return {
    timeoutMs: normalizePositiveInteger(
      majorMatch ? env.DEEPSEEK_MAJOR_MATCH_TIMEOUT_MS : env.DEEPSEEK_RAG_TIMEOUT_MS,
      majorMatch ? DEFAULT_MAJOR_MATCH_TIMEOUT_MS : DEFAULT_RAG_TIMEOUT_MS,
    ),
    maxAttempts: normalizePositiveInteger(
      env.DEEPSEEK_RAG_CALL_MAX_ATTEMPTS,
      DEFAULT_AI_CALL_MAX_ATTEMPTS,
    ),
  };
}

function enforceRagAnswerLength(answer, maxCharacters, { finishReason = "" } = {}) {
  const normalized = String(answer || "").trim();
  const providerLimited = String(finishReason || "").trim().toLowerCase() === "length";
  if (normalized.length <= maxCharacters && !providerLimited) {
    return { answer: normalized, truncated: false };
  }

  if (maxCharacters <= RAG_ANSWER_TRUNCATION_NOTICE.length) {
    return {
      answer: RAG_ANSWER_TRUNCATION_NOTICE.trimStart().slice(0, maxCharacters),
      truncated: normalized.length > 0,
    };
  }

  const contentLimit = maxCharacters - RAG_ANSWER_TRUNCATION_NOTICE.length;
  let prefix = normalized.length > contentLimit
    ? selectSafeMarkdownPrefix(normalized, contentLimit)
    : normalized;
  let closure = getMarkdownFenceClosure(prefix);
  if (prefix.length + closure.length > contentLimit) {
    prefix = selectSafeMarkdownPrefix(normalized, Math.max(0, contentLimit - closure.length));
    closure = getMarkdownFenceClosure(prefix);
  }
  if (prefix.length + closure.length > contentLimit) {
    prefix = prefix.slice(0, Math.max(0, contentLimit - closure.length)).trimEnd();
  }

  return {
    answer: `${prefix}${closure}${RAG_ANSWER_TRUNCATION_NOTICE}`,
    truncated: prefix.length < normalized.length,
  };
}

function selectSafeMarkdownPrefix(answer, limit) {
  if (limit <= 0) return "";
  const candidate = String(answer || "").slice(0, limit).trimEnd();
  const boundaryFloor = Math.floor(limit * 0.65);
  const boundaries = [
    { index: candidate.lastIndexOf("\n\n"), width: 0 },
    { index: candidate.lastIndexOf("\n"), width: 0 },
    { index: candidate.lastIndexOf("。"), width: 1 },
    { index: candidate.lastIndexOf("！"), width: 1 },
    { index: candidate.lastIndexOf("？"), width: 1 },
    { index: candidate.lastIndexOf(". "), width: 1 },
    { index: candidate.lastIndexOf("! "), width: 1 },
    { index: candidate.lastIndexOf("? "), width: 1 },
  ];
  const boundary = boundaries.reduce(
    (best, entry) => entry.index > best.index ? entry : best,
    { index: -1, width: 0 },
  );
  if (boundary.index < boundaryFloor) return candidate;
  return candidate.slice(0, boundary.index + boundary.width).trimEnd();
}

function getMarkdownFenceClosure(answer) {
  const text = String(answer || "");
  const closures = [];
  if ((text.match(/```/gu) || []).length % 2 === 1) closures.push("```");
  if ((text.match(/~~~/gu) || []).length % 2 === 1) closures.push("~~~");
  return closures.length ? `\n${closures.join("\n")}` : "";
}

function getLlmUsageMetrics(result = {}) {
  const usage = result.usage || {};
  const promptTokens = readTokenCount(usage, ["promptTokens", "prompt_tokens", "inputTokens", "input_tokens"]);
  const completionTokens = readTokenCount(usage, ["completionTokens", "completion_tokens", "outputTokens", "output_tokens"]);
  const totalTokens = readTokenCount(usage, ["totalTokens", "total_tokens"])
    || promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    outputCharacters: String(result.content || "").length,
    finishReason: getLlmFinishReason(result),
  };
}

function readTokenCount(usage, keys) {
  for (const key of keys) {
    const value = Number(usage?.[key]);
    if (Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return 0;
}

function getLlmFinishReason(result = {}) {
  const metadata = result.responseMetadata || result.response_metadata || {};
  return String(metadata.finish_reason || metadata.finishReason || "").trim();
}

export function createRagRetriever({ root, planning, activityPortfolio, metrics = null, readMarkdownFile = readFile }) {
  const loadStaticMarkdownDocuments = createStaticMarkdownDocumentLoader({ root, readMarkdownFile });

  async function retrieve({
    user,
    question,
    historySummary = "",
    assistantProfile = "",
    usePersonalContext = false,
  } = {}) {
    const normalizedQuestion = normalizeQuestion(question);
    const includePersonalContext = usePersonalContext === true;
    const [profile, portfolio, currentPlan] = includePersonalContext
      ? await Promise.all([
          planning.getProfile(user),
          activityPortfolio.getPortfolio(user),
          planning.getLatestRagPlan(user),
        ])
      : [{}, {}, null];
    const missingFields = includePersonalContext
      ? buildMissingFieldChecklist({ profile, portfolio })
      : [];
    const retrievalStartedAt = monotonicNowMs();
    const documents = await buildRagDocuments({
      profile,
      portfolio,
      currentPlan,
      includePersonalContext,
      staticDocuments: await loadStaticMarkdownDocuments(),
    });
    const intentProfile = analyzeQuestionIntent(normalizedQuestion);
    const retrievalQuestion = assistantProfile === "major-match"
      ? buildMajorMatchRetrievalQuery({ question: normalizedQuestion, profile, portfolio })
      : normalizedQuestion;
    const selection = selectRelevantDocuments(
      documents,
      retrievalQuestion,
      intentProfile,
      { usePersonalContext: includePersonalContext },
    );
    const contextSelection = buildContextSelection(selection.selected);
    const context = contextSelection.context;
    const retrievalMs = Math.round(monotonicNowMs() - retrievalStartedAt);
    const retrieval = {
      totalDocuments: documents.length,
      selectedDocuments: contextSelection.included.length,
      intent: intentProfile.intent,
      intentReason: intentProfile.reason,
      sourceWeights: intentProfile.sourceWeights,
      retrievalMs,
      relevance: {
        ...selection.diagnostics,
        policyVersion: RETRIEVAL_RELEVANCE_POLICY_VERSION,
      },
    };
    metrics?.recordRagRetrieval?.({
      intent: intentProfile.intent,
      durationMs: retrievalMs,
      selectedDocuments: contextSelection.included.length,
      totalDocuments: documents.length,
    });

    return {
      context,
      sources: contextSelection.included.map(serializeRagSource),
      candidates: selection.selected,
      retrieval,
      missingFields,
    };
  }

  return { retrieve };
}

async function buildRagDocuments({
  profile = {},
  portfolio = {},
  currentPlan = null,
  includePersonalContext = false,
  staticDocuments = [],
}) {
  const studentDocuments = includePersonalContext
    ? buildStudentDocuments({ profile, portfolio, currentPlan })
    .filter((document) => document.text.trim())
    .map(toLangChainRagDocument)
    : [];
  return [...studentDocuments, ...staticDocuments];
}

export function createStaticMarkdownDocumentLoader({ root, readMarkdownFile = readFile }) {
  let documentsPromise = null;
  return async function loadStaticMarkdownDocuments() {
    if (!documentsPromise) {
      documentsPromise = Promise.all([
        buildMarkdownDocuments(root, RESOURCE_LIBRARY_FILES, "resource-library", readMarkdownFile),
        buildMarkdownDocuments(root, SCHOOL_ENCYCLOPEDIA_FILES, "school-encyclopedia", readMarkdownFile),
        buildMarkdownDocuments(root, MAJOR_ENCYCLOPEDIA_FILES, "major-encyclopedia", readMarkdownFile),
      ]).then((groups) => groups
        .flat()
        .filter((document) => document.text.trim())
        .map(toLangChainRagDocument));
    }
    try {
      return await documentsPromise;
    } catch (error) {
      documentsPromise = null;
      throw error;
    }
  };
}

export function toLangChainRagDocument(source = {}) {
  const metadata = {
    id: String(source.id || source.metadata?.id || "").trim(),
    type: String(source.type || source.metadata?.type || "").trim(),
    title: String(source.title || source.metadata?.title || "").trim(),
  };
  return new Document({
    pageContent: getRagDocumentText(source),
    metadata,
  });
}

function buildStudentDocuments({ profile, portfolio, currentPlan = null }) {
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

  if (currentPlan) {
    addJsonDocument(documents, {
      type: "student-backup",
      title: `学生备份：${currentPlan.planName} / 当前方案`,
      data: currentPlan,
    });
  }

  return documents;
}

function addJsonDocument(documents, { type, title, data }) {
  const text = typeof data === "string" ? data : stringifyForRag(data);
  if (!hasMeaningfulText(text)) return;
  const chunks = splitMarkdownIntoChunks(text);
  chunks.forEach((chunk, index) => {
    const chunkTitle = chunks.length > 1 ? `${title}（${index + 1}/${chunks.length}）` : title;
    documents.push({
      id: stableId(`${type}:${title}:${index}`),
      type,
      title: chunkTitle,
      text: chunk,
    });
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

async function buildMarkdownDocuments(root, files, type, readMarkdownFile = readFile) {
  const documents = [];
  for (const entry of files) {
    const text = await readMarkdownFile(join(root, "data", entry.file), "utf8");
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

export function splitMarkdownIntoChunks(text) {
  return splitMarkdownIntoStructuredChunks(text, MAX_CHUNK_CHARS).map((chunk) => chunk.content);
}

function getChunkHeading(chunk) {
  const heading = [...chunk.matchAll(/^#{1,6}\s+(.+)$/gm)].at(-1)?.[1] || "";
  return heading.replace(/\*+/g, "").trim().slice(0, 90);
}

function analyzeQuestionIntent(question) {
  const normalized = normalizeSearchText(question);
  const hasAny = (patterns) => patterns.some((pattern) => normalized.includes(pattern));
  if (hasAny(["专业", "本科专业", "major", "concentration", "track", "职业", "岗位", "就业", "career"])) {
    return intentProfile("major", "问题包含专业、职业/岗位或 major 匹配信号。", {
      "student-backup": 1.6,
      "application-portfolio": 2.2,
      "resource-library": 1.5,
      "school-encyclopedia": 1.5,
      "major-encyclopedia": 3.7,
    });
  }
  if (hasAny(["选校", "院校", "学校", "ed", "ea", "rd", "uc", "rea", "match", "mit", "college", "university"])) {
    return intentProfile("school", "问题包含院校、轮次或具体学校信号。", {
      "student-backup": 1.3,
      "application-portfolio": 1.6,
      "resource-library": 0.9,
      "school-encyclopedia": 3.4,
      "major-encyclopedia": 1.5,
    });
  }
  if (hasAny(["竞赛", "夏校", "科研", "项目", "polygence", "活动", "resource", "competition", "summer"])) {
    return intentProfile("resource", "问题包含项目、竞赛、夏校或活动资源信号。", {
      "student-backup": 1.3,
      "application-portfolio": 1.7,
      "resource-library": 3.3,
      "school-encyclopedia": 1.2,
      "major-encyclopedia": 1.4,
    });
  }
  if (hasAny(["推荐信", "推荐人", "素材", "counselor", "teacher", "recommendation"])) {
    return intentProfile("recommendation", "问题包含推荐信或推荐人材料信号。", {
      "student-backup": 2.2,
      "application-portfolio": 3.1,
      "resource-library": 1.0,
      "school-encyclopedia": 1.5,
      "major-encyclopedia": 1.0,
    });
  }
  if (hasAny(["gpa", "sat", "ap", "课程", "成绩", "标化", "academic"])) {
    return intentProfile("academic", "问题包含成绩、课程或标化信号。", {
      "student-backup": 2.1,
      "application-portfolio": 3.0,
      "resource-library": 1.1,
      "school-encyclopedia": 1.7,
      "major-encyclopedia": 1.5,
    });
  }
  return intentProfile("general", "未识别到强意图，采用均衡检索。", {
    "student-backup": 1.6,
    "application-portfolio": 1.8,
    "resource-library": 1.4,
    "school-encyclopedia": 1.4,
    "major-encyclopedia": 1.4,
  });
}

function intentProfile(intent, reason, sourceWeights) {
  return { intent, reason, sourceWeights };
}

function selectRelevantDocuments(documents, question, intentProfile = analyzeQuestionIntent(question), {
  usePersonalContext = false,
} = {}) {
  const queryTokens = tokenize(question);
  const schoolTitleAnchors = findExplicitTitleAnchors(
    documents,
    queryTokens,
    "school-encyclopedia",
  );
  const allowedKnowledgeTypes = getAllowedKnowledgeTypes(question, intentProfile.intent);
  const candidates = consolidatePersonalDocuments(documents).map((document, index) => {
    const scope = PERSONAL_SOURCE_TYPES.has(getRagDocumentType(document)) ? "personal" : "knowledge";
    const type = getRagDocumentType(document);
    const titleAnchored = type !== "school-encyclopedia"
      || !schoolTitleAnchors.length
      || matchesTitleAnchor(getRagDocumentTitle(document), schoolTitleAnchors);
    const typeAllowed = !allowedKnowledgeTypes.size || allowedKnowledgeTypes.has(type);
    const score = scope === "personal"
      ? personalAnchorScore(document)
      : titleAnchored && typeAllowed ? scoreDocument(document, queryTokens, question, intentProfile) : 0;
    return {
      id: getRagDocumentId(document),
      type,
      scope,
      title: getRagDocumentTitle(document),
      text: getRagDocumentText(document),
      channel: scope === "personal" ? "personal" : `local-keyword:${getRagDocumentType(document)}`,
      rawScore: score,
      index,
    };
  });
  const knowledgeLimit = usePersonalContext
    ? PERSONALIZED_KNOWLEDGE_DOCUMENT_LIMIT
    : KNOWLEDGE_DOCUMENT_LIMIT;
  return selectRelevantEvidence(candidates, {
    maxResults: knowledgeLimit + (usePersonalContext ? PERSONAL_DOCUMENT_LIMIT : 0),
    scopeLimits: {
      knowledge: knowledgeLimit,
      personal: usePersonalContext ? PERSONAL_DOCUMENT_LIMIT : 0,
    },
  });
}

function getAllowedKnowledgeTypes(question, primaryIntent) {
  const normalized = normalizeSearchText(question);
  const asciiTokens = new Set(normalized.match(/[a-z0-9][a-z0-9.+#-]*/g) || []);
  const allowed = new Set();
  const hasAny = (patterns) => patterns.some((pattern) => {
    const normalizedPattern = normalizeSearchText(pattern);
    return /^[a-z0-9][a-z0-9.+#-]*$/u.test(normalizedPattern)
      ? asciiTokens.has(normalizedPattern)
      : normalized.includes(normalizedPattern);
  });
  const primaryType = {
    school: "school-encyclopedia",
    major: "major-encyclopedia",
    resource: "resource-library",
  }[primaryIntent];
  if (primaryType) allowed.add(primaryType);
  if (hasAny(["选校", "院校", "学校", "ed", "ea", "rd", "uc", "rea", "mit", "college", "university"])) {
    allowed.add("school-encyclopedia");
  }
  if (hasAny(["专业", "本科专业", "major", "concentration", "track", "职业", "岗位", "就业", "career", "computer science", "计算机"])) {
    allowed.add("major-encyclopedia");
  }
  if (hasAny(["竞赛", "夏校", "科研", "项目", "polygence", "活动", "resource", "competition", "summer", "frc", "ftc"])) {
    allowed.add("resource-library");
  }
  return allowed;
}

function findExplicitTitleAnchors(documents, queryTokens, type) {
  const titles = [...new Set(documents
    .filter((document) => getRagDocumentType(document) === type)
    .map((document) => normalizeSearchText(getRagDocumentTitle(document))))];
  return queryTokens.filter((token) => {
    if (/^[a-z0-9][a-z0-9.+#-]*$/u.test(token) && token.length < 3) return false;
    const matchingTitles = titles.filter((title) => {
      const asciiTokens = new Set(title.match(/[a-z0-9][a-z0-9.+#-]*/g) || []);
      return containsSearchToken(title, asciiTokens, token);
    });
    return matchingTitles.length > 0 && matchingTitles.length <= 4;
  });
}

function matchesTitleAnchor(title, anchors) {
  const normalizedTitle = normalizeSearchText(title);
  const asciiTokens = new Set(normalizedTitle.match(/[a-z0-9][a-z0-9.+#-]*/g) || []);
  return anchors.some((token) => containsSearchToken(normalizedTitle, asciiTokens, token));
}

function consolidatePersonalDocuments(documents) {
  const knowledgeDocuments = [];
  const personalGroups = new Map();
  for (const document of documents) {
    const type = getRagDocumentType(document);
    if (!PERSONAL_SOURCE_TYPES.has(type)) {
      knowledgeDocuments.push(document);
      continue;
    }
    const title = getRagDocumentTitle(document).replace(/（\d+\/\d+）$/u, "");
    const key = `${type}:${title}`;
    if (!personalGroups.has(key)) {
      personalGroups.set(key, {
        id: getRagDocumentId(document),
        type,
        title,
        texts: [],
      });
    }
    personalGroups.get(key).texts.push(getRagDocumentText(document));
  }
  const personalDocuments = [...personalGroups.values()].map(({ texts, ...document }) => ({
    ...document,
    text: texts.join("\n\n").slice(0, MAX_PERSONAL_SOURCE_CHARS),
  }));
  return [...personalDocuments, ...knowledgeDocuments];
}

function personalAnchorScore(document) {
  const type = getRagDocumentType(document);
  const title = getRagDocumentTitle(document);
  if (type === "application-portfolio") return 1;
  if (title.includes("基础信息")) return 1;
  if (title.includes("当前方案")) return 0.8;
  return 0.9;
}

function isStudentProfileDocument(document) {
  return getRagDocumentTitle(document).includes("基础信息");
}

function scoreDocument(document, queryTokens, question, intentProfile) {
  const title = getRagDocumentTitle(document);
  const type = getRagDocumentType(document);
  const searchable = normalizeSearchText(`${title}\n${getRagDocumentText(document)}`);
  const normalizedTitle = normalizeSearchText(title);
  const searchableAsciiTokens = new Set(searchable.match(/[a-z0-9][a-z0-9.+#-]*/g) || []);
  const titleAsciiTokens = new Set(normalizedTitle.match(/[a-z0-9][a-z0-9.+#-]*/g) || []);
  const sourceWeight = intentProfile.sourceWeights[type] || 1;
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (containsSearchToken(searchable, searchableAsciiTokens, token)) {
      score += (token.length >= 4 ? 3 : 1) * sourceWeight;
    }
    if (containsSearchToken(normalizedTitle, titleAsciiTokens, token)) score += 2 * sourceWeight;
  }
  const normalizedQuestion = normalizeSearchText(question);
  if (normalizedQuestion && searchable.includes(normalizedQuestion)) score += 8;
  return score;
}

function containsSearchToken(text, asciiTokens, token) {
  return /^[a-z0-9][a-z0-9.+#-]*$/u.test(token)
    ? asciiTokens.has(token)
    : text.includes(token);
}

function tokenizeRaw(value) {
  const text = String(value || "").toLowerCase();
  const asciiTokens = text.match(/[a-z0-9][a-z0-9.+#-]*/g) || [];
  const cjkChars = Array.from(text).filter((char) => /\p{Script=Han}/u.test(char));
  const cjkBigrams = [];
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    cjkBigrams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  return [...new Set([...asciiTokens, ...cjkBigrams])].filter((token) => token.length >= 2);
}

function tokenize(value) {
  return tokenizeRaw(value).filter((token) => !RETRIEVAL_STOP_TOKENS.has(token));
}

function buildMajorMatchRetrievalQuery({ question, profile = {}, portfolio = {} }) {
  const profileData = profile.profile || profile;
  return [
    String(question || "").split("\n")[0],
    profileData.interests,
    profileData.intendedMajor,
    profileData.majorDirection,
    profileData.careerInterests,
    ...(portfolio.activities || []).slice(0, 8).flatMap((activity) => [
      activity.activityName || activity.name,
      activity.description,
      activity.role,
    ]),
    ...(portfolio.competitions || []).slice(0, 5).flatMap((competition) => [
      competition.competitionName || competition.name,
      competition.subject || competition.category,
    ]),
  ].map(cleanText).filter(Boolean).join(" ");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.+#-]+/gu, " ")
    .trim();
}

export function buildContextSelection(selected, maxContextChars = MAX_CONTEXT_CHARS) {
  const sections = [];
  const included = [];
  let totalChars = 0;
  for (const source of prioritizeContextSources(selected)) {
    const type = getRagDocumentType(source);
    const block = [
      `[${included.length + 1}] ${SOURCE_TYPE_LABELS[type]} | ${getRagDocumentTitle(source)}`,
      getRagDocumentText(source).trim(),
    ].join("\n");
    const separatorChars = sections.length ? 7 : 0;
    if (totalChars + separatorChars + block.length > maxContextChars) continue;
    sections.push(block);
    included.push(source);
    totalChars += separatorChars + block.length;
  }
  return { context: sections.join("\n\n---\n\n"), included };
}

function prioritizeContextSources(selected) {
  const personal = [];
  const knowledge = [];
  for (const source of selected) {
    if (PERSONAL_SOURCE_TYPES.has(getRagDocumentType(source))) personal.push(source);
    else knowledge.push(source);
  }
  return [...prioritizeContextGroup(personal), ...prioritizeContextGroup(knowledge)];
}

function prioritizeContextGroup(selected) {
  const firstByGroup = [];
  const remaining = [];
  const seenGroups = new Set();
  for (const source of selected) {
    const group = getContextSourceGroup(source);
    if (!seenGroups.has(group)) {
      seenGroups.add(group);
      firstByGroup.push(source);
    } else {
      remaining.push(source);
    }
  }
  return [...firstByGroup, ...remaining];
}

function getContextSourceGroup(source) {
  const type = getRagDocumentType(source);
  if (type !== "student-backup") return type;
  return isStudentProfileDocument(source) ? "student-profile" : "student-plan";
}

function buildUserMessage(
  question,
  context,
  historySummary,
  missingFields = [],
  intentProfile = analyzeQuestionIntent(question),
  usePersonalContext = false,
) {
  return [
    usePersonalContext === true
      ? "本次已启用个人上下文，可结合当前画像、申请档案和最近更新的一份规划。"
      : "本次未启用个人上下文；不得假设已读取用户画像、申请档案或规划。",
    "",
    `问题：${question}`,
    "",
    `问题意图：${intentProfile.intent}`,
    `意图判断依据：${intentProfile.reason}`,
    `检索权重：${JSON.stringify(intentProfile.sourceWeights)}`,
    `检索模式：${intentProfile.queryPlan?.mode || "hybrid-rag"}`,
    `证据处理步骤：${(intentProfile.queryPlan?.steps || ["document_retrieval", "evidence_synthesis"]).join(" -> ")}`,
    `结构化约束：${JSON.stringify(intentProfile.queryPlan?.constraints || {})}`,
    `知识图谱状态：${intentProfile.graph?.status || "not-required"}；命中关系数：${intentProfile.graph?.selectedFacts || 0}`,
    "",
    "对话记忆摘要：",
    historySummary || "暂无上一轮对话记忆。",
    "",
    "可用资料范围：学生备份、个人申请档案、资源库、院校百科、专业百科。",
    "请先判断资料是否足以回答；不要在正文末尾列出参考资料，检索来源会由页面的“参考资料”下拉区展示。",
    missingFields.length
      ? `当前资料缺失字段清单：${missingFields.join("、")}。如果这些字段会影响判断，请在回答中明确提示需要补充。`
      : "当前资料缺失字段清单：未发现明显缺失项。",
    "",
    "检索到的资料片段：",
    context || "未检索到高相关资料。请说明当前资料不足，并建议用户补充信息。",
  ].join("\n");
}

function buildInspirationUserMessage(question, historySummary = "") {
  return [
    `用户此刻想聊的内容：${question}`,
    "",
    "当前对话记忆摘要：",
    historySummary || "暂无可引用的历史对话；请只邀请用户讲一个真实的具体经历。",
    "",
    "只把上面的用户输入和对话记忆摘要视为事实。不要补充、猜测或暗示你还掌握其他用户背景。",
  ].join("\n");
}

function selectSystemPrompt(assistantProfile = "", usePersonalContext = false) {
  const prompt = assistantProfile === "major-match" ? MAJOR_MATCH_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const personalContextBoundary = usePersonalContext === true
    ? "本次请求已明确启用个人上下文，只能使用所提供的当前资料，不得假设存在其他规划或历史快照。"
    : "本次请求未启用个人上下文，不得声称或暗示已经读取用户画像、申请档案、申请规划或历史快照。";
  return `${prompt}\n\n${personalContextBoundary}`;
}

export function serializeRagSource(source) {
  const type = getRagDocumentType(source);
  return {
    id: getRagDocumentId(source),
    type,
    scope: PERSONAL_SOURCE_TYPES.has(type) ? "personal" : "knowledge",
    typeLabel: PERSONAL_SOURCE_TYPES.has(type) ? "个人上下文" : SOURCE_TYPE_LABELS[type] || type,
    title: getRagDocumentTitle(source),
    snippet: formatSourceSnippet(getRagDocumentText(source)),
  };
}

function getRagDocumentId(document = {}) {
  return String(document.id || document.metadata?.id || "").trim();
}

function getRagDocumentType(document = {}) {
  return String(document.type || document.metadata?.type || "").trim();
}

function getRagDocumentTitle(document = {}) {
  return String(document.title || document.metadata?.title || "").trim();
}

function getRagDocumentText(document = {}) {
  return String(document.text || document.pageContent || "").trim();
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

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
