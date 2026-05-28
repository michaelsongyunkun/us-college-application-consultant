import { filterSchools, parseSchoolsMarkdown } from "../domain/school-encyclopedia.mjs?v=20260528-international-schools";
import {
  DEFAULT_VISIBLE_RESULT_LIMIT,
  expandVisibleResultLimit,
  getVisibleResultPage,
} from "./visible-results.mjs";

const status = document.querySelector("#schoolStatus");
const searchInput = document.querySelector("#schoolSearch");
const universityTab = document.querySelector("#universityTab");
const liberalArtsTab = document.querySelector("#liberalArtsTab");
const internationalTab = document.querySelector("#internationalTab");
const categoryTitle = document.querySelector("#schoolCategoryTitle");
const schoolCount = document.querySelector("#schoolCount");
const schoolList = document.querySelector("#schoolList");
const loadMoreSchoolsButton = document.querySelector("#loadMoreSchools");

let schools = [];
let activeCategory = "university";
let visibleSchoolLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
let matchingSchoolCount = 0;

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
  return text.length > 110 ? `${text.slice(0, 110)}...` : text;
}

function categoryLabel(category) {
  return {
    university: "综合大学 T80",
    "liberal-arts": "文理学院 TOP50",
    international: "英港澳加院校",
  }[category] || "院校资料";
}

function renderRankingValue(label, value) {
  return value ? `${label}：${value}` : "";
}

function renderInternationalDetails(school) {
  const rankingText = [
    renderRankingValue("QS 2026", school.qsRanking),
    renderRankingValue("THE 2026", school.theRanking),
    renderRankingValue("ARWU 2025", school.arwuRanking),
    renderRankingValue("U.S. News 2025-2026", school.usNewsRanking),
    renderRankingValue("平均排名", school.averageRanking),
  ].filter(Boolean).join("；");
  const budgetText = [
    renderRankingValue("人民币/年", school.budgetRmb),
    renderRankingValue("本币/年", school.localBudget),
    school.budgetNote,
  ].filter(Boolean).join("；");
  const website = school.website
    ? `<a href="${escapeHtml(school.website)}" target="_blank" rel="noreferrer">${escapeHtml(school.website)}</a>`
    : displayValue(school.website);

  return `
    <div><dt>地区与官网</dt><dd>${escapeHtml(displayValue(school.region))} · ${website}</dd></div>
    <div><dt>排名</dt><dd>${escapeHtml(displayValue(rankingText))}</dd></div>
    <div><dt>预算</dt><dd>${escapeHtml(displayValue(budgetText))}</dd></div>
    <div><dt>本科申请要求</dt><dd>${escapeHtml(displayValue(school.applicationRequirement))}</dd></div>
    <div><dt>英语要求</dt><dd>${escapeHtml(displayValue(school.englishRequirement))}</dd></div>
    <div><dt>热门专业</dt><dd>${escapeHtml(displayValue(school.popularMajors))}</dd></div>
    <div><dt>学校风格</dt><dd>${escapeHtml(displayValue(school.schoolStyle))}</dd></div>`;
}

function renderDomesticDetails(school) {
  return `
    <div><dt>申请与文书</dt><dd>${escapeHtml(displayValue(school.applicationAndEssays))}</dd></div>
    <div><dt>学校特色</dt><dd>${escapeHtml(displayValue(school.schoolFeatures))}</dd></div>
    <div><dt>录取偏好</dt><dd>${escapeHtml(displayValue(school.admissionPreferences))}</dd></div>
    <div><dt>推荐信要求</dt><dd>${escapeHtml(displayValue(school.recommendationRequirements))}</dd></div>`;
}

function renderSchoolCard(school) {
  const detailId = `school-details-${school.id}`;
  const rankLabel = school.category === "international"
    ? `${school.categoryLabel} · ${school.region || "英港澳加"} · #${school.rank}`
    : `${school.categoryLabel} · #${school.rank}`;
  const details = school.category === "international" ? renderInternationalDetails(school) : renderDomesticDetails(school);
  return `
    <article class="school-card">
      <div class="school-card-header">
        <div>
          <p class="case-index">${escapeHtml(rankLabel)}</p>
          <h4>${escapeHtml(school.name)}</h4>
        </div>
        <button
          class="school-toggle secondary"
          type="button"
          data-school-toggle="${escapeHtml(school.id)}"
          aria-expanded="false"
          aria-controls="${escapeHtml(detailId)}"
        >展开详情</button>
      </div>
      <p class="school-summary">${escapeHtml(summary(school.schoolFeatures))}</p>
      <dl id="${escapeHtml(detailId)}" class="school-details is-hidden">
        ${details}
      </dl>
    </article>`;
}

function renderSchools() {
  const query = searchInput.value.trim();
  const matchingSchools = filterSchools(schools, { category: activeCategory, query });
  const page = getVisibleResultPage(matchingSchools, visibleSchoolLimit);
  matchingSchoolCount = page.totalCount;

  categoryTitle.textContent = categoryLabel(activeCategory);
  schoolCount.textContent = `显示 ${page.shownCount} / ${page.totalCount} 所`;
  status.textContent = `已载入 ${schools.length} 所院校`;
  status.classList.remove("error");
  schoolList.innerHTML = page.totalCount
    ? page.visibleItems.map(renderSchoolCard).join("")
    : '<p class="resource-empty">没有匹配的院校资料。</p>';
  loadMoreSchoolsButton.classList.toggle("is-hidden", !page.hasMore);
}

function switchCategory(category) {
  activeCategory = category;
  visibleSchoolLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
  const tabEntries = [
    ["university", universityTab],
    ["liberal-arts", liberalArtsTab],
    ["international", internationalTab],
  ];
  for (const [tabCategory, tab] of tabEntries) {
    const active = category === tabCategory;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  const activeTab = tabEntries.find(([tabCategory]) => tabCategory === category)?.[1] || universityTab;
  schoolList.setAttribute("aria-labelledby", activeTab.id);
  renderSchools();
}

schoolList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-school-toggle]");
  if (!toggle) return;
  const detail = document.querySelector(`#${toggle.getAttribute("aria-controls")}`);
  if (!detail) return;
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  toggle.textContent = expanded ? "展开详情" : "收起详情";
  detail.classList.toggle("is-hidden", expanded);
});

searchInput.addEventListener("input", () => {
  visibleSchoolLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
  renderSchools();
});
universityTab.addEventListener("click", () => switchCategory("university"));
liberalArtsTab.addEventListener("click", () => switchCategory("liberal-arts"));
internationalTab.addEventListener("click", () => switchCategory("international"));
loadMoreSchoolsButton.addEventListener("click", () => {
  visibleSchoolLimit = expandVisibleResultLimit(visibleSchoolLimit, matchingSchoolCount);
  renderSchools();
});

async function loadSchools() {
  try {
    const [domesticResponse, internationalResponse] = await Promise.all([
      fetch("./data/schools.md"),
      fetch("./data/international-schools.md"),
    ]);
    if (!domesticResponse.ok || !internationalResponse.ok) throw new Error("schools unavailable");
    schools = [
      ...parseSchoolsMarkdown(await domesticResponse.text()),
      ...parseSchoolsMarkdown(await internationalResponse.text()),
    ];
    renderSchools();
  } catch {
    status.textContent = "暂时无法读取院校资料库";
    status.classList.add("error");
    loadMoreSchoolsButton.classList.add("is-hidden");
    schoolList.innerHTML = '<p class="resource-empty">院校资料暂不可用，请稍后重试。</p>';
  }
}

loadSchools();
