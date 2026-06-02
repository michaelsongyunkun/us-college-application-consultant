import {
  filterMajors,
  getMajorCategories,
  parseMajorsMarkdown,
} from "../domain/major-encyclopedia.mjs?v=20260602-major-encyclopedia";
import { renderMarkdown } from "../domain/markdown-renderer.mjs?v=20260531-deepseek-markdown";
import {
  DEFAULT_VISIBLE_RESULT_LIMIT,
  expandVisibleResultLimit,
  getVisibleResultPage,
} from "./visible-results.mjs";

const status = document.querySelector("#majorStatus");
const searchInput = document.querySelector("#majorSearch");
const categoryTabs = document.querySelector("#majorCategoryTabs");
const categoryTitle = document.querySelector("#majorCategoryTitle");
const majorCount = document.querySelector("#majorCount");
const majorList = document.querySelector("#majorList");
const loadMoreMajorsButton = document.querySelector("#loadMoreMajors");
const deepSeekMajorMatchButton = document.querySelector("#deepSeekMajorMatchButton");
const deepSeekMajorStatus = document.querySelector("#deepSeekMajorStatus");
const deepSeekMajorResult = document.querySelector("#deepSeekMajorResult");

let majors = [];
let activeCategory = "all";
let visibleMajorLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
let matchingMajorCount = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayValue(value) {
  return value || "暂未提供";
}

function summary(value) {
  const text = displayValue(value);
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

function compactCategory(value) {
  return String(value || "全部专业").replace(/、/g, " / ");
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setDeepSeekStatus(message, isError = false) {
  deepSeekMajorStatus.textContent = message;
  deepSeekMajorStatus.classList.toggle("error", isError);
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

function renderMajorDetails(major) {
  return `
    <div><dt>本科开设核验</dt><dd>${escapeHtml(displayValue(major.verification))}</dd></div>
    <div><dt>常见学习内容</dt><dd>${escapeHtml(displayValue(major.learningContent))}</dd></div>
    <div><dt>就业方向</dt><dd>${escapeHtml(displayValue(major.careerPaths))}</dd></div>
    <div><dt>专业强校</dt><dd>${escapeHtml(displayValue(major.strongSchools))}</dd></div>
    <div><dt>录取难度</dt><dd>${escapeHtml(displayValue(major.admissionDifficulty))}</dd></div>
    <div><dt>申请检索口径</dt><dd>${escapeHtml(displayValue(major.searchName))}</dd></div>
    <div><dt>复查说明</dt><dd>${escapeHtml(displayValue(major.reviewNote))}</dd></div>`;
}

function renderMajorCard(major) {
  const detailId = `major-details-${major.id}`;
  const title = [major.englishName, major.chineseName].filter(Boolean).join(" ");
  return `
    <article class="school-card major-card">
      <div class="school-card-header">
        <div>
          <p class="case-index">${escapeHtml(major.category)} · #${escapeHtml(major.index)}</p>
          <h4>${escapeHtml(title || major.title)}</h4>
        </div>
        <button
          class="school-toggle secondary"
          type="button"
          data-major-toggle="${escapeHtml(major.id)}"
          aria-expanded="false"
          aria-controls="${escapeHtml(detailId)}"
        >展开详情</button>
      </div>
      <p class="school-summary">${escapeHtml(summary(major.description))}</p>
      <dl id="${escapeHtml(detailId)}" class="school-details is-hidden">
        ${renderMajorDetails(major)}
      </dl>
    </article>`;
}

function renderCategoryTabs() {
  const tabs = [
    ["all", "全部专业"],
    ...getMajorCategories(majors).map((category) => [category, compactCategory(category)]),
  ];
  categoryTabs.innerHTML = tabs
    .map(([value, label], index) => `
      <button
        class="resource-tab${value === activeCategory ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${value === activeCategory ? "true" : "false"}"
        data-major-category="${escapeHtml(value)}"
        ${index === 0 ? 'id="majorAllTab"' : ""}
      >${escapeHtml(label)}</button>`)
    .join("");
}

function renderMajors() {
  const query = searchInput.value.trim();
  const matchingMajors = filterMajors(majors, { category: activeCategory, query });
  const page = getVisibleResultPage(matchingMajors, visibleMajorLimit);
  matchingMajorCount = page.totalCount;

  categoryTitle.textContent = activeCategory === "all" ? "全部专业" : activeCategory;
  majorCount.textContent = `显示 ${page.shownCount} / ${page.totalCount} 个`;
  setStatus(`已载入 ${majors.length} 个专业`);
  majorList.innerHTML = page.totalCount
    ? page.visibleItems.map(renderMajorCard).join("")
    : '<p class="resource-empty">没有匹配的专业资料。</p>';
  loadMoreMajorsButton.classList.toggle("is-hidden", !page.hasMore);
}

function switchCategory(category) {
  activeCategory = category;
  visibleMajorLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
  categoryTabs
    .querySelectorAll("[data-major-category]")
    .forEach((tab) => {
      const active = tab.dataset.majorCategory === category;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  renderMajors();
}

async function runDeepSeekMajorMatch() {
  const prompt = [
    "请根据我的申请档案自动匹配适合探索的美国本科专业。",
    "必须优先使用专业百科 RAG 中的专业介绍、常见学习内容、就业方向、专业强校、录取难度和建议申请检索口径。",
    "也请结合我的申请档案、资源库和院校百科，判断当前活动、成绩、课程和职业/岗位兴趣能支撑哪些专业。",
    "请输出：",
    "## 核心结论",
    "## 推荐专业优先级表",
    "表格列包括：专业、匹配理由、需要补强的证据、适合检索的英文口径。",
    "## 不建议优先选择的方向",
    "## 下一步行动",
    "如果我的申请档案信息不足，请明确列出需要补充的字段。",
  ].join("\n");

  deepSeekMajorMatchButton.disabled = true;
  setDeepSeekStatus("正在检索专业百科 RAG 与我的申请档案...");
  deepSeekMajorResult.innerHTML = '<p class="resource-empty">DeepSeek 正在生成专业匹配建议...</p>';
  try {
    const data = await requestJson("/api/deepseek-rag", {
      method: "POST",
      body: JSON.stringify({ question: prompt }),
    });
    deepSeekMajorResult.innerHTML = `
      <div class="major-ai-answer">${renderMarkdown(data.answer || "")}</div>
      <details class="chat-references">
        <summary><span>参考资料</span><small>${(data.sources || []).length} 条线索</small></summary>
        <div class="chat-source-grid">
          ${(data.sources || []).map((source, index) => `
            <article class="chat-source-card">
              <div class="chat-source-card-header">
                <span>${index + 1}</span>
                <strong>${escapeHtml(source.typeLabel || source.type)}</strong>
              </div>
              <h4>${escapeHtml(source.title)}</h4>
              <div class="chat-source-snippet">${renderMarkdown(source.snippet || "")}</div>
            </article>`).join("")}
        </div>
      </details>`;
    setDeepSeekStatus(`已生成匹配，附 ${(data.sources || []).length} 条参考资料`);
  } catch (error) {
    deepSeekMajorResult.innerHTML = `<p class="resource-empty">${escapeHtml(error.message)}</p>`;
    setDeepSeekStatus(error.message, true);
  } finally {
    deepSeekMajorMatchButton.disabled = false;
  }
}

majorList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-major-toggle]");
  if (!toggle) return;
  const detail = document.querySelector(`#${toggle.getAttribute("aria-controls")}`);
  if (!detail) return;
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  toggle.textContent = expanded ? "展开详情" : "收起详情";
  detail.classList.toggle("is-hidden", expanded);
});

categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-major-category]");
  if (!tab) return;
  switchCategory(tab.dataset.majorCategory);
});

searchInput.addEventListener("input", () => {
  visibleMajorLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
  renderMajors();
});

loadMoreMajorsButton.addEventListener("click", () => {
  visibleMajorLimit = expandVisibleResultLimit(visibleMajorLimit, matchingMajorCount);
  renderMajors();
});

deepSeekMajorMatchButton.addEventListener("click", runDeepSeekMajorMatch);

async function loadMajors() {
  try {
    const response = await fetch("./data/majors.md");
    if (!response.ok) throw new Error("majors unavailable");
    majors = parseMajorsMarkdown(await response.text());
    renderCategoryTabs();
    renderMajors();
  } catch {
    setStatus("暂时无法读取专业百科资料库", true);
    loadMoreMajorsButton.classList.add("is-hidden");
    majorList.innerHTML = '<p class="resource-empty">专业资料暂不可用，请稍后重试。</p>';
  }
}

loadMajors();
