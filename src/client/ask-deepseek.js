import { escapeHtml } from "./html-utils.mjs";
import { renderMarkdown } from "../domain/markdown-renderer.mjs?v=20260531-deepseek-markdown";

const form = document.querySelector("#deepSeekQuestionForm");
const questionInput = document.querySelector("#deepSeekQuestion");
const askButton = document.querySelector("#deepSeekAskButton");
const clearButton = document.querySelector("#deepSeekClearButton");
const status = document.querySelector("#deepSeekAskStatus");
const chatLog = document.querySelector("#deepSeekChatLog");
const workflowRegion = document.querySelector("#deepSeekWorkflows");

const USER_AVATAR_SRC = "./assets/logo-mark.svg";
const DEEPSEEK_AVATAR_SRC = "./assets/deepseek-avatar.svg";
const THINKING_TEXT = "......";
const PROGRESS_STATUSES = [
  "正在检索你的申请档案...",
  "正在整理参考资料...",
  "DeepSeek 正在生成建议...",
];
const STANDARD_RESPONSE_SECTIONS = [
  "最终输出请只使用以下报告结构：",
  "## 核心结论",
  "## 依据与证据",
  "## 主要风险",
  "## 下一步行动",
  "不要在正文末尾单独输出“参考资料”章节；页面会把检索来源收起在回答下方的参考资料下拉区。",
].join("\n");
const FOLLOW_UP_ACTIONS = [
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
const WORKFLOW_PROMPTS = {
  "profile-audit": {
    label: "申请档案体检",
    prompt: [
      "请进行一次申请档案体检。",
      "请读取我的个人申请档案、学生备份、成绩档案、课外活动、竞赛、夏校、推荐信与选校计划。",
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
      "请结合我的目标专业、个人申请档案、学生备份和资料库，判断现有活动是否形成清晰主线，并推荐可以深化或补强的方向。",
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
      "请结合我的年级、目标专业、个人申请档案、学生备份、可用资源库和身份/资格限制，筛选最值得优先考虑的资源。",
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
      "请结合我的个人申请档案、学生备份、目标专业、选校计划和院校百科，分析目标学校看重什么、我目前是否匹配、还缺哪些证据。",
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

let progressStatusTimer = null;

for (const workflow of Object.values(WORKFLOW_PROMPTS)) {
  workflow.prompt = `${workflow.prompt}\n\n${STANDARD_RESPONSE_SECTIONS}`;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function startProgressStatus() {
  stopProgressStatus();
  let index = 0;
  setStatus(PROGRESS_STATUSES[index]);
  progressStatusTimer = window.setInterval(() => {
    index = Math.min(index + 1, PROGRESS_STATUSES.length - 1);
    setStatus(PROGRESS_STATUSES[index]);
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
  const response = await fetch(url, {
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

function renderBubbleContent(content, { isUser = false, error = false } = {}) {
  if (isUser || error) return renderPlainText(content);
  return renderMarkdown(content) || renderPlainText(content);
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
    <section class="chat-references" aria-label="参考资料">
      <h3>参考资料</h3>
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
    <details class="chat-references" aria-label="参考资料">
      <summary>
        <span>参考资料</span>
        <small>${summaryText}</small>
      </summary>
      <div class="chat-source-grid">${sourceBody}</div>
    </details>`;
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

function renderMessage({
  id = "",
  role,
  content,
  sources = [],
  thinking = false,
  error = false,
  showReferences = true,
  showFollowUps = true,
}) {
  const isUser = role === "user";
  const avatarSrc = isUser ? USER_AVATAR_SRC : DEEPSEEK_AVATAR_SRC;
  const avatarAlt = isUser ? "US College Compass" : "DeepSeek";
  const speaker = isUser ? "你" : "DeepSeek";
  const bubbleContent = thinking
    ? `<span class="thinking-dots" aria-label="DeepSeek 正在思考">${THINKING_TEXT}</span>`
    : renderBubbleContent(content, { isUser, error });
  const referenceContent = !isUser && !thinking && !error && showReferences ? renderGuidedSourceCards(sources) : "";
  const followUpContent = !isUser && !thinking && !error && showFollowUps ? renderFollowUpActions() : "";
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";

  return `
    <article${idAttribute} class="chat-message ${isUser ? "user" : "assistant"}${thinking ? " is-thinking" : ""}${error ? " is-error" : ""}">
      ${isUser ? "" : `<img class="chat-avatar" src="${avatarSrc}" width="42" height="42" alt="${avatarAlt}" />`}
      <div class="chat-message-body">
        <p class="chat-speaker">${escapeHtml(speaker)}</p>
        <div class="chat-bubble">${bubbleContent}</div>
        ${referenceContent}
        ${followUpContent}
      </div>
      ${isUser ? `<img class="chat-avatar" src="${avatarSrc}" width="42" height="42" alt="${avatarAlt}" />` : ""}
    </article>`;
}

function appendMessage(message) {
  const messageId = message.id || createMessageId(message.role);
  chatLog.insertAdjacentHTML("beforeend", renderMessage({ ...message, id: messageId }));
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
  scrollChatToBottom();
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
    content:
      "你好，我是你的申请规划智能体。你可以问我选校策略、活动补强、推荐信、成绩档案或项目取舍；我会结合你的个人申请档案和已保存资料回答，参考资料会收起在回答下方，需要核验时再展开。涉及截止日期、费用、资格或官方政策时，请以申请年度官网为准。",
    showReferences: false,
    showFollowUps: false,
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

async function askDeepSeek({ question, displayQuestion = question }) {
  appendMessage({ role: "user", content: displayQuestion });
  questionInput.value = "";
  const thinkingMessageId = renderThinkingMessage();

  try {
    setWorking(true);
    startProgressStatus();
    const data = await requestJson("/api/deepseek-rag", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    const sources = data.sources || [];
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: data.answer || "DeepSeek 暂无回答。",
      sources,
    });
    setStatus(`已回复，附 ${sources.length} 条参考资料`);
  } catch (error) {
    stopProgressStatus();
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: error.message,
      error: true,
    });
    setStatus(error.message, true);
  } finally {
    setWorking(false);
    questionInput.focus();
  }
}

workflowRegion?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deepseek-workflow]");
  if (!button || button.disabled) return;
  const workflow = WORKFLOW_PROMPTS[button.dataset.deepseekWorkflow];
  if (!workflow) return;
  askDeepSeek({
    question: workflow.prompt,
    displayQuestion: `启动 Workflow：${workflow.label}`,
  });
});

chatLog.addEventListener("click", (event) => {
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
  renderInitialChat();
  setStatus("等待问题");
  questionInput.focus();
});
