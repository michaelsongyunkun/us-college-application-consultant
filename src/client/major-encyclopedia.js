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

function trackMajorUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  fetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: {
        grade: "",
        majorDirection: activeCategory === "all" ? "" : activeCategory,
      },
      metrics: {
        completionFields: activeCategory === "all" ? 0 : 1,
        generatedActivityCount: 1,
        ...metrics,
      },
      details: {
        source: "major_encyclopedia",
        activeCategory,
        ...details,
      },
    }),
  }).catch(() => {});
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
  const matchingMajors = filterMajors(majors, { category: activeCategory });
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

function splitMarkdownTableRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownDividerRow(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function formatMarkdownTableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function removeHiddenTableColumns(markdown) {
  const hiddenColumnLabels = [
    ["适合检索", "的英文口径"].join(""),
    "英文检索口径",
    "检索英文口径",
    "英文搜索口径",
    "English search wording",
  ];
  const lines = String(markdown || "").split(/\r?\n/u);
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerCells = splitMarkdownTableRow(lines[index]);
    if (!headerCells.length || !isMarkdownDividerRow(lines[index + 1])) {
      output.push(lines[index]);
      continue;
    }

    const hiddenIndexes = headerCells
      .map((cell, cellIndex) => {
        const normalizedCell = cell.replace(/\s+/g, "");
        const isHidden = hiddenColumnLabels.some((label) => normalizedCell.includes(label.replace(/\s+/g, "")))
          || (/英文/u.test(normalizedCell) && /[检搜]索/u.test(normalizedCell) && /口径/u.test(normalizedCell));
        return isHidden ? cellIndex : -1;
      })
      .filter((cellIndex) => cellIndex >= 0);

    if (!hiddenIndexes.length) {
      output.push(lines[index]);
      continue;
    }

    const keepCell = (_cell, cellIndex) => !hiddenIndexes.includes(cellIndex);
    output.push(formatMarkdownTableRow(headerCells.filter(keepCell)));
    output.push(formatMarkdownTableRow(splitMarkdownTableRow(lines[index + 1]).filter(keepCell)));
    index += 2;

    while (index < lines.length && splitMarkdownTableRow(lines[index]).length) {
      output.push(formatMarkdownTableRow(splitMarkdownTableRow(lines[index]).filter(keepCell)));
      index += 1;
    }
    index -= 1;
  }

  return output.join("\n");
}

function removeHiddenSourceSections(markdown) {
  const hiddenHeadings = [
    ["参考", "资料"].join(""),
    "Sources",
    "References",
    "来源",
  ];
  const lines = String(markdown || "").split(/\r?\n/u);
  const output = [];
  let skipping = false;

  for (const line of lines) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/u);
    if (heading) {
      const normalizedHeading = heading[1].replace(/[①②③④⑤⑥⑦⑧⑨⑩:：\s]/gu, "");
      skipping = hiddenHeadings.some((label) => normalizedHeading.includes(label));
      if (skipping) continue;
    }
    if (!skipping) output.push(line);
  }

  return output.join("\n");
}

function sanitizeDeepSeekMajorAnswer(answer) {
  return removeHiddenTableColumns(removeHiddenSourceSections(answer)).trim()
    || "DeepSeek 暂无匹配建议。";
}

async function runDeepSeekMajorMatch() {
  const prompt = [
    "请根据我的申请档案自动匹配适合探索的美国本科专业。",
    "必须优先使用专业百科 RAG 中的专业介绍、常见学习内容、就业方向、专业强校和录取难度。",
    "也请结合我的申请档案、资源库和院校百科，判断当前活动、成绩、课程和职业/岗位兴趣能支撑哪些专业。",
    "只输出匹配建议正文；不要输出来源清单，也不要展示英文检索口径列。",
    "请输出：",
    "## 核心结论",
    "## 推荐专业优先级表",
    "表格列包括：专业、匹配理由、需要补强的证据。",
    "## 不建议优先选择的方向",
    "## 下一步行动",
    "如果我的申请档案信息不足，请明确列出需要补充的字段。",
  ].join("\n");

  deepSeekMajorMatchButton.disabled = true;
  setDeepSeekStatus("正在检索专业百科 RAG 与我的申请档案...");
  deepSeekMajorResult.innerHTML = '<p class="resource-empty">DeepSeek 正在生成专业匹配建议...</p>';
  const startedAt = performance.now();
  try {
    const data = await requestJson("/api/deepseek-rag", {
      method: "POST",
      body: JSON.stringify({ question: prompt, assistantProfile: "major-match" }),
    });
    const answer = sanitizeDeepSeekMajorAnswer(data.answer || "");
    deepSeekMajorResult.innerHTML = `
      <div class="major-ai-answer">${renderMarkdown(answer)}</div>`;
    trackMajorUsageEvent("major_match_success", {
      metrics: { durationMs: performance.now() - startedAt },
    });
    setDeepSeekStatus("已生成匹配");
  } catch (error) {
    deepSeekMajorResult.innerHTML = `<p class="resource-empty">${escapeHtml(error.message)}</p>`;
    trackMajorUsageEvent("major_match_failure", {
      metrics: { generatedActivityCount: 0, durationMs: performance.now() - startedAt },
      details: { failureReason: error.message },
    });
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
