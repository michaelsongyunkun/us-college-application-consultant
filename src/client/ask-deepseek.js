import { escapeHtml } from "./html-utils.mjs";

const form = document.querySelector("#deepSeekQuestionForm");
const questionInput = document.querySelector("#deepSeekQuestion");
const askButton = document.querySelector("#deepSeekAskButton");
const clearButton = document.querySelector("#deepSeekClearButton");
const status = document.querySelector("#deepSeekAskStatus");
const answerPanel = document.querySelector("#deepSeekAnswer");
const sourcesPanel = document.querySelector("#deepSeekSources");

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

function renderAnswer(answer) {
  const blocks = String(answer || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) {
    answerPanel.innerHTML = '<p class="resource-empty">DeepSeek 暂无回答。</p>';
    return;
  }
  answerPanel.innerHTML = blocks
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function renderSources(sources = []) {
  if (!sources.length) {
    sourcesPanel.innerHTML = '<p class="resource-empty">本次没有检索到高相关资料。</p>';
    return;
  }
  sourcesPanel.innerHTML = sources
    .map(
      (source, index) => `
        <article class="rag-source-card">
          <div class="rag-source-card-header">
            <span>${index + 1}</span>
            <strong>${escapeHtml(source.typeLabel || source.type)}</strong>
          </div>
          <h3>${escapeHtml(source.title)}</h3>
          <p>${escapeHtml(source.snippet)}</p>
        </article>`,
    )
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question.length) {
    setStatus("请先输入问题。", true);
    questionInput.focus();
    return;
  }

  try {
    setWorking(true);
    setStatus("正在检索资料并询问 DeepSeek...");
    answerPanel.innerHTML = '<p class="resource-empty">DeepSeek 正在生成回答...</p>';
    renderSources([]);
    const data = await requestJson("/api/deepseek-rag", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    renderAnswer(data.answer);
    renderSources(data.sources || []);
    setStatus(`已检索 ${data.sources?.length || 0} 条参考资料`);
  } catch (error) {
    setStatus(error.message, true);
    answerPanel.innerHTML = `<p class="resource-empty">${escapeHtml(error.message)}</p>`;
    renderSources([]);
  } finally {
    setWorking(false);
  }
});

clearButton.addEventListener("click", () => {
  questionInput.value = "";
  answerPanel.innerHTML = '<p class="resource-empty">提交问题后，这里会显示 DeepSeek 的回答。</p>';
  renderSources([]);
  setStatus("等待问题");
  questionInput.focus();
});
