import { parseCompetitionsMarkdown } from "./competition-recommender.mjs";
import {
  classifyResource,
  enrichResourceEligibility,
  hasEligibilityConditions,
} from "./resource-eligibility.mjs";
import { parseResearchProjectsMarkdown } from "./research-project-recommender.mjs";
import { parseSummerSchoolsMarkdown } from "./summer-school-recommender.mjs";
import {
  DEFAULT_VISIBLE_RESULT_LIMIT,
  expandVisibleResultLimit,
  getVisibleResultPage,
} from "./visible-results.mjs";

const status = document.querySelector("#resourceStatus");
const searchInput = document.querySelector("#resourceSearch");
const eligibilityForm = document.querySelector("#resourceEligibilityForm");
const nationalityInput = document.querySelector("#resourceNationality");
const identityInput = document.querySelector("#resourceIdentity");
const schoolContextInput = document.querySelector("#resourceSchoolContext");
const clearEligibilityButton = document.querySelector("#clearResourceEligibility");
const competitionTab = document.querySelector("#competitionTab");
const summerSchoolTab = document.querySelector("#summerSchoolTab");
const researchProjectTab = document.querySelector("#researchProjectTab");
const competitionLibrary = document.querySelector("#competitionLibrary");
const summerSchoolLibrary = document.querySelector("#summerSchoolLibrary");
const researchProjectLibrary = document.querySelector("#researchProjectLibrary");
const competitionList = document.querySelector("#resourceCompetitionList");
const summerSchoolList = document.querySelector("#resourceSummerSchoolList");
const researchProjectList = document.querySelector("#resourceResearchProjectList");
const competitionExcludedList = document.querySelector("#resourceCompetitionExcludedList");
const summerSchoolExcludedList = document.querySelector("#resourceSummerSchoolExcludedList");
const researchProjectExcludedList = document.querySelector("#resourceResearchProjectExcludedList");
const competitionExcludedSection = document.querySelector("#competitionExcludedSection");
const summerSchoolExcludedSection = document.querySelector("#summerSchoolExcludedSection");
const researchProjectExcludedSection = document.querySelector("#researchProjectExcludedSection");
const competitionCount = document.querySelector("#competitionCount");
const summerSchoolCount = document.querySelector("#summerSchoolCount");
const researchProjectCount = document.querySelector("#researchProjectCount");
const competitionExcludedCount = document.querySelector("#competitionExcludedCount");
const summerSchoolExcludedCount = document.querySelector("#summerSchoolExcludedCount");
const researchProjectExcludedCount = document.querySelector("#researchProjectExcludedCount");
const loadMoreResourcesButton = document.querySelector("#loadMoreResources");

let activeLibrary = "competitions";
let visibleResourceLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
let matchingResourceCount = 0;
let competitions = [];
let summerSchools = [];
let researchProjects = [];
let eligibilityFilters = {
  nationality: "",
  identityDescription: "",
  schoolContext: "",
  participationPreference: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function includesQuery(values, query) {
  if (!query) return true;
  return values.join(" ").toLowerCase().includes(query.toLowerCase());
}

function renderUrl(url) {
  if (!url) return "官网待确认";
  const escapedUrl = escapeHtml(url);
  return `<a href="${escapedUrl}" target="_blank" rel="noreferrer">${escapedUrl}</a>`;
}

function participationLabel(mode) {
  return {
    online: "线上",
    offline: "线下",
    hybrid: "线上 / 线下",
  }[mode] || "";
}

function eligibilityLabel(item) {
  if (item.eligibilityStatus === "open_to_international") return "接受国际生";
  if (item.eligibilityStatus === "us_status_only") return "仅美国身份";
  if (item.eligibilityStatus === "us_high_school_only") return "仅美国境内指定高中/地区";
  if (item.eligibilityStatus === "mainland_china_excluded") return "不接受中国大陆高中生";
  if (item.eligibilityStatus === "restricted") return item.eligibilityNote || "资格限制待核实";
  return "";
}

function renderTags(item, decision) {
  if (!hasEligibilityConditions(eligibilityFilters)) return "";
  const tags = [
    { label: participationLabel(item.participationMode), warning: item.participationMode === "unknown" },
    { label: eligibilityLabel(item), warning: item.eligibilityStatus !== "open_to_international" },
    ...decision.notices.map((label) => ({ label, warning: true })),
  ].filter((tag) => tag.label);
  const distinct = tags.filter((tag, index) => tags.findIndex((entry) => entry.label === tag.label) === index);
  return `<div class="resource-tags">${distinct
    .map((tag) => `<span class="resource-tag${tag.warning ? " warning" : ""}">${escapeHtml(tag.label)}</span>`)
    .join("")}</div>`;
}

function filteredGroups(items, query) {
  return items
    .filter((item) =>
      includesQuery(
        [
          item.name,
          item.category,
          item.tier,
          item.rating,
          item.format,
          item.duration,
          item.cost,
          item.mentorBackground,
          item.description,
          Array.isArray(item.requirements) ? item.requirements.join(" ") : item.requirements,
          item.suitableFor,
          item.outputs,
        ],
        query,
      ),
    )
    .map((item) => ({ item, decision: classifyResource(item, eligibilityFilters) }))
    .reduce(
      (groups, entry) => {
        groups[entry.decision.excluded ? "excluded" : "included"].push(entry);
        return groups;
      },
      { included: [], excluded: [] },
    );
}

function resultCountText(shownCount, matchingCount) {
  return `${hasEligibilityConditions(eligibilityFilters) ? "可查看" : "显示"} ${shownCount} / ${matchingCount} 项`;
}

function resetVisibleResourceLimit() {
  visibleResourceLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
}

function updateLoadMoreResources(page, library) {
  if (library !== activeLibrary) return;
  matchingResourceCount = page.totalCount;
  loadMoreResourcesButton?.classList.toggle("is-hidden", !page.hasMore);
}

function requirementSummary(item) {
  const requirements = Array.isArray(item.requirements) ? item.requirements.join("；") : item.requirements;
  return requirements || item.eligibilityNote || "请以项目官网最新资格说明为准";
}

function renderExcludedCard({ item, decision }) {
  return `
    <article class="resource-card resource-card-excluded">
      <div class="resource-card-header">
        <div>
          <p class="case-index">${escapeHtml(item.category)}</p>
          <h4>${escapeHtml(item.name)}</h4>
        </div>
      </div>
      <p class="resource-exclusion-reason">${escapeHtml(decision.reasons.join("；"))}</p>
      <dl>
        <div><dt>相关申请 / 报名要求</dt><dd>${escapeHtml(requirementSummary(item))}</dd></div>
      </dl>
    </article>`;
}

function renderCompetitions(query = "") {
  const grouped = filteredGroups(competitions, query);
  const page = getVisibleResultPage(grouped.included, visibleResourceLimit);
  competitionCount.textContent = resultCountText(page.shownCount, page.totalCount);
  competitionList.innerHTML = page.totalCount
    ? page.visibleItems
        .map(
          ({ item, decision }) => `
            <article class="resource-card">
              <div class="resource-card-header">
                <div>
                  <p class="case-index">${escapeHtml(item.category)}</p>
                  <h4>${escapeHtml(item.name)}</h4>
                </div>
                <span class="resource-rating">${escapeHtml(item.rating || "B")}</span>
              </div>
              ${renderTags(item, decision)}
              <dl>
                <div><dt>资源类型</dt><dd>竞赛</dd></div>
                <div><dt>简介</dt><dd>${escapeHtml(item.description || "详情待确认")}</dd></div>
                <div><dt>报名 / 比赛时间</dt><dd>${escapeHtml(item.time || "时间待确认")}</dd></div>
                <div><dt>官网链接</dt><dd>${renderUrl(item.url)}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : '<p class="resource-empty">没有匹配的竞赛项目。</p>';
  competitionExcludedSection.classList.toggle("is-hidden", grouped.excluded.length === 0);
  competitionExcludedCount.textContent = `${grouped.excluded.length} 项`;
  competitionExcludedList.innerHTML = grouped.excluded.map(renderExcludedCard).join("");
  updateLoadMoreResources(page, "competitions");
}

function renderSummerSchools(query = "") {
  const grouped = filteredGroups(summerSchools, query);
  const page = getVisibleResultPage(grouped.included, visibleResourceLimit);
  summerSchoolCount.textContent = resultCountText(page.shownCount, page.totalCount);
  summerSchoolList.innerHTML = page.totalCount
    ? page.visibleItems
        .map(
          ({ item, decision }) => `
            <article class="resource-card">
              <div class="resource-card-header">
                <div>
                  <p class="case-index">${escapeHtml(item.category)}</p>
                  <h4>${escapeHtml(item.name)}</h4>
                </div>
                <span class="resource-rating">${escapeHtml(item.rating || "待定")}</span>
              </div>
              ${renderTags(item, decision)}
              <dl>
                <div><dt>项目层级</dt><dd>${escapeHtml(item.tier || "待确认")}</dd></div>
                <div><dt>形式 / 官网</dt><dd>${escapeHtml(item.formatAndWebsite || "待确认")}</dd></div>
                <div><dt>申请要求</dt><dd>${escapeHtml(item.requirements.join("；") || "待确认")}</dd></div>
                <div><dt>申请时间</dt><dd>${escapeHtml(item.applicationTime || "待确认")}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : '<p class="resource-empty">没有匹配的夏校项目。</p>';
  summerSchoolExcludedSection.classList.toggle("is-hidden", grouped.excluded.length === 0);
  summerSchoolExcludedCount.textContent = `${grouped.excluded.length} 项`;
  summerSchoolExcludedList.innerHTML = grouped.excluded.map(renderExcludedCard).join("");
  updateLoadMoreResources(page, "summer-schools");
}

function renderResearchProjects(query = "") {
  const grouped = filteredGroups(researchProjects, query);
  const page = getVisibleResultPage(grouped.included, visibleResourceLimit);
  researchProjectCount.textContent = resultCountText(page.shownCount, page.totalCount);
  researchProjectList.innerHTML = page.totalCount
    ? page.visibleItems
        .map(
          ({ item, decision }) => `
            <article class="resource-card">
              <div class="resource-card-header">
                <div>
                  <p class="case-index">${escapeHtml(item.tier || "科研项目")}</p>
                  <h4>${escapeHtml(item.name)}</h4>
                </div>
                <span class="resource-rating">${escapeHtml(item.rating || "待定")}</span>
              </div>
              ${renderTags(item, decision)}
              <dl>
                <div><dt>项目形式</dt><dd>${escapeHtml(item.format || "待确认")}</dd></div>
                <div><dt>周期 / 费用</dt><dd>${escapeHtml(`${item.duration || "待确认"} / ${item.cost || "待确认"}`)}</dd></div>
                <div><dt>导师背景</dt><dd>${escapeHtml(item.mentorBackground || "待确认")}</dd></div>
                <div><dt>报名条件</dt><dd>${escapeHtml(item.requirements || "待确认")}</dd></div>
                <div><dt>适合人群</dt><dd>${escapeHtml(item.suitableFor || "待确认")}</dd></div>
                <div><dt>产出</dt><dd>${escapeHtml(item.outputs || "待确认")}</dd></div>
                <div><dt>官网链接</dt><dd>${renderUrl(item.website)}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : '<p class="resource-empty">没有匹配的实习/科研项目。</p>';
  researchProjectExcludedSection.classList.toggle("is-hidden", grouped.excluded.length === 0);
  researchProjectExcludedCount.textContent = `${grouped.excluded.length} 项`;
  researchProjectExcludedList.innerHTML = grouped.excluded.map(renderExcludedCard).join("");
  updateLoadMoreResources(page, "research-projects");
}

function renderActiveLibrary() {
  const query = searchInput.value.trim();
  if (activeLibrary === "competitions") renderCompetitions(query);
  else if (activeLibrary === "summer-schools") renderSummerSchools(query);
  else renderResearchProjects(query);
}

function switchLibrary(library) {
  activeLibrary = library;
  resetVisibleResourceLimit();
  const showCompetitions = library === "competitions";
  const showSummerSchools = library === "summer-schools";
  const showResearchProjects = library === "research-projects";
  competitionTab.classList.toggle("is-active", showCompetitions);
  competitionTab.setAttribute("aria-selected", String(showCompetitions));
  summerSchoolTab.classList.toggle("is-active", showSummerSchools);
  summerSchoolTab.setAttribute("aria-selected", String(showSummerSchools));
  researchProjectTab.classList.toggle("is-active", showResearchProjects);
  researchProjectTab.setAttribute("aria-selected", String(showResearchProjects));
  competitionLibrary.classList.toggle("is-hidden", !showCompetitions);
  summerSchoolLibrary.classList.toggle("is-hidden", !showSummerSchools);
  researchProjectLibrary.classList.toggle("is-hidden", !showResearchProjects);
  searchInput.placeholder = showCompetitions
    ? "输入竞赛名称或方向"
    : showSummerSchools
      ? "输入夏校名称或方向"
      : "输入科研项目名称或方向";
  renderActiveLibrary();
}

async function loadResources() {
  try {
    const [competitionResponse, summerSchoolResponse] = await Promise.all([
      fetch("./data/competitions.md"),
      fetch("./data/summer-schools.md"),
    ]);
    if (!competitionResponse.ok || !summerSchoolResponse.ok) throw new Error("resources unavailable");
    competitions = parseCompetitionsMarkdown(await competitionResponse.text()).map(enrichResourceEligibility);
    summerSchools = parseSummerSchoolsMarkdown(await summerSchoolResponse.text()).map(enrichResourceEligibility);
    status.textContent = `已载入 ${competitions.length + summerSchools.length} 项资源`;
    renderCompetitions();
    renderSummerSchools();
  } catch {
    status.textContent = "资源加载失败";
    status.classList.add("error");
    loadMoreResourcesButton?.classList.add("is-hidden");
    competitionList.innerHTML = '<p class="resource-empty">暂时无法读取竞赛库。</p>';
    summerSchoolList.innerHTML = '<p class="resource-empty">暂时无法读取夏校库。</p>';
  }
  try {
    const researchProjectResponse = await fetch("./data/research-projects.md");
    if (!researchProjectResponse.ok) throw new Error("research projects unavailable");
    researchProjects = parseResearchProjectsMarkdown(await researchProjectResponse.text()).map(enrichResourceEligibility);
    if (!hasEligibilityConditions(eligibilityFilters)) {
      status.textContent = `已载入 ${competitions.length + summerSchools.length + researchProjects.length} 项资源`;
    }
    renderResearchProjects();
  } catch {
    researchProjects = [];
    researchProjectList.innerHTML = '<p class="resource-empty">暂时无法读取实习/科研库。</p>';
  }
}

competitionTab?.addEventListener("click", () => switchLibrary("competitions"));
summerSchoolTab?.addEventListener("click", () => switchLibrary("summer-schools"));
researchProjectTab?.addEventListener("click", () => switchLibrary("research-projects"));
searchInput?.addEventListener("input", () => {
  resetVisibleResourceLimit();
  renderActiveLibrary();
});
eligibilityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedMode = eligibilityForm.querySelector('input[name="participationMode"]:checked');
  eligibilityFilters = {
    nationality: nationalityInput.value.trim(),
    identityDescription: identityInput.value.trim(),
    schoolContext: schoolContextInput.value,
    participationPreference: selectedMode?.value || "",
  };
  const applied = hasEligibilityConditions(eligibilityFilters);
  status.textContent = applied
    ? "可参与条件已应用"
    : `已载入 ${competitions.length + summerSchools.length + researchProjects.length} 项资源`;
  resetVisibleResourceLimit();
  renderActiveLibrary();
});
clearEligibilityButton?.addEventListener("click", () => {
  eligibilityForm.reset();
  eligibilityFilters = {
    nationality: "",
    identityDescription: "",
    schoolContext: "",
    participationPreference: "",
  };
  status.textContent = `已载入 ${competitions.length + summerSchools.length + researchProjects.length} 项资源`;
  resetVisibleResourceLimit();
  renderActiveLibrary();
});
loadMoreResourcesButton?.addEventListener("click", () => {
  visibleResourceLimit = expandVisibleResultLimit(visibleResourceLimit, matchingResourceCount);
  renderActiveLibrary();
});

loadResources();
