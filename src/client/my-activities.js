import { escapeHtml } from "./html-utils.mjs";
import {
  APPLICATION_ROUND_LABELS,
  getEligibleSchools,
  parseApplicationRoundSchoolsMarkdown,
} from "../domain/application-round-schools.mjs";

const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const ACTIVITY_IMPORT_SOURCES_ENDPOINT = "/api/my-activities/import-sources";
const APPLICATION_ROUND_SCHOOLS_ENDPOINT = "./data/application-round-schools.md";
const ACTIVITY_SLOT_COUNT = 10;
const COMPETITION_SLOT_COUNT = 5;
const SUMMER_SCHOOL_SLOT_COUNT = 3;

const APPLICATION_ROUND_CONFIG = [
  { key: "rea", label: "REA", title: "REA", addable: false, note: "1所；不能与ED1同时申请" },
  { key: "ed1", label: "ED1", title: "ED1", addable: false, note: "1所；不能与REA同时申请" },
  { key: "ed2", label: "ED2", title: "ED2", addable: false, note: "1所" },
  { key: "ea", label: "EA", title: "EA", addable: true, note: "可新增多所" },
  { key: "uc", label: "UC", title: "UC", addable: true, note: "UC系统单独记录" },
  { key: "rd", label: "RD", title: "RD", addable: true, note: "可新增多所" },
];

const ACTIVITY_TYPE_OPTIONS = ["科研", "公益", "社团", "竞赛延展", "艺术", "体育", "实习", "其他"];
const ACTIVITY_STATUS_OPTIONS = ["已完成", "进行中", "计划中"];
const COMPETITION_STATUS_OPTIONS = ["已获奖", "已参赛待结果", "准备中", "计划中"];
const SUMMER_SCHOOL_STATUS_OPTIONS = ["已完成", "已录取", "申请中", "计划申请"];
const RELATIONSHIP_STRENGTH_OPTIONS = ["强", "中", "弱", "待建立"];
const PREPARED_MATERIAL_OPTIONS = ["简历", "活动清单", "成绩单", "项目说明", "沟通邮件"];

const activityFields = [
  "activityName",
  "type",
  "timeStage",
  "role",
  "description",
  "outcome",
  "proofLink",
  "status",
];
const competitionFields = [
  "competitionName",
  "subject",
  "yearGrade",
  "award",
  "contribution",
  "proofLink",
  "status",
];
const summerSchoolFields = [
  "programName",
  "organizer",
  "direction",
  "participationTime",
  "status",
  "output",
  "proofLink",
];

const portfolioForm = document.querySelector("#portfolioForm");
const savePortfolioButton = document.querySelector("#savePortfolioButton");
const savePortfolioButtons = document.querySelectorAll("[data-save-portfolio], #savePortfolioButton");
const portfolioStatus = document.querySelector("#portfolioStatus");
const activitiesProgress = document.querySelector("#activitiesProgress");
const competitionsProgress = document.querySelector("#competitionsProgress");
const summerSchoolsProgress = document.querySelector("#summerSchoolsProgress");
const recommendationProgress = document.querySelector("#recommendationProgress");
const applicationPlanProgress = document.querySelector("#applicationPlanProgress");
const applicationPlanList = document.querySelector("#applicationPlanList");
const activityImportSources = document.querySelector("#activityImportSources");
const activityImportStatus = document.querySelector("#activityImportStatus");
const activitiesList = document.querySelector("#activitiesList");
const competitionsList = document.querySelector("#competitionsList");
const summerSchoolsList = document.querySelector("#summerSchoolsList");
const recommendationLettersPanel = document.querySelector("#recommendationLettersPanel");

let isDirty = false;
let isRendering = false;
let currentPortfolio = emptyPortfolio();
let applicationRoundSchools = [];
let applicationRoundRowCounts = { ea: 1, uc: 1, rd: 1 };
let planningActivitySources = [];

function emptyApplicationPlan() {
  return {
    rea: [],
    ed1: [],
    ed2: [],
    ea: [],
    uc: [],
    rd: [],
  };
}

function emptyPortfolio() {
  return {
    applicationPlan: emptyApplicationPlan(),
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    updatedAt: null,
  };
}

function renderPortfolio(portfolio = emptyPortfolio()) {
  currentPortfolio = normalizePortfolioForView(portfolio);
  syncApplicationRowCounts(currentPortfolio.applicationPlan);
  isRendering = true;
  renderApplicationPlan(currentPortfolio.applicationPlan);
  activitiesList.innerHTML = renderActivityCards(currentPortfolio.activities || []);
  competitionsList.innerHTML = renderCompetitionCards(currentPortfolio.competitions || []);
  summerSchoolsList.innerHTML = renderSummerSchoolCards(currentPortfolio.summerSchools || []);
  recommendationLettersPanel.innerHTML = renderRecommendationLetters(
    currentPortfolio.recommendationLetters || {},
  );
  isRendering = false;
  updateCompletion();
}

function normalizePortfolioForView(portfolio = emptyPortfolio()) {
  const fallback = emptyPortfolio();
  return {
    ...fallback,
    ...portfolio,
    applicationPlan: normalizeApplicationPlanForView(portfolio.applicationPlan),
    activities: portfolio.activities || [],
    competitions: portfolio.competitions || [],
    summerSchools: portfolio.summerSchools || [],
    recommendationLetters: portfolio.recommendationLetters || {},
  };
}

function normalizeApplicationPlanForView(plan = emptyApplicationPlan()) {
  const fallback = emptyApplicationPlan();
  return Object.fromEntries(
    APPLICATION_ROUND_CONFIG.map((round) => [
      round.key,
      Array.isArray(plan?.[round.key]) ? plan[round.key] : fallback[round.key],
    ]),
  );
}

function syncApplicationRowCounts(plan = emptyApplicationPlan()) {
  for (const round of APPLICATION_ROUND_CONFIG.filter((item) => item.addable)) {
    applicationRoundRowCounts[round.key] = Math.max(
      applicationRoundRowCounts[round.key] || 1,
      plan[round.key]?.length || 0,
      1,
    );
  }
}

function renderApplicationPlan(plan = emptyApplicationPlan()) {
  if (!applicationPlanList) return;
  applicationPlanList.innerHTML = APPLICATION_ROUND_CONFIG.map((round) =>
    renderApplicationRoundCard(round, plan[round.key] || []),
  ).join("");
}

function renderApplicationRoundCard(round, entries = []) {
  const rowCount = round.addable
    ? Math.max(applicationRoundRowCounts[round.key] || 1, entries.length, 1)
    : 1;
  return `
    <article class="application-round-card">
      <div class="application-round-header">
        <div>
          <h3>${escapeHtml(APPLICATION_ROUND_LABELS[round.key] || round.title)}</h3>
          <p>${escapeHtml(round.note)}</p>
        </div>
        ${
          round.addable
            ? `<button type="button" class="secondary" data-add-application-round="${escapeHtml(round.key)}">新增</button>`
            : ""
        }
      </div>
      <div class="application-plan-rows">
        ${Array.from({ length: rowCount }, (_, index) =>
          renderApplicationPlanRow(round, index, entries[index] || {}),
        ).join("")}
      </div>
    </article>`;
}

function renderApplicationPlanRow(round, index, entry = {}) {
  return `
    <div class="application-plan-row" data-application-round="${escapeHtml(round.key)}" data-application-index="${index}">
      ${renderApplicationSchoolSelect(round.key, index, entry.school)}
      ${renderApplicationMajorInput(round.key, index, entry.major)}
    </div>`;
}

function renderApplicationSchoolSelect(roundKey, index, value = "") {
  const options = getEligibleSchools(applicationRoundSchools, roundKey);
  const selectedValue = String(value || "");
  const hasSelectedOption = options.some((school) => school.name === selectedValue);
  return `
    <label>
      <span>院校</span>
      <select name="${escapeHtml(applicationControlName(roundKey, index, "school"))}">
        <option value="">${options.length ? "请选择院校" : "正在加载院校"}</option>
        ${
          selectedValue && !hasSelectedOption
            ? `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}（当前已保存）</option>`
            : ""
        }
        ${options
          .map((school) => {
            const label = `${school.name} · ${school.category} ${school.rank}`;
            return `<option value="${escapeHtml(school.name)}" ${school.name === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
          })
          .join("")}
      </select>
    </label>`;
}

function renderApplicationMajorInput(roundKey, index, value = "") {
  return `
    <label>
      <span>专业方向</span>
      <input
        name="${escapeHtml(applicationControlName(roundKey, index, "major"))}"
        type="text"
        value="${escapeHtml(value)}"
        placeholder="例如 Computer Science"
      />
    </label>`;
}

function renderActivityImportSources(sources = []) {
  if (!activityImportSources) return;
  const importItems = sources.flatMap((source) =>
    (source.activities || []).map((activity, index) => ({ source, activity, index })),
  );
  if (!importItems.length) {
    activityImportSources.innerHTML =
      '<p class="portfolio-empty">暂无可导入的规划活动。请先在申请规划中保存活动方案或历史备份。</p>';
    return;
  }

  activityImportSources.innerHTML = importItems
    .map(
      ({ source, activity, index }) => `
        <article class="activity-import-card">
          <div>
            <p class="activity-import-source">${escapeHtml(source.label || source.planName || "申请规划")}</p>
            <h3>${escapeHtml(activity.activityName || `活动 ${activity.id || index + 1}`)}</h3>
          </div>
          <dl>
            <div><dt>类型</dt><dd>${escapeHtml(activity.type || "未填写")}</dd></div>
            <div><dt>时间</dt><dd>${escapeHtml(activity.timeStage || "未填写")}</dd></div>
          </dl>
          <p>${escapeHtml(activity.description || "暂无执行说明")}</p>
          <button
            type="button"
            class="secondary"
            data-import-activity
            data-source-id="${escapeHtml(source.id)}"
            data-activity-index="${index}"
          >导入</button>
        </article>`,
    )
    .join("");
}

function renderActivityCards(activities) {
  return Array.from({ length: ACTIVITY_SLOT_COUNT }, (_, index) => {
    const activity = activities[index] || {};
    return `
      <article class="portfolio-card">
        <div class="portfolio-card-heading">
          <h3>活动 ${index + 1}</h3>
          ${renderSelect("activities", index, "status", "当前状态", ACTIVITY_STATUS_OPTIONS, activity.status)}
        </div>
        <div class="portfolio-fields two-column">
          ${renderInput("activities", index, "activityName", "活动名称", activity.activityName)}
          ${renderSelect("activities", index, "type", "活动类型", ACTIVITY_TYPE_OPTIONS, activity.type)}
          ${renderInput("activities", index, "timeStage", "时间阶段", activity.timeStage)}
          ${renderInput("activities", index, "role", "担任角色", activity.role)}
          ${renderTextarea("activities", index, "description", "具体做了什么", activity.description)}
          ${renderTextarea("activities", index, "outcome", "可量化成果", activity.outcome)}
          ${renderInput("activities", index, "proofLink", "证明材料/链接", activity.proofLink, "url", "full-span")}
        </div>
      </article>`;
  }).join("");
}

function renderCompetitionCards(competitions) {
  return Array.from({ length: COMPETITION_SLOT_COUNT }, (_, index) => {
    const competition = competitions[index] || {};
    return `
      <article class="portfolio-card">
        <div class="portfolio-card-heading">
          <h3>竞赛 ${index + 1}</h3>
          ${renderSelect("competitions", index, "status", "当前状态", COMPETITION_STATUS_OPTIONS, competition.status)}
        </div>
        <div class="portfolio-fields two-column">
          ${renderInput("competitions", index, "competitionName", "竞赛名称", competition.competitionName)}
          ${renderInput("competitions", index, "subject", "学科方向", competition.subject)}
          ${renderInput("competitions", index, "yearGrade", "参与年份/年级", competition.yearGrade)}
          ${renderInput("competitions", index, "award", "奖项结果", competition.award)}
          ${renderTextarea("competitions", index, "contribution", "个人贡献", competition.contribution)}
          ${renderInput("competitions", index, "proofLink", "证明材料/链接", competition.proofLink, "url", "full-span")}
        </div>
      </article>`;
  }).join("");
}

function renderSummerSchoolCards(summerSchools) {
  return Array.from({ length: SUMMER_SCHOOL_SLOT_COUNT }, (_, index) => {
    const summerSchool = summerSchools[index] || {};
    return `
      <article class="portfolio-card">
        <div class="portfolio-card-heading">
          <h3>夏校 ${index + 1}</h3>
          ${renderSelect("summerSchools", index, "status", "录取/参与状态", SUMMER_SCHOOL_STATUS_OPTIONS, summerSchool.status)}
        </div>
        <div class="portfolio-fields two-column">
          ${renderInput("summerSchools", index, "programName", "夏校/项目名称", summerSchool.programName)}
          ${renderInput("summerSchools", index, "organizer", "主办方/学校", summerSchool.organizer)}
          ${renderInput("summerSchools", index, "direction", "项目方向", summerSchool.direction)}
          ${renderInput("summerSchools", index, "participationTime", "参与时间", summerSchool.participationTime)}
          ${renderTextarea("summerSchools", index, "output", "项目产出", summerSchool.output)}
          ${renderInput("summerSchools", index, "proofLink", "证明材料/链接", summerSchool.proofLink, "url", "full-span")}
        </div>
      </article>`;
  }).join("");
}

function renderRecommendationLetters(recommendationLetters) {
  const teacher1 = recommendationLetters.teacher1 || {};
  const teacher2 = recommendationLetters.teacher2 || {};
  const outsideRecommender = recommendationLetters.outsideRecommender || {};
  const preparedMaterials = new Set(recommendationLetters.preparedMaterials || []);
  return `
    <div class="portfolio-fields two-column">
      <label class="full-span">
        <span>Counselor 推荐信准备状态</span>
        <input name="counselorStatus" type="text" value="${escapeHtml(recommendationLetters.counselorStatus || "")}" />
      </label>
      ${renderTeacherFields("teacher1", "校内教师 1", teacher1)}
      ${renderTeacherFields("teacher2", "校内教师 2", teacher2)}
      <fieldset class="portfolio-fieldset full-span">
        <legend>校外推荐人</legend>
        <div class="portfolio-fields three-column">
          ${renderStandaloneInput("outsideRecommender.identity", "身份", outsideRecommender.identity)}
          ${renderStandaloneInput("outsideRecommender.relationship", "关系", outsideRecommender.relationship)}
          ${renderStandaloneInput("outsideRecommender.scenario", "适用场景", outsideRecommender.scenario)}
        </div>
      </fieldset>
      <fieldset class="portfolio-fieldset full-span">
        <legend>已准备材料</legend>
        <div class="portfolio-checkboxes">
          ${PREPARED_MATERIAL_OPTIONS.map(
            (material) => `
              <label>
                <input
                  type="checkbox"
                  name="preparedMaterials"
                  value="${escapeHtml(material)}"
                  ${preparedMaterials.has(material) ? "checked" : ""}
                />
                <span>${escapeHtml(material)}</span>
              </label>`,
          ).join("")}
        </div>
      </fieldset>
      <label class="full-span">
        <span>备注</span>
        <textarea name="notes">${escapeHtml(recommendationLetters.notes || "")}</textarea>
      </label>
    </div>`;
}

function renderTeacherFields(prefix, title, teacher) {
  return `
    <fieldset class="portfolio-fieldset full-span">
      <legend>${escapeHtml(title)}</legend>
      <div class="portfolio-fields four-column">
        ${renderStandaloneInput(`${prefix}.subject`, "科目", teacher.subject)}
        ${renderStandaloneInput(`${prefix}.teacherName`, "老师姓名", teacher.teacherName)}
        ${renderStandaloneSelect(
          `${prefix}.relationshipStrength`,
          "关系强度",
          RELATIONSHIP_STRENGTH_OPTIONS,
          teacher.relationshipStrength,
        )}
        ${renderStandaloneInput(`${prefix}.materials`, "可提供材料", teacher.materials)}
      </div>
    </fieldset>`;
}

function renderInput(group, index, field, label, value = "", type = "text", className = "") {
  return `
    <label${className ? ` class="${escapeHtml(className)}"` : ""}>
      <span>${escapeHtml(label)}</span>
      <input name="${controlName(group, index, field)}" type="${type}" value="${escapeHtml(value)}" />
    </label>`;
}

function renderStandaloneInput(name, label, value = "") {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="text" value="${escapeHtml(value)}" />
    </label>`;
}

function renderTextarea(group, index, field, label, value = "") {
  return `
    <label class="full-span">
      <span>${escapeHtml(label)}</span>
      <textarea name="${controlName(group, index, field)}">${escapeHtml(value)}</textarea>
    </label>`;
}

function renderSelect(group, index, field, label, options, value = "") {
  return renderStandaloneSelect(controlName(group, index, field), label, options, value);
}

function renderStandaloneSelect(name, label, options, value = "") {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        <option value="">请选择</option>
        ${options
          .map(
            (option) =>
              `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`,
          )
          .join("")}
      </select>
    </label>`;
}

function collectPortfolio() {
  return {
    applicationPlan: collectApplicationPlan(),
    activities: collectEntries("activities", ACTIVITY_SLOT_COUNT, activityFields),
    competitions: collectEntries("competitions", COMPETITION_SLOT_COUNT, competitionFields),
    summerSchools: collectEntries("summerSchools", SUMMER_SCHOOL_SLOT_COUNT, summerSchoolFields),
    recommendationLetters: collectRecommendationLetters(),
  };
}

function collectEntries(group, count, fields) {
  return Array.from({ length: count }, (_, index) => {
    const entry = Object.fromEntries(
      fields.map((field) => [field, fieldValue(controlName(group, index, field))]),
    );
    return entry;
  }).filter(hasAnyValue);
}

function collectApplicationPlan() {
  const plan = emptyApplicationPlan();
  if (!applicationPlanList) return plan;

  for (const round of APPLICATION_ROUND_CONFIG) {
    const rows = Array.from(
      applicationPlanList.querySelectorAll(`[data-application-round="${round.key}"]`),
    );
    plan[round.key] = rows
      .map((row) => {
        const index = Number(row.dataset.applicationIndex || 0);
        return {
          school: fieldValue(applicationControlName(round.key, index, "school")),
          major: fieldValue(applicationControlName(round.key, index, "major")),
        };
      })
      .filter((entry) => entry.school);
  }

  if (plan.rea.length > 0) plan.ed1 = [];
  return plan;
}

function collectRecommendationLetters() {
  return pruneEmpty({
    counselorStatus: fieldValue("counselorStatus"),
    teacher1: collectNestedFields("teacher1", [
      "subject",
      "teacherName",
      "relationshipStrength",
      "materials",
    ]),
    teacher2: collectNestedFields("teacher2", [
      "subject",
      "teacherName",
      "relationshipStrength",
      "materials",
    ]),
    outsideRecommender: collectNestedFields("outsideRecommender", [
      "identity",
      "relationship",
      "scenario",
    ]),
    preparedMaterials: Array.from(
      portfolioForm.querySelectorAll('input[name="preparedMaterials"]:checked'),
      (input) => input.value,
    ),
    notes: fieldValue("notes"),
  });
}

function collectNestedFields(prefix, fields) {
  return pruneEmpty(Object.fromEntries(fields.map((field) => [field, fieldValue(`${prefix}.${field}`)])));
}

function mapPlanningActivityToPortfolio(activity) {
  return {
    activityName: activity.activityName || "",
    type: activity.type || "",
    timeStage: activity.timeStage || "",
    role: "",
    description: activity.description || "",
    outcome: "",
    proofLink: "",
    status: activity.status || "计划中",
  };
}

function importPlanningActivity(sourceId, activityIndex) {
  const source = planningActivitySources.find((item) => item.id === sourceId);
  const activity = source?.activities?.[activityIndex];
  if (!activity) {
    setImportStatus("未找到这项规划活动，请刷新页面后重试。", true);
    return;
  }
  const portfolio = collectPortfolio();
  if (portfolio.activities.length >= ACTIVITY_SLOT_COUNT) {
    setImportStatus("课外活动已满 10 项，请先清空一个活动槽位。", true);
    return;
  }

  portfolio.activities.push(mapPlanningActivityToPortfolio(activity));
  renderPortfolio(portfolio);
  isDirty = true;
  updateCompletion();
  setStatus("已导入 1 项活动，请保存进度。");
  setImportStatus(`已导入：${activity.activityName || "未命名活动"}`);
  portfolioForm.elements.namedItem(controlName("activities", portfolio.activities.length - 1, "activityName"))?.focus();
}

function updateCompletion() {
  const portfolio = collectPortfolio();
  if (applicationPlanProgress) {
    applicationPlanProgress.textContent = `选校计划：已填写 ${countApplicationPlanSchools(portfolio.applicationPlan)} 所`;
  }
  activitiesProgress.textContent = `课外活动：已填写 ${portfolio.activities.length}/${ACTIVITY_SLOT_COUNT}`;
  competitionsProgress.textContent = `竞赛：已填写 ${portfolio.competitions.length}/${COMPETITION_SLOT_COUNT}`;
  summerSchoolsProgress.textContent = `夏校：已填写 ${portfolio.summerSchools.length}/${SUMMER_SCHOOL_SLOT_COUNT}`;
  recommendationProgress.textContent = hasAnyRecommendation(portfolio.recommendationLetters)
    ? "推荐信：已填写"
    : "推荐信：待补充";
}

function countApplicationPlanSchools(plan = emptyApplicationPlan()) {
  return Object.values(plan).reduce((total, entries) => total + (entries?.length || 0), 0);
}

async function loadActivityImportSources() {
  if (!activityImportSources) return;
  try {
    setImportStatus("正在加载导入源");
    const data = await requestJson(ACTIVITY_IMPORT_SOURCES_ENDPOINT, { method: "GET" });
    planningActivitySources = data.sources || [];
    renderActivityImportSources(planningActivitySources);
    setImportStatus(planningActivitySources.length ? "选择单项活动导入" : "暂无可导入活动");
  } catch (error) {
    setImportStatus(error.message, true);
  }
}

async function loadApplicationRoundSchools() {
  if (!applicationPlanList) return;
  try {
    const response = await fetch(APPLICATION_ROUND_SCHOOLS_ENDPOINT);
    if (response.status === 401) {
      window.location.href = "./index.html";
      throw new Error("请先登录");
    }
    if (!response.ok) throw new Error("院校轮次数据加载失败");
    applicationRoundSchools = parseApplicationRoundSchoolsMarkdown(await response.text());
    const plan = collectPortfolio().applicationPlan;
    currentPortfolio = { ...currentPortfolio, applicationPlan: plan };
    renderApplicationPlan(plan);
  } catch (error) {
    applicationPlanList.innerHTML = `<p class="portfolio-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function loadPortfolio() {
  try {
    setStatus("正在加载");
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    renderPortfolio(portfolio);
    isDirty = false;
    setStatus(portfolio.updatedAt ? `上次保存：${formatDate(portfolio.updatedAt)}` : "尚未保存");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function savePortfolio() {
  try {
    setButtonsDisabled(true);
    setStatus("保存中...");
    const saved = await requestJson(MY_ACTIVITIES_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify(collectPortfolio()),
    });
    renderPortfolio(saved);
    isDirty = false;
    updateCompletion();
    setStatus("已保存");
    return saved;
  } catch (error) {
    setStatus(error.message, true);
    return null;
  } finally {
    setButtonsDisabled(false);
  }
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

function addApplicationRound(roundKey) {
  const round = APPLICATION_ROUND_CONFIG.find((item) => item.key === roundKey && item.addable);
  if (!round) return;
  applicationRoundRowCounts[roundKey] = (applicationRoundRowCounts[roundKey] || 1) + 1;
  const portfolio = collectPortfolio();
  renderPortfolio(portfolio);
  isDirty = true;
  setStatus("有未保存修改");
  updateCompletion();
  portfolioForm.elements
    .namedItem(applicationControlName(roundKey, applicationRoundRowCounts[roundKey] - 1, "school"))
    ?.focus();
}

function enforceEarlyBindingExclusivity(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.value) return;
  if (target.name === applicationControlName("rea", 0, "school")) clearApplicationRound("ed1");
  if (target.name === applicationControlName("ed1", 0, "school")) clearApplicationRound("rea");
}

function clearApplicationRound(roundKey) {
  for (const field of ["school", "major"]) {
    const element = portfolioForm.elements.namedItem(applicationControlName(roundKey, 0, field));
    if (element) element.value = "";
  }
}

function fieldValue(name) {
  const element = portfolioForm.elements.namedItem(name);
  return String(element?.value || "").trim();
}

function controlName(group, index, field) {
  return `${group}_${index}_${field}`;
}

function applicationControlName(roundKey, index, field) {
  return `applicationPlan_${roundKey}_${index}_${field}`;
}

function hasAnyValue(entry) {
  return Object.values(entry).some((value) => String(value || "").trim());
}

function hasAnyRecommendation(entry) {
  if (!entry || typeof entry !== "object") return false;
  return Object.values(entry).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return hasAnyRecommendation(value);
    return Boolean(String(value || "").trim());
  });
}

function pruneEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) return entry.length > 0;
      if (entry && typeof entry === "object") return Object.keys(entry).length > 0;
      return Boolean(entry);
    }),
  );
}

function setStatus(message, isError = false) {
  portfolioStatus.textContent = message;
  portfolioStatus.classList.toggle("error", isError);
}

function setImportStatus(message, isError = false) {
  if (!activityImportStatus) return;
  activityImportStatus.textContent = message;
  activityImportStatus.classList.toggle("error", isError);
}

function setButtonsDisabled(disabled) {
  savePortfolioButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function markDirty() {
  if (isRendering) return;
  isDirty = true;
  setStatus("有未保存修改");
  updateCompletion();
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

portfolioForm.addEventListener("input", markDirty);
portfolioForm.addEventListener("change", (event) => {
  enforceEarlyBindingExclusivity(event);
  markDirty();
});
savePortfolioButtons.forEach((button) => {
  button.addEventListener("click", savePortfolio);
});
applicationPlanList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-application-round]");
  if (!button) return;
  addApplicationRound(button.dataset.addApplicationRound);
});
activityImportSources?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-activity]");
  if (!button) return;
  importPlanningActivity(button.dataset.sourceId, Number(button.dataset.activityIndex));
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

renderPortfolio();
loadApplicationRoundSchools();
loadPortfolio();
loadActivityImportSources();
