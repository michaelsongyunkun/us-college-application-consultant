import { escapeHtml } from "./html-utils.mjs";
import {
  APPLICATION_ROUND_LABELS,
  getEligibleSchools,
  parseApplicationRoundSchoolsMarkdown,
} from "../domain/application-round-schools.mjs";
import { markdownToPlainText } from "../domain/agent-output-parser.mjs?v=20260531-import-visual-text";

const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const ACTIVITY_IMPORT_SOURCES_ENDPOINT = "/api/my-activities/import-sources";
const APPLICATION_ROUND_SCHOOLS_ENDPOINT = "./data/application-round-schools.md";
const ACTIVITY_SLOT_COUNT = 10;
const COMPETITION_SLOT_COUNT = 5;
const SUMMER_SCHOOL_SLOT_COUNT = 3;
const GPA_SCALE_OPTIONS = ["4.0分制", "100分制", "4.3分制", "5分制"];
const GPA_GRADE_OPTIONS = ["9年级", "10年级", "11年级", "12年级"];
const GPA_TERM_OPTIONS = ["上学期", "下学期"];
const GPA_DEFAULT_RECORDS = GPA_GRADE_OPTIONS.flatMap((gradeLevel) =>
  GPA_TERM_OPTIONS.map((term) => ({ gradeLevel, term, gpa: "" })),
);
const AP_SCORE_OPTIONS = ["1", "2", "3", "4", "5", "未出分"];
const AP_COURSE_OPTIONS = [
  "AP Seminar（专题研讨）",
  "AP Research（研究）",
  "AP 2-D Art and Design（二维设计）",
  "AP 3-D Art and Design（三维设计）",
  "AP Drawing（绘画）",
  "AP Art History（艺术史）",
  "AP Music Theory（乐理）",
  "AP English Language and Composition（英语语言与写作）",
  "AP English Literature and Composition（英语文学与写作）",
  "AP Comparative Government and Politics（比较政府与政治）",
  "AP European History（欧洲史）",
  "AP Human Geography（人文地理）",
  "AP Macroeconomics（宏观经济学）",
  "AP Microeconomics（微观经济学）",
  "AP Psychology（心理学）",
  "AP US Government and Politics（美国政府与政治）",
  "AP United States History（美国历史 APUSH）",
  "AP World History: Modern（世界历史：现代）",
  "AP African American Studies（非裔美国人研究）",
  "AP Precalculus（微积分预备）",
  "AP Calculus AB（微积分 AB）",
  "AP Calculus BC（微积分 BC）",
  "AP Statistics（统计学）",
  "AP Computer Science A（计算机科学 A）",
  "AP Computer Science Principles（计算机科学原理 CSP）",
  "AP Biology（生物）",
  "AP Chemistry（化学）",
  "AP Environmental Science（环境科学 APES）",
  "AP Physics 1（物理 1，代数基础）",
  "AP Physics 2（物理 2，代数基础）",
  "AP Physics C: Mechanics（物理 C：力学，微积分基础）",
  "AP Physics C: Electricity and Magnetism（物理 C：电磁学）",
  "AP Chinese Language and Culture（中文语言与文化）",
  "AP French Language and Culture（法语语言与文化）",
  "AP German Language and Culture（德语语言与文化）",
  "AP Italian Language and Culture（意大利语语言与文化）",
  "AP Japanese Language and Culture（日语语言与文化）",
  "AP Latin（拉丁语）",
  "AP Spanish Language and Culture（西班牙语语言与文化）",
  "AP Spanish Literature and Culture（西班牙语文学与文化）",
];

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
const gpaRecordFields = ["gradeLevel", "term", "gpa"];
const satTestFields = ["totalScore", "englishScore", "mathScore", "testDate"];
const apExamFields = ["courseName", "score", "examYear"];

const portfolioForm = document.querySelector("#portfolioForm");
const savePortfolioButton = document.querySelector("#savePortfolioButton");
const savePortfolioButtons = document.querySelectorAll("[data-save-portfolio], #savePortfolioButton");
const portfolioStatus = document.querySelector("#portfolioStatus");
const academicRecordsProgress = document.querySelector("#academicRecordsProgress");
const academicRecordsPanel = document.querySelector("#academicRecordsPanel");
const gpaRecordsList = document.querySelector("#gpaRecordsList");
const satTestsList = document.querySelector("#satTestsList");
const apExamsList = document.querySelector("#apExamsList");
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

function cleanPlanningActivityText(value, fallback = "") {
  return markdownToPlainText(value).replace(/\s+/g, " ").trim() || fallback;
}

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
    academicRecords: emptyAcademicRecords(),
    applicationPlan: emptyApplicationPlan(),
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    updatedAt: null,
  };
}

function emptyAcademicRecords() {
  return {
    gpaScale: "",
    gpaRecords: GPA_DEFAULT_RECORDS.map((record) => ({ ...record })),
    satTests: [],
    apExams: [],
  };
}

function renderPortfolio(portfolio = emptyPortfolio()) {
  currentPortfolio = normalizePortfolioForView(portfolio);
  syncApplicationRowCounts(currentPortfolio.applicationPlan);
  isRendering = true;
  renderAcademicRecords(currentPortfolio.academicRecords);
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
    academicRecords: normalizeAcademicRecordsForView(portfolio.academicRecords),
    applicationPlan: normalizeApplicationPlanForView(portfolio.applicationPlan),
    activities: portfolio.activities || [],
    competitions: portfolio.competitions || [],
    summerSchools: portfolio.summerSchools || [],
    recommendationLetters: portfolio.recommendationLetters || {},
  };
}

function normalizeAcademicRecordsForView(records = emptyAcademicRecords()) {
  const fallback = emptyAcademicRecords();
  return {
    gpaScale: records?.gpaScale || "",
    gpaRecords: Array.isArray(records?.gpaRecords) ? records.gpaRecords : fallback.gpaRecords,
    satTests: Array.isArray(records?.satTests) ? records.satTests : [],
    apExams: Array.isArray(records?.apExams) ? records.apExams : [],
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

function renderAcademicRecords(records = emptyAcademicRecords()) {
  const normalized = normalizeAcademicRecordsForView(records);
  if (gpaRecordsList) {
    gpaRecordsList.innerHTML = `
      <div class="academic-record-scale">
        ${renderStandaloneSelect("academicRecords_gpaScale", "GPA分制", GPA_SCALE_OPTIONS, normalized.gpaScale)}
      </div>
      ${renderGpaRecords(normalized.gpaRecords)}`;
  }
  if (satTestsList) {
    satTestsList.innerHTML = renderSatTests(normalized.satTests);
  }
  if (apExamsList) {
    apExamsList.innerHTML = renderApExams(normalized.apExams);
  }
}

function renderGpaRecords(records = []) {
  if (!records.length) return '<p class="portfolio-empty">暂无 GPA 学期记录，可点击“新增学期”补充。</p>';
  return records
    .map((record, index) => {
      const title = `${record.gradeLevel || "GPA"} ${record.term || ""}`.trim() || `GPA ${index + 1}`;
      return `
        <div class="academic-record-row gpa-record-row" data-academic-row="gpa" data-academic-index="${index}">
          <h4>${escapeHtml(title)}</h4>
          ${renderSelect("academicGpa", index, "gradeLevel", "年级", GPA_GRADE_OPTIONS, record.gradeLevel)}
          ${renderSelect("academicGpa", index, "term", "学期", GPA_TERM_OPTIONS, record.term)}
          ${renderInput("academicGpa", index, "gpa", "GPA", record.gpa, "text")}
          ${renderAcademicRemoveButton("gpa", index, "删除学期")}
        </div>`;
    })
    .join("");
}

function renderSatTests(records = []) {
  if (!records.length) return '<p class="portfolio-empty">暂无 SAT 考试记录，可点击“新增SAT”补充。</p>';
  return records
    .map(
      (record, index) => `
        <div class="academic-record-row sat-record-row" data-academic-row="sat" data-academic-index="${index}">
          <h4>SAT ${index + 1}</h4>
          ${renderNumberInput("academicSat", index, "totalScore", "SAT总分", record.totalScore, 400, 1600)}
          ${renderNumberInput("academicSat", index, "englishScore", "英文分数", record.englishScore, 200, 800)}
          ${renderNumberInput("academicSat", index, "mathScore", "数学分数", record.mathScore, 200, 800)}
          ${renderInput("academicSat", index, "testDate", "考试日期", record.testDate, "date")}
          ${renderAcademicRemoveButton("sat", index, "删除SAT")}
        </div>`,
    )
    .join("");
}

function renderApExams(records = []) {
  if (!records.length) return '<p class="portfolio-empty">暂无 AP 考试记录，可点击“新增AP”补充。</p>';
  return records
    .map(
      (record, index) => `
        <div class="academic-record-row ap-record-row" data-academic-row="ap" data-academic-index="${index}">
          <h4>AP ${index + 1}</h4>
          ${renderSelect("academicAp", index, "courseName", "AP科目", AP_COURSE_OPTIONS, record.courseName)}
          ${renderSelect("academicAp", index, "score", "分数", AP_SCORE_OPTIONS, record.score)}
          ${renderInput("academicAp", index, "examYear", "考试年份", record.examYear, "number")}
          ${renderAcademicRemoveButton("ap", index, "删除AP")}
        </div>`,
    )
    .join("");
}

function renderAcademicRemoveButton(type, index, label) {
  return `
    <button
      type="button"
      class="danger academic-record-remove-button"
      data-remove-academic-record="${escapeHtml(type)}"
      data-academic-index="${index}"
      aria-label="${escapeHtml(label)} ${index + 1}"
    >删除</button>`;
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
    <div class="application-plan-row${round.addable ? " with-action" : ""}" data-application-round="${escapeHtml(round.key)}" data-application-index="${index}">
      ${renderApplicationSchoolSelect(round.key, index, entry.school)}
      ${renderApplicationMajorInput(round.key, index, entry.major)}
      ${round.addable ? renderApplicationRemoveButton(round.key, round.label, index) : ""}
    </div>`;
}

function renderApplicationRemoveButton(roundKey, label, index) {
  return `
    <button
      type="button"
      class="danger application-remove-button"
      data-remove-application-round="${escapeHtml(roundKey)}"
      data-application-index="${index}"
      aria-label="删除 ${escapeHtml(label)} 第 ${index + 1} 所"
    >删除</button>`;
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
    .map(({ source, activity, index }) => {
      const activityName = cleanPlanningActivityText(activity.activityName, `活动 ${activity.id || index + 1}`);
      const type = cleanPlanningActivityText(activity.type, "未填写");
      const timeStage = cleanPlanningActivityText(activity.timeStage, "未填写");
      const description = cleanPlanningActivityText(activity.description, "暂无执行说明");
      return `
        <article class="activity-import-card">
          <div>
            <p class="activity-import-source">${escapeHtml(source.label || source.planName || "申请规划")}</p>
            <h3>${escapeHtml(activityName)}</h3>
          </div>
          <dl>
            <div><dt>类型</dt><dd>${escapeHtml(type)}</dd></div>
            <div><dt>时间</dt><dd>${escapeHtml(timeStage)}</dd></div>
          </dl>
          <p>${escapeHtml(description)}</p>
          <button
            type="button"
            class="secondary"
            data-import-activity
            data-source-id="${escapeHtml(source.id)}"
            data-activity-index="${index}"
          >导入</button>
        </article>`;
    })
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

function renderNumberInput(group, index, field, label, value = "", min = "", max = "") {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input
        name="${controlName(group, index, field)}"
        type="number"
        min="${escapeHtml(min)}"
        max="${escapeHtml(max)}"
        step="1"
        value="${escapeHtml(value)}"
      />
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
    academicRecords: collectAcademicRecords(),
    applicationPlan: collectApplicationPlan(),
    activities: collectEntries("activities", ACTIVITY_SLOT_COUNT, activityFields),
    competitions: collectEntries("competitions", COMPETITION_SLOT_COUNT, competitionFields),
    summerSchools: collectEntries("summerSchools", SUMMER_SCHOOL_SLOT_COUNT, summerSchoolFields),
    recommendationLetters: collectRecommendationLetters(),
  };
}

function collectAcademicRecords() {
  return {
    gpaScale: fieldValue("academicRecords_gpaScale"),
    gpaRecords: collectAcademicRows("gpa", "academicGpa", gpaRecordFields),
    satTests: collectAcademicRows("sat", "academicSat", satTestFields),
    apExams: collectAcademicRows("ap", "academicAp", apExamFields),
  };
}

function collectAcademicRows(section, group, fields) {
  const rows = Array.from(
    academicRecordsPanel?.querySelectorAll(`[data-academic-row="${section}"]`) || [],
  );
  return rows
    .map((row) => {
      const index = Number(row.dataset.academicIndex || 0);
      return Object.fromEntries(
        fields.map((field) => [field, fieldValue(controlName(group, index, field))]),
      );
    })
    .filter(hasAnyValue);
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
    activityName: cleanPlanningActivityText(activity.activityName),
    type: cleanPlanningActivityText(activity.type),
    timeStage: cleanPlanningActivityText(activity.timeStage),
    role: "",
    description: cleanPlanningActivityText(activity.description),
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
  setImportStatus(`已导入：${cleanPlanningActivityText(activity.activityName, "未命名活动")}`);
  portfolioForm.elements.namedItem(controlName("activities", portfolio.activities.length - 1, "activityName"))?.focus();
}

function updateCompletion() {
  const portfolio = collectPortfolio();
  if (academicRecordsProgress) {
    const records = portfolio.academicRecords || emptyAcademicRecords();
    academicRecordsProgress.textContent = `成绩档案：GPA ${records.gpaRecords.length} 学期 / SAT ${records.satTests.length} 次 / AP ${records.apExams.length} 门`;
  }
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

function addAcademicRecord(type) {
  const portfolio = collectPortfolio();
  portfolio.academicRecords = portfolio.academicRecords || emptyAcademicRecords();
  if (type === "gpa") {
    portfolio.academicRecords.gpaRecords.push({ gradeLevel: "", term: "", gpa: "" });
  }
  if (type === "sat") {
    portfolio.academicRecords.satTests.push({
      totalScore: "",
      englishScore: "",
      mathScore: "",
      testDate: "",
    });
  }
  if (type === "ap") {
    portfolio.academicRecords.apExams.push({ courseName: "", score: "", examYear: "" });
  }
  renderPortfolio(portfolio);
  isDirty = true;
  setStatus("有未保存修改");
  updateCompletion();
  focusAcademicRecord(type, portfolio.academicRecords);
}

function removeAcademicRecord(type, index) {
  if (!Number.isInteger(index) || index < 0) return;
  const portfolio = collectPortfolio();
  const academicRecords = portfolio.academicRecords || emptyAcademicRecords();
  if (type === "gpa") academicRecords.gpaRecords.splice(index, 1);
  if (type === "sat") academicRecords.satTests.splice(index, 1);
  if (type === "ap") academicRecords.apExams.splice(index, 1);
  portfolio.academicRecords = academicRecords;
  renderPortfolio(portfolio);
  isDirty = true;
  setStatus("有未保存修改");
  updateCompletion();
}

function focusAcademicRecord(type, records) {
  const focusMap = {
    gpa: ["academicGpa", records.gpaRecords.length - 1, "gradeLevel"],
    sat: ["academicSat", records.satTests.length - 1, "totalScore"],
    ap: ["academicAp", records.apExams.length - 1, "courseName"],
  };
  const [group, index, field] = focusMap[type] || [];
  if (!group || index < 0) return;
  portfolioForm.elements.namedItem(controlName(group, index, field))?.focus();
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

function removeApplicationRound(roundKey, index) {
  const round = APPLICATION_ROUND_CONFIG.find((item) => item.key === roundKey && item.addable);
  if (!round || !Number.isInteger(index) || index < 0) return;
  const rows = collectApplicationRoundRows(roundKey);
  if (!rows[index]) return;
  rows.splice(index, 1);
  applicationRoundRowCounts[roundKey] = Math.max(rows.length, 1);
  const portfolio = collectPortfolio();
  portfolio.applicationPlan[roundKey] = rows.filter((entry) => entry.school);
  renderPortfolio(portfolio);
  isDirty = true;
  setStatus("有未保存修改");
  updateCompletion();
}

function collectApplicationRoundRows(roundKey) {
  return Array.from(applicationPlanList.querySelectorAll(`[data-application-round="${roundKey}"]`)).map(
    (row) => {
      const index = Number(row.dataset.applicationIndex || 0);
      return {
        school: fieldValue(applicationControlName(roundKey, index, "school")),
        major: fieldValue(applicationControlName(roundKey, index, "major")),
      };
    },
  );
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
academicRecordsPanel?.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-academic-record]");
  if (addButton) {
    addAcademicRecord(addButton.dataset.addAcademicRecord);
    return;
  }
  const removeButton = event.target.closest("[data-remove-academic-record]");
  if (!removeButton) return;
  removeAcademicRecord(
    removeButton.dataset.removeAcademicRecord,
    Number(removeButton.dataset.academicIndex),
  );
});
applicationPlanList?.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-application-round]");
  if (addButton) {
    addApplicationRound(addButton.dataset.addApplicationRound);
    return;
  }
  const removeButton = event.target.closest("[data-remove-application-round]");
  if (!removeButton) return;
  removeApplicationRound(
    removeButton.dataset.removeApplicationRound,
    Number(removeButton.dataset.applicationIndex),
  );
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
