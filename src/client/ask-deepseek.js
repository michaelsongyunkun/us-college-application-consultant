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
      "## 参考资料",
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
      "## 参考资料",
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
      "## 参考资料",
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
      "## 参考资料",
      "如果推荐信资料不足，请列出需要补充的推荐人关系、课程表现和活动证据。",
    ].join("\n"),
  },
};

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
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
              <p>${escapeHtml(source.snippet)}</p>
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

function renderMessage({ id = "", role, content, sources = [], thinking = false, error = false }) {
  const isUser = role === "user";
  const avatarSrc = isUser ? USER_AVATAR_SRC : DEEPSEEK_AVATAR_SRC;
  const avatarAlt = isUser ? "US College Compass" : "DeepSeek";
  const speaker = isUser ? "你" : "DeepSeek";
  const bubbleContent = thinking
    ? `<span class="thinking-dots" aria-label="DeepSeek 正在思考">${THINKING_TEXT}</span>`
    : renderBubbleContent(content, { isUser, error });
  const referenceContent = !isUser && !thinking && !error ? renderSourceCards(sources) : "";
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";

  return `
    <article${idAttribute} class="chat-message ${isUser ? "user" : "assistant"}${thinking ? " is-thinking" : ""}${error ? " is-error" : ""}">
      ${isUser ? "" : `<img class="chat-avatar" src="${avatarSrc}" width="42" height="42" alt="${avatarAlt}" />`}
      <div class="chat-message-body">
        <p class="chat-speaker">${escapeHtml(speaker)}</p>
        <div class="chat-bubble">${bubbleContent}</div>
        ${referenceContent}
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
      "你好，我是你的申请规划智能体。你可以问我选校策略、活动补强、推荐信、成绩档案或项目取舍；我会结合你的个人申请档案和已保存资料回答，并在结尾列出参考资料。涉及截止日期、费用、资格或官方政策时，请以申请年度官网为准。",
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
    setStatus("DeepSeek 思考中......");
    const data = await requestJson("/api/deepseek-rag", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    const sources = data.sources || [];
    replaceMessage(thinkingMessageId, {
      role: "assistant",
      content: data.answer || "DeepSeek 暂无回答。",
      sources,
    });
    setStatus(`已回复，附 ${sources.length} 条参考资料`);
  } catch (error) {
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
