import { escapeHtml } from "./html-utils.mjs";
import { renderMarkdown } from "../domain/markdown-renderer.mjs?v=20260531-deepseek-markdown";
import { csrfFetch } from "./csrf-token.mjs";
import { getAiGenerationErrorMessage } from "./auth-client-errors.mjs?v=20260804-ai-timeout-recovery";

const form = document.querySelector("#deepSeekQuestionForm");
const questionInput = document.querySelector("#deepSeekQuestion");
const askButton = document.querySelector("#deepSeekAskButton");
const clearButton = document.querySelector("#deepSeekClearButton");
const exportButton = document.querySelector("#deepSeekExportButton");
const saveReviewButton = document.querySelector("#deepSeekSaveReviewButton");
const status = document.querySelector("#deepSeekAskStatus");
const chatLog = document.querySelector("#deepSeekChatLog");
const workflowRegion = document.querySelector("#deepSeekWorkflows");

const PAGE_ASSISTANT_PROFILE = document.body.dataset.assistantProfile === "inspiration"
  ? "inspiration"
  : "application";
const IS_INSPIRATION_PROFILE = PAGE_ASSISTANT_PROFILE === "inspiration";
const ASSISTANT_NAME = IS_INSPIRATION_PROFILE ? "启发性机器人" : "申请机器人";
const ANALYTICS_SOURCE = IS_INSPIRATION_PROFILE ? "inspiration_robot" : "application_robot";
const INITIAL_CHAT_MESSAGE = IS_INSPIRATION_PROFILE
  ? "你好，我是启发性机器人。我会像一位温暖、耐心但不过度推断的知心大姐姐式探索伙伴，先从我们真实说过的话里寻找可能的兴趣线索，再由你选择想探索的方向。如果现在还没有足够的历史对话，我们就从一个你真实经历过的具体时刻开始。"
  : "你好，我是你的申请机器人。你可以问我选校策略、活动补强、推荐信、成绩档案或项目取舍。除你本次输入的问题外，我只会读取当前登录账户的“我的申请档案”；不会读取学生画像、申请规划、历史快照、对话记忆、资源库、院校百科、专业百科或其他用户数据。档案依据会收起在回答下方，需要核验时再展开。";

const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const DEEPSEEK_RAG_JOB_ENDPOINT = "/api/deepseek-rag-jobs";
const DEEPSEEK_RAG_PENDING_JOB_KEY = IS_INSPIRATION_PROFILE
  ? "deepseek-inspiration-pending-job"
  : "deepseek-rag-pending-job";
const DEEPSEEK_RAG_JOB_POLL_INTERVAL_MS = 3000;
const DEEPSEEK_RAG_JOB_TIMEOUT_MS = 8 * 60 * 1000;
const USER_AVATAR_SRC = "./assets/logo-mark.svg";
const DEEPSEEK_AVATAR_SRC = "./assets/deepseek-avatar.svg";
const INSPIRATION_AVATAR_SRC = "./assets/inspiration-bean-avatar.svg";
const ASSISTANT_AVATAR_SRC = IS_INSPIRATION_PROFILE
  ? INSPIRATION_AVATAR_SRC
  : DEEPSEEK_AVATAR_SRC;
const THINKING_TEXT = "......";
const MAX_MEMORY_TURNS = IS_INSPIRATION_PROFILE ? 8 : 4;
const MAX_MEMORY_CHARS = IS_INSPIRATION_PROFILE ? 1750 : 900;
const LONG_ANSWER_COLLAPSE_CHARS = 3_000;
const LONG_ANSWER_PREVIEW_CHARS = 800;
const PROGRESS_STATUSES = IS_INSPIRATION_PROFILE
  ? [
      "正在理解你刚才说的重点...",
      "正在寻找值得继续追问的线索...",
      "启发性机器人正在组织回应...",
    ]
  : [
      "正在读取你的申请档案...",
      "正在筛选档案内证据...",
      "DeepSeek 正在基于档案生成建议...",
    ];
const PERSONAL_CONTEXT_PROGRESS_STATUSES = [
  "正在读取你的申请档案...",
  "正在筛选档案内证据...",
  "DeepSeek 正在基于档案生成建议...",
];
const STANDARD_RESPONSE_SECTIONS = [
  "最终输出请只使用以下报告结构：",
  "## 核心结论",
  "## 依据与证据",
  "## 主要风险",
  "## 下一步行动",
  "不要在正文末尾单独输出“参考资料”章节；页面会把使用的申请档案依据收起在回答下方。",
].join("\n");
const FOLLOW_UP_ACTIONS = IS_INSPIRATION_PROFILE
  ? [
      {
        label: "继续问一个问题",
        prompt: "请根据我刚才说过的事实继续探索，不要给结论，也不要一次问多个问题。这一轮只问我一个最关键的问题。",
      },
      {
        label: "形成探索问题",
        prompt: "请先判断现有对话是否足以形成一个暂定探索问题。如果还不够，这一轮只问一个关键问题；如果足够，请写清事实依据和暂定探索问题，并只问我是否认可或想怎样修改。",
      },
      {
        label: "设计一个小尝试",
        prompt: "请先确认我是否已经明确认可了一个探索问题。如果还没有，不要直接设计行动，这一轮只问一个帮助确认的问题；如果已经确认，请和我形成一个低门槛、时间明确、能亲自完成且不是为了包装申请履历的小行动，并附一个行动后的反思问题。",
      },
    ]
  : [
      {
        label: "生成行动清单",
        prompt: "请基于我的个人申请档案和已保存资料，生成未来 30 天按优先级排序的行动清单，并标注每项行动需要的证据或材料。",
      },
      {
        label: "按冲刺/匹配/保底重排",
        prompt: "请基于我的个人申请档案、选校计划和院校百科，把目标院校按冲刺、匹配、保底重新梳理，并说明调整理由与需要核验的官方信息。",
      },
      {
        label: "转成推荐信素材",
        prompt: "请基于我的个人申请档案、活动证据和推荐信记录，把可用于推荐信沟通的素材整理成推荐人视角的要点清单。",
      },
    ];
const QUALITY_REVIEW_REASON_LABELS = {
  no_sources: "没有可核验来源",
  low_retrieval_hit_rate: "来源覆盖不足",
  unsupported_citations: "引用编号需要核验",
  high_risk_claims: "高风险录取表述",
  response_too_long: "回答达到长度上限",
};
const QUALITY_STATUS_LABELS = {
  limited_evidence: "可核验资料不足",
  review_required: "需要人工复核",
  pass: "质量检查通过",
};
const APPLICATION_WORKFLOW_PROMPTS = {
  "profile-audit": {
    label: "申请档案体检",
    prompt: [
      "请进行一次申请档案体检。",
      "请读取我的个人申请档案、当前画像、最近规划、成绩档案、课外活动、竞赛、夏校、推荐信与选校计划；不要读取历史备份或历史快照。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 当前优势",
      "## 明显短板",
      "## 缺失信息",
      "## 未来 30 天优先补强项",
      "如果资料不足，请明确说明需要我补充什么。",
    ].join("\n"),
  },
  "school-strategy": {
    label: "选校策略分析",
    prompt: [
      "请分析我的选校策略。",
      "请结合我的个人申请档案、目标专业、成绩、活动、已保存选校计划和院校百科，判断冲刺、匹配、保底结构是否合理。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 当前选校结构",
      "## 每个轮次的主要风险",
      "## 建议保留 / 调整 / 补充的方向",
      "## 下一步核验清单",
      "不要给出录取概率承诺；涉及申请要求请提醒以申请年度官网为准。",
    ].join("\n"),
  },
  "activity-boost": {
    label: "活动补强方案",
    prompt: [
      "请给出活动补强方案。",
      "请结合我的目标专业、个人申请档案、当前画像、最近规划和资料库，判断现有活动是否形成清晰主线，并推荐可以深化或补强的方向。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 现有活动主线判断",
      "## 最值得深化的活动",
      "## 缺失的活动类型或证据",
      "## 推荐补强项目或行动",
      "建议要具体到下一步行动，不要泛泛而谈。",
    ].join("\n"),
  },
  "recommendation-strategy": {
    label: "推荐信策略",
    prompt: [
      "请制定推荐信策略。",
      "请结合我的个人申请档案、推荐信记录、课程/活动证据、目标专业和选校计划，判断推荐人组合是否合理，并给出材料准备建议。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 推荐人组合建议",
      "## 每封推荐信应突出什么",
      "## 需要准备给推荐人的材料",
      "## 风险与补救建议",
      "如果推荐信资料不足，请列出需要补充的推荐人关系、课程表现和活动证据。",
    ].join("\n"),
  },
  "resource-match": {
    label: "项目/竞赛/夏校匹配",
    prompt: [
      "请匹配适合我的项目、竞赛和夏校。",
      "请结合我的年级、目标专业、个人申请档案、当前画像、最近规划、可用资源库和身份/资格限制，筛选最值得优先考虑的资源。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 推荐优先级表",
      "## 每个资源为什么适合我",
      "## 申请价值与可形成的证据",
      "## 准备时间与下一步行动",
      "如果资料不足，请说明需要补充哪些成绩、活动、身份条件或时间预算。",
    ].join("\n"),
  },
  "school-gap": {
    label: "院校匹配与差距分析",
    prompt: [
      "请做院校匹配与差距分析。",
      "请结合我的个人申请档案、当前画像、最近规划、目标专业、选校计划和院校百科，分析目标学校看重什么、我目前是否匹配、还缺哪些证据。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 目标院校匹配点",
      "## 当前主要差距",
      "## 可以补强的证据",
      "## 需要进一步核验的官方信息",
      "不要承诺录取结果；如果院校资料不足，请明确说明缺少哪些学校信息。",
    ].join("\n"),
  },
  "academic-plan": {
    label: "成绩与课程规划诊断",
    prompt: [
      "请进行成绩与课程规划诊断。",
      "请结合我的 GPA、SAT、AP、年级、目标专业、个人申请档案和院校要求，判断成绩与课程组合是否支撑当前申请目标。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 当前成绩与课程优势",
      "## 主要风险",
      "## AP / 课程 / 标化考试优先级",
      "## 未来 3-6 个月行动建议",
      "如果缺少成绩记录，请列出需要补充的 GPA、SAT、AP 或课程信息。",
    ].join("\n"),
  },
  "material-checklist": {
    label: "申请材料清单生成",
    prompt: [
      "请生成申请材料清单。",
      "请结合我的选校计划、申请轮次、个人申请档案、推荐信记录、成绩档案、活动证据和院校百科，按学校/轮次整理需要准备的材料。",
      "请按以下结构输出：",
      "## 简短结论",
      "## 按轮次/学校的材料清单",
      "## 已具备材料",
      "## 缺失材料",
      "## 优先级和截止前行动",
      "涉及学校具体要求、截止日期和提交规则时，请提醒以申请年度官网为准。",
    ].join("\n"),
  },
};

const INSPIRATION_WORKFLOW_PROMPTS = {
  "history-clues": {
    label: "从历史对话找线索",
    prompt: "请只根据我们已经发生的真实对话寻找兴趣线索。关注我反复提到、描述具体、主动投入时间精力、表达价值观或想法发生变化的内容。如果依据足够，请并列给出 2-4 个可能方向，每个方向严格分开写“历史事实依据”和“待验证的可能性”，最后只问我想先探索哪一个；如果依据不足，只问我一个关于真实经历的问题。",
  },
  "explore-direction": {
    label: "探索一个兴趣方向",
    prompt: "请先让我选择一个有历史事实依据的可能方向。选定后，每轮只问一个基于事实的关键问题，帮助我判断喜欢的是哪一部分、为什么重要，以及它和我重视的事情有什么联系。不要替我下结论。",
  },
  "confirm-question": {
    label: "确认探索问题",
    prompt: "请基于我们已经说过的事实，判断是否能形成一个区分不同动机或兴趣形态的暂定探索问题。如果还不能，这一轮只问一个问题；如果可以，请说明事实依据，提出一个暂定问题，并只邀请我确认或修正它。",
  },
  "small-action": {
    label: "设计一次小行动",
    prompt: "请先确认我已经认可一个探索问题。只有确认后，才和我设计一次门槛低、时间范围明确、能真实接触该方向、可以亲自完成、完成后能产生新认识且不是为了包装申请履历的小行动；最后只留下一个行动后的反思问题。",
  },
};

const WORKFLOW_PROMPTS = IS_INSPIRATION_PROFILE
  ? INSPIRATION_WORKFLOW_PROMPTS
  : APPLICATION_WORKFLOW_PROMPTS;

let progressStatusTimer = null;
let deepSeekRagJobPolling = false;
let conversationSummary = "";
const conversationTurns = [];
const conversationArchive = [];
const assistantMessages = new Map();

function trackDeepSeekUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  csrfFetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: {},
      metrics,
      details: {
        source: ANALYTICS_SOURCE,
        assistantProfile: PAGE_ASSISTANT_PROFILE || "application",
        conversationTurns: conversationArchive.length,
        ...details,
      },
    }),
  }).catch(() => {});
}

if (!IS_INSPIRATION_PROFILE) {
  for (const workflow of Object.values(WORKFLOW_PROMPTS)) {
    workflow.prompt = `${workflow.prompt}\n\n${STANDARD_RESPONSE_SECTIONS}`;
  }
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function startProgressStatus(usePersonalContext = false) {
  stopProgressStatus();
  const progressStatuses = !IS_INSPIRATION_PROFILE && usePersonalContext === true
    ? PERSONAL_CONTEXT_PROGRESS_STATUSES
    : PROGRESS_STATUSES;
  let index = 0;
  setStatus(progressStatuses[index]);
  progressStatusTimer = window.setInterval(() => {
    index = Math.min(index + 1, progressStatuses.length - 1);
    setStatus(progressStatuses[index]);
  }, 1500);
}

function stopProgressStatus() {
  if (!progressStatusTimer) return;
  window.clearInterval(progressStatusTimer);
  progressStatusTimer = null;
}

function setWorking(isWorking) {
  askButton.disabled = isWorking;
  clearButton.disabled = isWorking;
  workflowRegion
    ?.querySelectorAll("[data-deepseek-workflow]")
    .forEach((button) => {
      button.disabled = isWorking;
    });
}

async function requestJson(url, options = {}) {
  const response = await csrfFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "./index.html";
    throw new Error("请先登录");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readPendingDeepSeekRagJob() {
  try {
    const raw = localStorage.getItem(DEEPSEEK_RAG_PENDING_JOB_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record?.jobId && record?.question ? record : null;
  } catch {
    return null;
  }
}

function rememberPendingDeepSeekRagJob(record) {
  if (!record?.jobId || !record?.question) return;
  localStorage.setItem(
    DEEPSEEK_RAG_PENDING_JOB_KEY,
    JSON.stringify({
      jobId: record.jobId,
      question: record.question,
      displayQuestion: record.displayQuestion || record.question,
      workflowKey: record.workflowKey || "",
      usePersonalContext: record.usePersonalContext === true,
      createdAt: new Date().toISOString(),
    }),
  );
}

function clearPendingDeepSeekRagJob() {
  localStorage.removeItem(DEEPSEEK_RAG_PENDING_JOB_KEY);
}

async function waitForDeepSeekRagJob(jobId) {
  if (!jobId) throw new Error(`${ASSISTANT_NAME}问答任务创建失败，请刷新页面后重试。`);
  const deadline = performance.now() + DEEPSEEK_RAG_JOB_TIMEOUT_MS;
  let consecutivePollFailures = 0;

  while (performance.now() < deadline) {
    let job;
    try {
      job = await requestJson(`${DEEPSEEK_RAG_JOB_ENDPOINT}/${encodeURIComponent(jobId)}`, {
        method: "GET",
      });
      consecutivePollFailures = 0;
    } catch (error) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 3) throw error;
      setStatus(`正在重新连接${ASSISTANT_NAME}后台问答任务...`);
      await delay(DEEPSEEK_RAG_JOB_POLL_INTERVAL_MS);
      continue;
    }

    if (job.status === "completed") return job.result || {};
    if (job.status === "cancelled") {
      const error = new Error("任务已取消。");
      error.final = true;
      throw error;
    }
    if (job.status === "failed") {
      const error = new Error(getAiGenerationErrorMessage(job, {
        operation: `${ASSISTANT_NAME}回答生成`,
        fallbackMessage: `${ASSISTANT_NAME}问答失败，请稍后重试。`,
      }));
      error.final = true;
      throw error;
    }
    setStatus(`${ASSISTANT_NAME}正在后台生成回答，可先切换到其他页面；回到本页会自动接上。`);
    await delay(DEEPSEEK_RAG_JOB_POLL_INTERVAL_MS);
  }

  throw new Error(`${ASSISTANT_NAME}问答耗时过长，请稍后回到本页查看，或重新提问。`);
}

function renderPlainText(text) {
  const blocks = String(text || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return "<p>暂无内容。</p>";
  return blocks
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function renderBubbleContent(content, {
  isUser = false,
  error = false,
  answerContentId = "",
} = {}) {
  const rendered = isUser || error
    ? renderPlainText(content)
    : renderMarkdown(content) || renderPlainText(content);
  if (isUser || error || String(content || "").length <= LONG_ANSWER_COLLAPSE_CHARS) return rendered;
  const controlledId = escapeHtml(answerContentId || createMessageId("answer-content"));
  const previewText = `${compactText(content, LONG_ANSWER_PREVIEW_CHARS)}…`;
  return `
    <div class="chat-answer-preview">${renderPlainText(previewText)}</div>
    <div
      id="${controlledId}"
      class="chat-answer-content"
      hidden>${rendered}</div>
    <button
      class="chat-answer-toggle"
      type="button"
      data-deepseek-answer-toggle
      aria-controls="${controlledId}"
      aria-expanded="false"
    >展开全文</button>`;
}

function renderSourceCards(sources = []) {
  const sourceBody = sources.length
    ? sources
        .map(
          (source, index) => `
            <article class="chat-source-card">
              <div class="chat-source-card-header">
                <span>${index + 1}</span>
                <strong>${escapeHtml(source.typeLabel || source.type)}</strong>
              </div>
              <h4>${escapeHtml(source.title)}</h4>
              <div class="chat-source-snippet">${renderSourceSnippet(source.snippet)}</div>
            </article>`,
        )
        .join("")
    : '<p class="chat-source-empty">本次没有检索到高相关资料。</p>';

  return `
    <section class="chat-references" aria-label="申请档案依据">
      <h3>申请档案依据</h3>
      <div class="chat-source-grid">${sourceBody}</div>
    </section>`;
}

function renderSourceSnippet(snippet) {
  return renderMarkdown(snippet) || renderPlainText(snippet);
}

function renderGuidedSourceCards(sources = []) {
  const summaryText = sources.length ? `${sources.length} 条线索` : "暂无高相关线索";
  const sourceBody = sources.length
    ? sources
        .map(
          (source, index) => `
            <article class="chat-source-card">
              <div class="chat-source-card-header">
                <span>${index + 1}</span>
                <strong class="chat-source-type-chip">${escapeHtml(source.typeLabel || source.type)}</strong>
              </div>
              <h4>${escapeHtml(source.title)}</h4>
              <div class="chat-source-snippet">${renderSourceSnippet(source.snippet)}</div>
            </article>`,
        )
        .join("")
    : '<p class="chat-source-empty">本次没有检索到高相关资料。</p>';

  return `
    <details class="chat-references" aria-label="申请档案依据">
      <summary>
        <span>申请档案依据</span>
        <small>${summaryText}</small>
      </summary>
      <div class="chat-source-grid">${sourceBody}</div>
    </details>`;
}

function renderMissingFieldChecklist(missingFields = []) {
  if (!missingFields.length) return "";
  return `
    <section class="chat-missing-fields" aria-label="资料缺失字段">
      <h3>资料不足时建议先补充</h3>
      <ul>${missingFields.map((field) => `<li>${escapeHtml(field)}</li>`).join("")}</ul>
    </section>`;
}

function buildRagRequestPayload(question, historySummary) {
  if (IS_INSPIRATION_PROFILE) {
    return { question, historySummary, assistantProfile: PAGE_ASSISTANT_PROFILE };
  }
  return {
    question,
    assistantProfile: "application",
    usePersonalContext: true,
  };
}

function renderQualityReview(quality = null) {
  if (!quality || typeof quality !== "object") return "";
  const review = quality.review || {};
  const retrieval = quality.retrieval || {};
  const reasons = Array.isArray(review.reasons) ? review.reasons.filter(Boolean) : [];
  const qualityStatus = String(quality.status || (review.required ? "review_required" : "pass"));
  const requiresReview = qualityStatus === "review_required";
  const limitedEvidence = qualityStatus === "limited_evidence";
  const label = QUALITY_STATUS_LABELS[qualityStatus] || QUALITY_STATUS_LABELS.pass;
  const sourceCount = Number(retrieval.sourceCount) || 0;
  const hitRate = Number(retrieval.retrievalHitRate);
  const coverageText = Number.isFinite(hitRate)
    ? `${Math.round(hitRate * 100)}% 来源覆盖`
    : `${sourceCount} 条来源`;
  const reasonList = reasons.length
    ? `<ul>${reasons
        .map((reason) => `<li>${escapeHtml(QUALITY_REVIEW_REASON_LABELS[reason] || reason)}</li>`)
        .join("")}</ul>`
    : "";
  const message = requiresReview
    ? review.fallback?.message || "当前回答需要人工复核，请先核验申请档案依据后再用于申请决策。"
    : limitedEvidence
      ? "当前可核验资料不足，回答已限制在现有证据范围内；可补充资料后重试。"
      : "质量检查通过，仍建议展开申请档案依据核验关键事实。";

  return `
    <section class="chat-quality-review ${requiresReview ? "needs-review" : limitedEvidence ? "limited-evidence" : "is-clear"}" aria-label="AI 质量复核">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(coverageText)}</strong>
      </div>
      <p>${escapeHtml(message)}</p>
      ${reasonList}
    </section>`;
}

function renderFollowUpActions() {
  const actions = FOLLOW_UP_ACTIONS.map(
    (action, index) => `
      <button
        class="chat-followup-button"
        type="button"
        data-deepseek-follow-up="${index}"
      >${escapeHtml(action.label)}</button>`,
  ).join("");

  return `
    <div class="chat-followups" aria-label="继续追问">
      ${actions}
    </div>`;
}

function renderPortfolioSaveActions(messageId) {
  return `
    <div class="chat-save-actions" aria-label="保存回答">
      <button
        class="chat-followup-button"
        type="button"
        data-deepseek-save-actions="${escapeHtml(messageId)}"
      >保存为行动清单</button>
      <button
        class="chat-followup-button"
        type="button"
        data-deepseek-save-note="${escapeHtml(messageId)}"
      >保存到我的申请档案</button>
    </div>`;
}

function renderMessage({
  id = "",
  role,
  content,
  sources = [],
  missingFields = [],
  thinking = false,
  error = false,
  showReferences = true,
  showFollowUps = true,
  showPortfolioActions = true,
  quality = null,
}) {
  const isUser = role === "user";
  const avatarSrc = isUser ? USER_AVATAR_SRC : ASSISTANT_AVATAR_SRC;
  const avatarAlt = isUser ? "US College Compass" : ASSISTANT_NAME;
  const speaker = isUser ? "你" : ASSISTANT_NAME;
  const answerContentId = `${id || createMessageId("message")}-answer-content`;
  const bubbleContent = thinking
    ? `<span class="thinking-dots" aria-label="${ASSISTANT_NAME}正在思考">${THINKING_TEXT}</span>`
    : renderBubbleContent(content, { isUser, error, answerContentId });
  const referenceContent = !IS_INSPIRATION_PROFILE && !isUser && !thinking && !error && showReferences
    ? renderGuidedSourceCards(sources)
    : "";
  const followUpContent = !isUser && !thinking && !error && showFollowUps ? renderFollowUpActions() : "";
  const missingFieldContent = !isUser && !thinking && !error
    ? renderMissingFieldChecklist(missingFields)
    : "";
  const qualityContent = !IS_INSPIRATION_PROFILE && !isUser && !thinking && !error
    ? renderQualityReview(quality)
    : "";
  const portfolioActionContent = !isUser && !thinking && !error && showPortfolioActions
    ? renderPortfolioSaveActions(id)
    : "";
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";

  return `
    <article${idAttribute} class="chat-message ${isUser ? "user" : "assistant"}${thinking ? " is-thinking" : ""}${error ? " is-error" : ""}">
      ${isUser ? "" : `<img class="chat-avatar" src="${avatarSrc}" width="42" height="42" alt="${avatarAlt}" />`}
      <div class="chat-message-body">
        <p class="chat-speaker">${escapeHtml(speaker)}</p>
        <div class="chat-bubble">${bubbleContent}</div>
        ${missingFieldContent}
        ${qualityContent}
        ${referenceContent}
        ${followUpContent}
        ${portfolioActionContent}
      </div>
      ${isUser ? `<img class="chat-avatar" src="${avatarSrc}" width="42" height="42" alt="${avatarAlt}" />` : ""}
    </article>`;
}

function appendMessage(message) {
  const messageId = message.id || createMessageId(message.role);
  chatLog.insertAdjacentHTML("beforeend", renderMessage({ ...message, id: messageId }));
  rememberAssistantMessage(messageId, message);
  scrollChatToBottom();
  return messageId;
}

function replaceMessage(messageId, message) {
  const existing = document.getElementById(messageId);
  if (!existing) {
    appendMessage(message);
    return;
  }
  existing.outerHTML = renderMessage({ ...message, id: messageId });
  rememberAssistantMessage(messageId, message);
  scrollChatToBottom();
}

function rememberAssistantMessage(messageId, message) {
  if (message.role !== "assistant" || message.thinking || message.error) return;
  assistantMessages.set(messageId, {
    content: String(message.content || ""),
    sources: message.sources || [],
    missingFields: message.missingFields || [],
    quality: message.quality || null,
  });
}

function renderThinkingMessage() {
  return appendMessage({
    id: createMessageId("thinking"),
    role: "assistant",
    content: THINKING_TEXT,
    thinking: true,
  });
}

function renderInitialChat() {
  chatLog.innerHTML = renderMessage({
    role: "assistant",
    content: INITIAL_CHAT_MESSAGE,
    showReferences: false,
    showFollowUps: false,
    showPortfolioActions: false,
  });
  scrollChatToBottom();
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function createMessageId(role) {
  return `deepseek-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question.length) {
    setStatus("请先输入问题。", true);
    questionInput.focus();
    return;
  }

  questionInput.value = "";
  await askDeepSeek({ question });
});

async function askDeepSeek({ question, displayQuestion = question, workflowKey = "" }) {
  if (deepSeekRagJobPolling) return;
  deepSeekRagJobPolling = true;
  const requestPayload = buildRagRequestPayload(question, conversationSummary);
  appendMessage({ role: "user", content: displayQuestion });
  questionInput.value = "";
  const thinkingMessageId = renderThinkingMessage();
  const startedAt = performance.now();

  try {
    setWorking(true);
    startProgressStatus(requestPayload.usePersonalContext);
    setStatus(`正在提交${ASSISTANT_NAME}后台问答任务...`);
    const job = await requestJson(DEEPSEEK_RAG_JOB_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });
    rememberPendingDeepSeekRagJob({
      jobId: job.jobId,
      question,
      displayQuestion,
      workflowKey,
      usePersonalContext: requestPayload.usePersonalContext === true,
    });
    setStatus(`问答任务已提交，${ASSISTANT_NAME}正在后台生成回答。`);
    const data = await waitForDeepSeekRagJob(job.jobId);
    const sources = IS_INSPIRATION_PROFILE ? [] : data.sources || [];
    const missingFields = IS_INSPIRATION_PROFILE ? [] : data.missingFields || [];
    const answer = data.answer || `${ASSISTANT_NAME}暂无回答。`;
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: answer,
      sources,
      missingFields,
      showReferences: !IS_INSPIRATION_PROFILE,
      quality: IS_INSPIRATION_PROFILE ? null : data.quality || null,
    });
    updateConversationSummary({ question: displayQuestion, answer });
    conversationArchive.push({
      question: displayQuestion,
      answer,
      sources: sources.map((source) => source.title),
      missingFields,
      createdAt: new Date().toISOString(),
    });
    trackDeepSeekUsageEvent("deepseek_rag_question_success", {
      metrics: {
        completionFields: 1,
        generatedActivityCount: sources.length,
        durationMs: performance.now() - startedAt,
      },
      details: {
        workflowKey,
        questionLength: question.length,
        missingFieldCount: missingFields.length,
      },
    });
    clearPendingDeepSeekRagJob();
    setStatus(IS_INSPIRATION_PROFILE ? "已回复" : `已回复，附 ${sources.length} 条申请档案依据`);
  } catch (error) {
    if (error.final || /not found/i.test(error.message)) clearPendingDeepSeekRagJob();
    const message = getAiGenerationErrorMessage(error, {
      operation: `${ASSISTANT_NAME}回答生成`,
      fallbackMessage: `${ASSISTANT_NAME}问答失败，请稍后重试。`,
    });
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: message,
      error: true,
    });
    trackDeepSeekUsageEvent("deepseek_rag_question_failure", {
      metrics: { completionFields: 1, durationMs: performance.now() - startedAt },
      details: { workflowKey, questionLength: question.length, failureReason: message },
    });
    setStatus(message, true);
  } finally {
    deepSeekRagJobPolling = false;
    setWorking(false);
    questionInput.focus();
  }
}

async function resumePendingDeepSeekRagJob() {
  const pendingJob = readPendingDeepSeekRagJob();
  if (!pendingJob || deepSeekRagJobPolling) return;

  deepSeekRagJobPolling = true;
  appendMessage({ role: "user", content: pendingJob.displayQuestion || pendingJob.question });
  const thinkingMessageId = renderThinkingMessage();
  const startedAt = performance.now();

  try {
    setWorking(true);
    startProgressStatus(pendingJob.usePersonalContext === true);
    setStatus(`正在接回上次未完成的${ASSISTANT_NAME}问答任务...`);
    const data = await waitForDeepSeekRagJob(pendingJob.jobId);
    const sources = IS_INSPIRATION_PROFILE ? [] : data.sources || [];
    const missingFields = IS_INSPIRATION_PROFILE ? [] : data.missingFields || [];
    const answer = data.answer || `${ASSISTANT_NAME}暂无回答。`;
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: answer,
      sources,
      missingFields,
      showReferences: !IS_INSPIRATION_PROFILE,
      quality: IS_INSPIRATION_PROFILE ? null : data.quality || null,
    });
    updateConversationSummary({ question: pendingJob.displayQuestion || pendingJob.question, answer });
    conversationArchive.push({
      question: pendingJob.displayQuestion || pendingJob.question,
      answer,
      sources: sources.map((source) => source.title),
      missingFields,
      createdAt: new Date().toISOString(),
    });
    trackDeepSeekUsageEvent("deepseek_rag_question_success", {
      metrics: {
        completionFields: 1,
        generatedActivityCount: sources.length,
        durationMs: performance.now() - startedAt,
      },
      details: {
        workflowKey: pendingJob.workflowKey || "",
        questionLength: pendingJob.question.length,
        missingFieldCount: missingFields.length,
        resumed: true,
      },
    });
    clearPendingDeepSeekRagJob();
    setStatus(IS_INSPIRATION_PROFILE ? "已回复" : `已回复，附 ${sources.length} 条申请档案依据`);
  } catch (error) {
    if (error.final || /not found/i.test(error.message)) clearPendingDeepSeekRagJob();
    const message = getAiGenerationErrorMessage(error, {
      operation: `${ASSISTANT_NAME}回答生成`,
      fallbackMessage: `${ASSISTANT_NAME}问答失败，请稍后重试。`,
    });
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: message,
      error: true,
    });
    setStatus(message, true);
  } finally {
    deepSeekRagJobPolling = false;
    setWorking(false);
    questionInput.focus();
  }
}

function updateConversationSummary({ question, answer }) {
  conversationTurns.push(
    [
      `问：${compactText(question, 180)}`,
      `答：${compactText(answer, 320)}`,
    ].join("\n"),
  );
  const summary = conversationTurns.slice(-MAX_MEMORY_TURNS).join("\n\n");
  conversationSummary = summary.length > MAX_MEMORY_CHARS
    ? summary.slice(summary.length - MAX_MEMORY_CHARS)
    : summary;
}

function compactText(value, limit) {
  return String(value || "")
    .replace(/[#*_`>\-[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

async function saveAnswerAsActions(messageId, button) {
  const message = assistantMessages.get(messageId);
  if (!message) return;
  const actions = extractActionChecklist(message.content);
  if (!actions.length) {
    setStatus("这条回答里没有识别到可保存的行动项。", true);
    return;
  }
  const saved = await savePortfolioUpdate((portfolio) => ({
    ...portfolio,
    planningActions: mergePortfolioItems(
      portfolio.planningActions || [],
      actions.map((text) => ({ text, source: ASSISTANT_NAME })),
      "text",
    ),
  }), "行动清单已保存到我的申请档案", button);
  if (saved) {
    trackDeepSeekUsageEvent("deepseek_answer_save", {
      metrics: { generatedActivityCount: actions.length },
      details: { saveType: "actions" },
    });
  }
}

function exportDeepSeekConversation() {
  const payload = {
    exportedAt: new Date().toISOString(),
    conversationSummary,
    turns: conversationArchive,
  };
  trackDeepSeekUsageEvent("deepseek_review_export", {
    metrics: { generatedActivityCount: conversationArchive.length },
    details: { format: "json" },
  });
  downloadTextFile(
    `${IS_INSPIRATION_PROFILE ? "inspiration" : "application"}-robot-review-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
  setStatus("对话复盘已导出");
}

async function saveDeepSeekReviewVersion() {
  if (!conversationArchive.length) {
    setStatus("暂无可保存的对话复盘。", true);
    return;
  }
  const saved = await savePortfolioUpdate((portfolio) => ({
    ...portfolio,
    deepSeekNotes: mergePortfolioItems(
      portfolio.deepSeekNotes || [],
      [{
        title: `${ASSISTANT_NAME}对话复盘 ${new Date().toLocaleString("zh-CN")}`,
        content: conversationArchive
          .map((turn, index) => [
            `第 ${index + 1} 轮：${turn.question}`,
            turn.answer,
          ].join("\n"))
          .join("\n\n---\n\n")
          .slice(0, 2400),
        source: ASSISTANT_NAME,
      }],
      "content",
    ),
  }), `${ASSISTANT_NAME}对话复盘已保存到我的申请档案`, saveReviewButton);
  if (saved) {
    trackDeepSeekUsageEvent("deepseek_review_save", {
      metrics: { generatedActivityCount: conversationArchive.length },
    });
  }
}

async function saveAnswerAsNote(messageId, button) {
  const message = assistantMessages.get(messageId);
  if (!message) return;
  const note = {
    title: extractNoteTitle(message.content),
    content: String(message.content || "").trim().slice(0, 2400),
    source: ASSISTANT_NAME,
  };
  const saved = await savePortfolioUpdate((portfolio) => ({
    ...portfolio,
    deepSeekNotes: mergePortfolioItems(portfolio.deepSeekNotes || [], [note], "content"),
  }), "回答摘录已保存到我的申请档案", button);
  if (saved) {
    trackDeepSeekUsageEvent("deepseek_answer_save", {
      metrics: { generatedActivityCount: 1 },
      details: { saveType: "note" },
    });
  }
}

async function savePortfolioUpdate(updater, successMessage, button) {
  const previousLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "保存中...";
  }
  try {
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    await requestJson(MY_ACTIVITIES_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify(updater(portfolio)),
    });
    setStatus(successMessage);
    return true;
  } catch (error) {
    setStatus(error.message, true);
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }
}

function extractActionChecklist(content) {
  const section = extractMarkdownSection(content, [
    "下一步行动",
    "未来 30 天优先补强项",
    "下一步核验清单",
    "推荐补强项目或行动",
    "申请材料清单",
  ]) || content;
  return section
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[-*+]|\d+[.)]|[（(]?\d+[）)])\s*/, "")
        .replace(/^\s*\[[ xX]\]\s*/, "")
        .trim(),
    )
    .filter((line) => line && !line.startsWith("#") && line.length >= 4)
    .slice(0, 8);
}

function extractMarkdownSection(content, headings) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  let isCollecting = false;
  const collected = [];
  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s*(.+?)\s*$/u)?.[1]?.trim();
    if (heading) {
      if (isCollecting) break;
      isCollecting = headings.some((item) => heading.includes(item));
      continue;
    }
    if (isCollecting) collected.push(line);
  }
  return collected.join("\n").trim();
}

function extractNoteTitle(content) {
  const heading = String(content || "").match(/^#{1,4}\s*(.+)$/m)?.[1]?.trim();
  return heading ? heading.slice(0, 60) : `${ASSISTANT_NAME}回答摘录`;
}

function mergePortfolioItems(existingItems, newItems, key) {
  const seen = new Set();
  return [...existingItems, ...newItems]
    .filter((item) => {
      const value = compactText(item?.[key], 160).toLowerCase();
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(-20);
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

workflowRegion?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deepseek-workflow]");
  if (!button || button.disabled) return;
  const workflow = WORKFLOW_PROMPTS[button.dataset.deepseekWorkflow];
  if (!workflow) return;
  askDeepSeek({
    question: workflow.prompt,
    displayQuestion: `启动 Workflow：${workflow.label}`,
    workflowKey: button.dataset.deepseekWorkflow,
  });
});

chatLog.addEventListener("click", (event) => {
  const answerToggleButton = event.target.closest("[data-deepseek-answer-toggle]");
  if (answerToggleButton) {
    const answerBubble = answerToggleButton.closest(".chat-bubble");
    const answerPreview = answerBubble?.querySelector(".chat-answer-preview");
    const answerContent = answerBubble?.querySelector(".chat-answer-content");
    if (!answerPreview || !answerContent) return;
    const expanded = answerToggleButton.getAttribute("aria-expanded") === "true";
    const nextExpanded = !expanded;
    answerPreview.hidden = nextExpanded;
    answerContent.hidden = !nextExpanded;
    answerToggleButton.setAttribute("aria-expanded", String(nextExpanded));
    answerToggleButton.textContent = nextExpanded ? "收起全文" : "展开全文";
    return;
  }
  const saveActionsButton = event.target.closest("[data-deepseek-save-actions]");
  if (saveActionsButton) {
    saveAnswerAsActions(saveActionsButton.dataset.deepseekSaveActions, saveActionsButton);
    return;
  }
  const saveNoteButton = event.target.closest("[data-deepseek-save-note]");
  if (saveNoteButton) {
    saveAnswerAsNote(saveNoteButton.dataset.deepseekSaveNote, saveNoteButton);
    return;
  }
  const button = event.target.closest("[data-deepseek-follow-up]");
  if (!button || askButton.disabled) return;
  const followUp = FOLLOW_UP_ACTIONS[Number(button.dataset.deepseekFollowUp)];
  if (!followUp) return;
  askDeepSeek({
    question: followUp.prompt,
    displayQuestion: `追问：${followUp.label}`,
  });
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || askButton.disabled) return;
  event.preventDefault();
  form.requestSubmit();
});

clearButton.addEventListener("click", () => {
  questionInput.value = "";
  clearPendingDeepSeekRagJob();
  conversationSummary = "";
  conversationTurns.length = 0;
  conversationArchive.length = 0;
  assistantMessages.clear();
  renderInitialChat();
  setStatus("等待问题");
  questionInput.focus();
});

exportButton?.addEventListener("click", exportDeepSeekConversation);
saveReviewButton?.addEventListener("click", saveDeepSeekReviewVersion);
resumePendingDeepSeekRagJob();
