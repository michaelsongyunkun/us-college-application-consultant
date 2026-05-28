import { escapeHtml } from "./html-utils.mjs";

const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const ACTIVITY_SLOT_COUNT = 10;
const COMPETITION_SLOT_COUNT = 5;
const SUMMER_SCHOOL_SLOT_COUNT = 3;

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
const activitiesList = document.querySelector("#activitiesList");
const competitionsList = document.querySelector("#competitionsList");
const summerSchoolsList = document.querySelector("#summerSchoolsList");
const recommendationLettersPanel = document.querySelector("#recommendationLettersPanel");

let isDirty = false;
let isRendering = false;

function emptyPortfolio() {
  return {
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    updatedAt: null,
  };
}

function renderPortfolio(portfolio = emptyPortfolio()) {
  isRendering = true;
  activitiesList.innerHTML = renderActivityCards(portfolio.activities || []);
  competitionsList.innerHTML = renderCompetitionCards(portfolio.competitions || []);
  summerSchoolsList.innerHTML = renderSummerSchoolCards(portfolio.summerSchools || []);
  recommendationLettersPanel.innerHTML = renderRecommendationLetters(
    portfolio.recommendationLetters || {},
  );
  isRendering = false;
  updateCompletion();
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
          ${renderInput("activities", index, "proofLink", "证明材料/链接", activity.proofLink, "url")}
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
          ${renderInput("competitions", index, "proofLink", "证明材料/链接", competition.proofLink, "url")}
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
          ${renderInput("summerSchools", index, "proofLink", "证明材料/链接", summerSchool.proofLink, "url")}
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

function renderInput(group, index, field, label, value = "", type = "text") {
  return `
    <label>
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

function updateCompletion() {
  const portfolio = collectPortfolio();
  activitiesProgress.textContent = `课外活动：已填写 ${portfolio.activities.length}/${ACTIVITY_SLOT_COUNT}`;
  competitionsProgress.textContent = `竞赛：已填写 ${portfolio.competitions.length}/${COMPETITION_SLOT_COUNT}`;
  summerSchoolsProgress.textContent = `夏校：已填写 ${portfolio.summerSchools.length}/${SUMMER_SCHOOL_SLOT_COUNT}`;
  recommendationProgress.textContent = hasAnyRecommendation(portfolio.recommendationLetters)
    ? "推荐信：已填写"
    : "推荐信：待补充";
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

function fieldValue(name) {
  const element = portfolioForm.elements.namedItem(name);
  return String(element?.value || "").trim();
}

function controlName(group, index, field) {
  return `${group}_${index}_${field}`;
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
portfolioForm.addEventListener("change", markDirty);
savePortfolioButtons.forEach((button) => {
  button.addEventListener("click", savePortfolio);
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

renderPortfolio();
loadPortfolio();
