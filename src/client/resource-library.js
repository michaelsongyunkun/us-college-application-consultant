import { parseCompetitionsMarkdown } from "../domain/competition-recommender.mjs";
import { parseExtracurricularActivitiesMarkdown } from "../domain/extracurricular-activity-library.mjs";
import {
  filterInternationalJournals,
  getInternationalJournalDirections,
  getInternationalJournalIndexDatabases,
  parseInternationalJournalsMarkdown,
} from "../domain/international-journal-library.mjs";
import {
  classifyResource,
  enrichResourceEligibility,
  hasEligibilityConditions,
} from "../domain/resource-eligibility.mjs";
import { parseResearchProjectsMarkdown } from "../domain/research-project-recommender.mjs";
import { parseSummerSchoolsMarkdown } from "../domain/summer-school-recommender.mjs";
import {
  DEFAULT_VISIBLE_RESULT_LIMIT,
  expandVisibleResultLimit,
  getVisibleResultPage,
} from "./visible-results.mjs";

const status = document.querySelector("#resourceStatus");
const searchInput = document.querySelector("#resourceSearch");
const eligibilityForm = document.querySelector("#resourceEligibilityForm");
const resourceFilterTitle = document.querySelector("#resourceFilterTitle");
const resourceFilterDescription = document.querySelector("#resourceFilterDescription");
const resourceEligibilityFields = document.querySelector("#resourceEligibilityFields");
const activityFilterFields = document.querySelector("#activityFilterFields");
const journalFilterFields = document.querySelector("#journalFilterFields");
const resourceSearchField = document.querySelector("#resourceSearchField");
const nationalityInput = document.querySelector("#resourceNationality");
const identityInput = document.querySelector("#resourceIdentity");
const schoolContextInput = document.querySelector("#resourceSchoolContext");
const activityCommonAppTypeInput = document.querySelector("#activityCommonAppType");
const activityMajorDirectionInput = document.querySelector("#activityMajorDirection");
const activityMajorDirectionOptions = document.querySelector("#activityMajorDirectionOptions");
const journalDirectionInput = document.querySelector("#journalDirection");
const journalDirectionToggle = document.querySelector("#journalDirectionToggle");
const journalDirectionSelected = document.querySelector("#journalDirectionSelected");
const journalDirectionMenu = document.querySelector("#journalDirectionMenu");
const journalDirectionCombobox = document.querySelector("[data-journal-direction-combobox]");
const journalIndexDatabaseInput = document.querySelector("#journalIndexDatabase");
const clearEligibilityButton = document.querySelector("#clearResourceEligibility");
const toggleResourceFiltersButton = document.querySelector("#toggleResourceFilters");
const clearResourceFiltersInlineButton = document.querySelector("#clearResourceFiltersInline");
const resourceFilterSummary = document.querySelector("#resourceFilterSummary");
const resourceFilterPills = document.querySelector("#resourceFilterPills");
const resourceResultSummary = document.querySelector("#resourceResultSummary");
const competitionTab = document.querySelector("#competitionTab");
const summerSchoolTab = document.querySelector("#summerSchoolTab");
const researchProjectTab = document.querySelector("#researchProjectTab");
const extracurricularActivityTab = document.querySelector("#extracurricularActivityTab");
const internationalJournalTab = document.querySelector("#internationalJournalTab");
const competitionLibrary = document.querySelector("#competitionLibrary");
const summerSchoolLibrary = document.querySelector("#summerSchoolLibrary");
const researchProjectLibrary = document.querySelector("#researchProjectLibrary");
const extracurricularActivityLibrary = document.querySelector("#extracurricularActivityLibrary");
const internationalJournalLibrary = document.querySelector("#internationalJournalLibrary");
const competitionList = document.querySelector("#resourceCompetitionList");
const summerSchoolList = document.querySelector("#resourceSummerSchoolList");
const researchProjectList = document.querySelector("#resourceResearchProjectList");
const extracurricularActivityList = document.querySelector("#resourceExtracurricularActivityList");
const internationalJournalList = document.querySelector("#resourceInternationalJournalList");
const competitionExcludedList = document.querySelector("#resourceCompetitionExcludedList");
const summerSchoolExcludedList = document.querySelector("#resourceSummerSchoolExcludedList");
const researchProjectExcludedList = document.querySelector("#resourceResearchProjectExcludedList");
const competitionExcludedSection = document.querySelector("#competitionExcludedSection");
const summerSchoolExcludedSection = document.querySelector("#summerSchoolExcludedSection");
const researchProjectExcludedSection = document.querySelector("#researchProjectExcludedSection");
const competitionCount = document.querySelector("#competitionCount");
const summerSchoolCount = document.querySelector("#summerSchoolCount");
const researchProjectCount = document.querySelector("#researchProjectCount");
const extracurricularActivityCount = document.querySelector("#extracurricularActivityCount");
const internationalJournalCount = document.querySelector("#internationalJournalCount");
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
let extracurricularActivities = [];
let internationalJournals = [];
let eligibilityFilters = {
  nationality: "",
  identityDescription: "",
  schoolContext: "",
  participationPreference: "",
};
let activityFilters = {
  commonAppType: "",
  majorDirection: "",
};
let journalFilters = {
  direction: "",
  indexDatabase: "",
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

function filteredActivities(items, query) {
  return items
    .filter((item) => !activityFilters.commonAppType || item.category === activityFilters.commonAppType)
    .filter(
      (item) =>
        !activityFilters.majorDirection ||
        includesQuery([item.majorDirections.join(" "), item.majorDirectionText], activityFilters.majorDirection),
    )
    .filter((item) =>
      includesQuery(
        [
          item.name,
          item.approach,
          item.category,
          item.commonAppType,
          item.commonAppTypeCn,
          item.categoryPositioning,
          item.content,
          item.highlights,
          item.majorDirections.join(" "),
        ],
        query,
      ),
    );
}

function filteredJournals(query) {
  return filterInternationalJournals(internationalJournals, {
    query,
    direction: journalFilters.direction,
    indexDatabase: journalFilters.indexDatabase,
  });
}

function totalResourceCount() {
  return (
    competitions.length +
    summerSchools.length +
    researchProjects.length +
    extracurricularActivities.length +
    internationalJournals.length
  );
}

function updateLoadedStatus() {
  if (!hasEligibilityConditions(eligibilityFilters) && !hasActivityFilters()) {
    status.textContent = `已载入 ${totalResourceCount()} 项资源`;
  }
}

function hasActivityFilters() {
  return Boolean(activityFilters.commonAppType || activityFilters.majorDirection);
}

function hasJournalFilters() {
  return Boolean(journalFilters.direction || journalFilters.indexDatabase);
}

function resultCountText(shownCount, matchingCount) {
  const hasFilters =
    activeLibrary === "extracurricular-activities"
      ? hasActivityFilters()
      : activeLibrary === "international-journals"
        ? hasJournalFilters()
      : hasEligibilityConditions(eligibilityFilters);
  return `${hasFilters ? "可查看" : "显示"} ${shownCount} / ${matchingCount} 项`;
}

function selectedOptionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function activeLibraryLabel() {
  return {
    competitions: "竞赛库",
    "summer-schools": "夏校库",
    "research-projects": "实习/科研库",
    "extracurricular-activities": "课外活动库",
    "international-journals": "国际期刊汇总",
  }[activeLibrary] || "当前资源库";
}

function participationPreferenceText(value) {
  return {
    online_only: "仅线上",
    offline_only: "仅线下",
    either: "线上线下都可",
  }[value] || "";
}

function getActiveFilterLabels() {
  const labels = [];
  const query = searchInput?.value.trim();
  if (query && activeLibrary !== "extracurricular-activities") labels.push(`搜索：${query}`);
  if (activeLibrary === "extracurricular-activities") {
    if (activityFilters.commonAppType) labels.push(`Common App：${activityFilters.commonAppType}`);
    if (activityFilters.majorDirection) labels.push(`方向：${activityFilters.majorDirection}`);
    return labels;
  }
  if (activeLibrary === "international-journals") {
    if (journalFilters.direction) labels.push(`论文方向：${journalFilters.direction}`);
    if (journalFilters.indexDatabase) labels.push(`检索库：${journalFilters.indexDatabase}`);
    return labels;
  }
  if (eligibilityFilters.nationality) labels.push(`国籍：${eligibilityFilters.nationality}`);
  if (eligibilityFilters.identityDescription) labels.push(`身份：${eligibilityFilters.identityDescription}`);
  if (eligibilityFilters.schoolContext) labels.push(`就读体系：${selectedOptionText(schoolContextInput)}`);
  if (eligibilityFilters.participationPreference) {
    labels.push(`参与方式：${participationPreferenceText(eligibilityFilters.participationPreference)}`);
  }
  return labels;
}

function trackResourceUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  const activeFilters = getActiveFilterLabels();
  fetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: {
        grade: "",
        majorDirection: activityMajorDirectionInput?.value.trim() || journalDirectionInput?.value || "",
      },
      metrics: {
        completionFields: activeFilters.length,
        generatedActivityCount: matchingResourceCount,
        ...metrics,
      },
      details: {
        source: "resource_library",
        activeLibrary,
        query: searchInput?.value.trim() || "",
        nationality: nationalityInput?.value.trim() || "",
        schoolContext: schoolContextInput?.value || "",
        filters: activeFilters,
        ...details,
      },
    }),
  }).catch(() => {});
}

function renderResourceFilterSnapshot(shownCount = 0, matchingCount = 0) {
  if (resourceFilterSummary) resourceFilterSummary.textContent = activeLibraryLabel();
  if (resourceResultSummary) {
    resourceResultSummary.textContent =
      matchingCount > 0 ? `显示 ${shownCount} / ${matchingCount} 项` : "暂无匹配结果";
  }
  if (!resourceFilterPills) return;
  const labels = getActiveFilterLabels();
  resourceFilterPills.innerHTML = labels.length
    ? labels.map((label) => `<span class="resource-filter-pill">${escapeHtml(label)}</span>`).join("")
    : '<span class="resource-filter-pill is-empty">未设置条件</span>';
}

function setResourceFilterCollapsed(isCollapsed) {
  eligibilityForm?.classList.toggle("is-collapsed", isCollapsed);
  toggleResourceFiltersButton?.setAttribute("aria-expanded", String(!isCollapsed));
  if (toggleResourceFiltersButton) toggleResourceFiltersButton.textContent = isCollapsed ? "筛选" : "收起";
}

function resetVisibleResourceLimit() {
  visibleResourceLimit = DEFAULT_VISIBLE_RESULT_LIMIT;
}

function updateLoadMoreResources(page, library) {
  if (library !== activeLibrary) return;
  matchingResourceCount = page.totalCount;
  loadMoreResourcesButton?.classList.toggle("is-hidden", !page.hasMore);
  renderResourceFilterSnapshot(page.shownCount, page.totalCount);
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

function renderExtracurricularActivities(query = "") {
  const filtered = filteredActivities(extracurricularActivities, query);
  const page = getVisibleResultPage(filtered, visibleResourceLimit);
  extracurricularActivityCount.textContent = resultCountText(page.shownCount, page.totalCount);
  extracurricularActivityList.innerHTML = page.totalCount
    ? page.visibleItems
        .map(
          (item) => `
            <article class="resource-card">
              <div class="resource-card-header">
                <div>
                  <p class="case-index">${escapeHtml(item.category)}</p>
                  <h4>${escapeHtml(item.name)}</h4>
                </div>
                <span class="resource-rating">${escapeHtml(item.approach)}</span>
              </div>
              <dl>
                <div><dt>Common App 类型</dt><dd>${escapeHtml(item.commonAppTypeCn || item.commonAppType)}</dd></div>
                <div><dt>活动内容</dt><dd>${escapeHtml(item.content || "待补充真实经历后改写")}</dd></div>
                <div><dt>活动亮点</dt><dd>${escapeHtml(item.highlights || "待结合学生成果提炼")}</dd></div>
                <div><dt>专业方向</dt><dd>${escapeHtml(item.majorDirections.join("、") || "可按学生方向调整")}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : '<p class="resource-empty">没有匹配的课外活动素材。</p>';
  updateLoadMoreResources(page, "extracurricular-activities");
}

function renderInternationalJournals(query = "") {
  const filtered = filteredJournals(query);
  const page = getVisibleResultPage(filtered, visibleResourceLimit);
  internationalJournalCount.textContent = resultCountText(page.shownCount, page.totalCount);
  internationalJournalList.innerHTML = page.totalCount
    ? page.visibleItems
        .map(
          (item) => `
            <article class="resource-card">
              <div class="resource-card-header">
                <div>
                  <p class="case-index">${escapeHtml(item.direction)}</p>
                  <h4>${escapeHtml(item.name)}</h4>
                </div>
                <span class="resource-rating">${escapeHtml(item.indexDatabase)}</span>
              </div>
              <div class="resource-tags">
                <span class="resource-tag">${escapeHtml(item.type)}</span>
              </div>
              <dl>
                <div><dt>论文方向</dt><dd>${escapeHtml(item.direction || "待复核")}</dd></div>
                <div><dt>期刊领域</dt><dd>${escapeHtml(item.field || "待复核")}</dd></div>
                <div><dt>领域关键词</dt><dd>${escapeHtml(item.fieldKeywords.slice(0, 8).join("、") || item.direction || "待复核")}</dd></div>
                <div><dt>期刊介绍</dt><dd>${escapeHtml(item.description || "请以期刊官网作者指南为准")}</dd></div>
                <div><dt>期刊地址</dt><dd>${renderUrl(item.url)}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : '<p class="resource-empty">没有匹配的国际期刊。</p>';
  updateLoadMoreResources(page, "international-journals");
}

function renderActiveLibrary() {
  const query = activeLibrary === "extracurricular-activities" ? "" : searchInput.value.trim();
  if (activeLibrary === "competitions") renderCompetitions(query);
  else if (activeLibrary === "summer-schools") renderSummerSchools(query);
  else if (activeLibrary === "research-projects") renderResearchProjects(query);
  else if (activeLibrary === "international-journals") renderInternationalJournals(query);
  else renderExtracurricularActivities(query);
}

function populateActivityFilterOptions() {
  const selectedType = activityCommonAppTypeInput.value;
  const categories = [];
  for (const item of extracurricularActivities) {
    if (!categories.includes(item.category)) categories.push(item.category);
  }
  activityCommonAppTypeInput.innerHTML = [
    '<option value="">全部 Common App 类型</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
  ].join("");
  if (categories.includes(selectedType)) activityCommonAppTypeInput.value = selectedType;

  const majorDirections = [
    ...new Set(extracurricularActivities.flatMap((item) => item.majorDirections).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right, "zh-CN"));
  activityMajorDirectionOptions.innerHTML = majorDirections
    .map((direction) => `<option value="${escapeHtml(direction)}"></option>`)
    .join("");
}

function updateJournalDirectionOptions() {
  const selectedValue = journalDirectionInput.value;
  journalDirectionMenu.innerHTML = [
    { value: "", label: "全部论文方向" },
    ...getInternationalJournalDirections(internationalJournals).map((direction) => ({ value: direction, label: direction })),
  ]
    .map(
      (option) => `
        <button
          class="resource-combobox-option${option.value === selectedValue ? " is-selected" : ""}"
          type="button"
          role="option"
          data-value="${escapeHtml(option.value)}"
          aria-selected="${option.value === selectedValue}"
        >${escapeHtml(option.label)}</button>`,
    )
    .join("");
}

function setJournalDirection(value = "") {
  journalDirectionInput.value = value;
  journalDirectionSelected.textContent = value || "全部论文方向";
  if (!journalDirectionMenu) return;
  for (const option of journalDirectionMenu.querySelectorAll(".resource-combobox-option")) {
    const selected = option.dataset.value === value;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  }
}

function openJournalDirectionMenu() {
  journalDirectionMenu?.classList.remove("is-hidden");
  journalDirectionToggle?.setAttribute("aria-expanded", "true");
}

function closeJournalDirectionMenu() {
  journalDirectionMenu?.classList.add("is-hidden");
  journalDirectionToggle?.setAttribute("aria-expanded", "false");
}

function toggleJournalDirectionMenu() {
  if (journalDirectionMenu?.classList.contains("is-hidden")) openJournalDirectionMenu();
  else closeJournalDirectionMenu();
}

function populateJournalFilterOptions() {
  const selectedDirection = journalDirectionInput.value;
  const selectedIndexDatabase = journalIndexDatabaseInput.value;
  const directions = getInternationalJournalDirections(internationalJournals);
  setJournalDirection(directions.includes(selectedDirection) ? selectedDirection : "");
  updateJournalDirectionOptions();

  const indexDatabases = getInternationalJournalIndexDatabases(internationalJournals);
  journalIndexDatabaseInput.innerHTML = [
    '<option value="">不限检索库</option>',
    ...indexDatabases.map((indexDatabase) => `<option value="${escapeHtml(indexDatabase)}">${escapeHtml(indexDatabase)}</option>`),
  ].join("");
  if (indexDatabases.includes(selectedIndexDatabase)) journalIndexDatabaseInput.value = selectedIndexDatabase;
}

function updateFilterMode(mode) {
  const isActivityMode = mode === "activity";
  const isJournalMode = mode === "journal";
  resourceEligibilityFields?.classList.toggle("is-hidden", isActivityMode || isJournalMode);
  activityFilterFields?.classList.toggle("is-hidden", !isActivityMode);
  journalFilterFields?.classList.toggle("is-hidden", !isJournalMode);
  resourceSearchField?.classList.toggle("is-hidden", isActivityMode);
  if (!isJournalMode) closeJournalDirectionMenu();
  if (isActivityMode) {
    searchInput.value = "";
    resourceFilterTitle.textContent = "活动素材筛选";
    resourceFilterDescription.textContent =
      "按 29 种 Common App 类型和专业方向筛选课外活动素材；这些筛选不会保存到账号资料。";
    return;
  }
  if (isJournalMode) {
    resourceFilterTitle.textContent = "国际期刊筛选";
    resourceFilterDescription.textContent =
      "按论文方向和检索库要求检索匹配期刊；索引状态、费用、伦理与作者资格仍需投稿前逐刊复核。";
    return;
  }
  resourceFilterTitle.textContent = "我的可参与条件";
  resourceFilterDescription.textContent =
    "仅用于当前页面筛选，不会保存到账号资料。资格结论仍请以项目官网为准。";
}

function switchLibrary(library) {
  activeLibrary = library;
  resetVisibleResourceLimit();
  const showCompetitions = library === "competitions";
  const showSummerSchools = library === "summer-schools";
  const showResearchProjects = library === "research-projects";
  const showExtracurricularActivities = library === "extracurricular-activities";
  const showInternationalJournals = library === "international-journals";
  competitionTab.classList.toggle("is-active", showCompetitions);
  competitionTab.setAttribute("aria-selected", String(showCompetitions));
  summerSchoolTab.classList.toggle("is-active", showSummerSchools);
  summerSchoolTab.setAttribute("aria-selected", String(showSummerSchools));
  researchProjectTab.classList.toggle("is-active", showResearchProjects);
  researchProjectTab.setAttribute("aria-selected", String(showResearchProjects));
  extracurricularActivityTab.classList.toggle("is-active", showExtracurricularActivities);
  extracurricularActivityTab.setAttribute("aria-selected", String(showExtracurricularActivities));
  internationalJournalTab.classList.toggle("is-active", showInternationalJournals);
  internationalJournalTab.setAttribute("aria-selected", String(showInternationalJournals));
  competitionLibrary.classList.toggle("is-hidden", !showCompetitions);
  summerSchoolLibrary.classList.toggle("is-hidden", !showSummerSchools);
  researchProjectLibrary.classList.toggle("is-hidden", !showResearchProjects);
  extracurricularActivityLibrary.classList.toggle("is-hidden", !showExtracurricularActivities);
  internationalJournalLibrary.classList.toggle("is-hidden", !showInternationalJournals);
  updateFilterMode(showExtracurricularActivities ? "activity" : showInternationalJournals ? "journal" : "resource");
  searchInput.placeholder = showCompetitions
    ? "输入竞赛名称或方向"
    : showSummerSchools
      ? "输入夏校名称或方向"
      : showResearchProjects
        ? "输入科研项目名称或方向"
        : showInternationalJournals
          ? "输入期刊名称、领域或关键词"
          : "输入活动类型、主题或专业方向";
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
    updateLoadedStatus();
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
    updateLoadedStatus();
    renderResearchProjects();
  } catch {
    researchProjects = [];
    researchProjectList.innerHTML = '<p class="resource-empty">暂时无法读取实习/科研库。</p>';
  }
  try {
    const extracurricularActivityResponse = await fetch("./data/extracurricular-activities.md");
    if (!extracurricularActivityResponse.ok) throw new Error("extracurricular activities unavailable");
    extracurricularActivities = parseExtracurricularActivitiesMarkdown(await extracurricularActivityResponse.text());
    populateActivityFilterOptions();
    updateLoadedStatus();
    renderExtracurricularActivities();
  } catch {
    extracurricularActivities = [];
    extracurricularActivityList.innerHTML = '<p class="resource-empty">暂时无法读取课外活动库。</p>';
  }
  try {
    const internationalJournalResponse = await fetch("./data/international-journals.md");
    if (!internationalJournalResponse.ok) throw new Error("international journals unavailable");
    internationalJournals = parseInternationalJournalsMarkdown(await internationalJournalResponse.text());
    populateJournalFilterOptions();
    updateLoadedStatus();
    renderInternationalJournals();
  } catch {
    internationalJournals = [];
    internationalJournalList.innerHTML = '<p class="resource-empty">暂时无法读取国际期刊汇总。</p>';
  }
}

competitionTab?.addEventListener("click", () => switchLibrary("competitions"));
summerSchoolTab?.addEventListener("click", () => switchLibrary("summer-schools"));
researchProjectTab?.addEventListener("click", () => switchLibrary("research-projects"));
extracurricularActivityTab?.addEventListener("click", () => switchLibrary("extracurricular-activities"));
internationalJournalTab?.addEventListener("click", () => switchLibrary("international-journals"));
toggleResourceFiltersButton?.addEventListener("click", () => {
  setResourceFilterCollapsed(!eligibilityForm?.classList.contains("is-collapsed"));
});
clearResourceFiltersInlineButton?.addEventListener("click", () => {
  clearEligibilityButton?.click();
});
journalDirectionToggle?.addEventListener("click", toggleJournalDirectionMenu);
journalDirectionToggle?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openJournalDirectionMenu();
  }
  if (event.key === "Escape") closeJournalDirectionMenu();
});
journalDirectionMenu?.addEventListener("click", (event) => {
  const option = event.target instanceof Element ? event.target.closest(".resource-combobox-option") : null;
  if (!option) return;
  setJournalDirection(option.dataset.value || "");
  closeJournalDirectionMenu();
  journalDirectionToggle?.focus();
});
journalDirectionMenu?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeJournalDirectionMenu();
    journalDirectionToggle?.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!journalDirectionCombobox || !(event.target instanceof Element)) return;
  if (!journalDirectionCombobox.contains(event.target)) closeJournalDirectionMenu();
});
searchInput?.addEventListener("input", () => {
  resetVisibleResourceLimit();
  renderActiveLibrary();
});
eligibilityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (activeLibrary === "extracurricular-activities") {
    activityFilters = {
      commonAppType: activityCommonAppTypeInput.value,
      majorDirection: activityMajorDirectionInput.value.trim(),
    };
    status.textContent = hasActivityFilters() ? "活动筛选已应用" : `已载入 ${totalResourceCount()} 项资源`;
    resetVisibleResourceLimit();
    renderActiveLibrary();
    trackResourceUsageEvent("resource_filter_applied", {
      details: { filterMode: "activity" },
    });
    setResourceFilterCollapsed(true);
    return;
  }
  if (activeLibrary === "international-journals") {
    journalFilters = {
      direction: journalDirectionInput.value,
      indexDatabase: journalIndexDatabaseInput.value,
    };
    status.textContent = hasJournalFilters() ? "期刊筛选已应用" : `已载入 ${totalResourceCount()} 项资源`;
    resetVisibleResourceLimit();
    renderActiveLibrary();
    trackResourceUsageEvent("resource_filter_applied", {
      details: { filterMode: "journal" },
    });
    setResourceFilterCollapsed(true);
    return;
  }
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
    : `已载入 ${totalResourceCount()} 项资源`;
  resetVisibleResourceLimit();
  renderActiveLibrary();
  trackResourceUsageEvent("resource_filter_applied", {
    details: { filterMode: "resource", hasEligibilityFilters: applied },
  });
  setResourceFilterCollapsed(true);
});
clearEligibilityButton?.addEventListener("click", () => {
  eligibilityForm.reset();
  eligibilityFilters = {
    nationality: "",
    identityDescription: "",
    schoolContext: "",
    participationPreference: "",
  };
  activityFilters = {
    commonAppType: "",
    majorDirection: "",
  };
  journalFilters = {
    direction: "",
    indexDatabase: "",
  };
  setJournalDirection("");
  setResourceFilterCollapsed(true);
  status.textContent = `已载入 ${totalResourceCount()} 项资源`;
  resetVisibleResourceLimit();
  renderActiveLibrary();
});
loadMoreResourcesButton?.addEventListener("click", () => {
  visibleResourceLimit = expandVisibleResultLimit(visibleResourceLimit, matchingResourceCount);
  renderActiveLibrary();
  trackResourceUsageEvent("resource_load_more", {
    details: { visibleResourceLimit },
  });
});

loadResources();
