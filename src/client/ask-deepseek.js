import { escapeHtml } from "./html-utils.mjs";
import { renderMarkdown } from "../domain/markdown-renderer.mjs?v=20260531-deepseek-markdown";

const form = document.querySelector("#deepSeekQuestionForm");
const questionInput = document.querySelector("#deepSeekQuestion");
const askButton = document.querySelector("#deepSeekAskButton");
const clearButton = document.querySelector("#deepSeekClearButton");
const status = document.querySelector("#deepSeekAskStatus");
const chatLog = document.querySelector("#deepSeekChatLog");

const USER_AVATAR_SRC = "./assets/logo-mark.svg";
const DEEPSEEK_AVATAR_SRC = "./assets/deepseek-avatar.svg";
const THINKING_TEXT = "......";

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setWorking(isWorking) {
  askButton.disabled = isWorking;
  clearButton.disabled = isWorking;
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

  appendMessage({ role: "user", content: question });
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
