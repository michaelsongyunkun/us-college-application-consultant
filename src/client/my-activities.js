import { escapeHtml } from "./html-utils.mjs";
import {
  APPLICATION_ROUND_LABELS,
  getEligibleSchools,
  parseApplicationBackupSchoolsMarkdown,
  parseApplicationRoundSchoolsMarkdown,
} from "../domain/application-round-schools.mjs";
import { markdownToPlainText } from "../domain/agent-output-parser.mjs?v=20260531-import-visual-text";
import { buildSvgDocument } from "../domain/svg-export.mjs?v=20260531-svg-wrap";
import { buildWordDocument } from "../domain/word-export.mjs?v=20260601-word-export";
import { insertEntryIntoFirstEmptySlot } from "./portfolio-entry-slots.mjs?v=20260601-activity-import-slot";
import { csrfFetch } from "./csrf-token.mjs";

const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const CAPABILITY_ASSESSMENT_JOB_ENDPOINT = "/api/portfolio-capability-assessment-jobs";
const CAPABILITY_ASSESSMENT_PENDING_JOB_KEY = "portfolio-capability-assessment-pending-job";
const CAPABILITY_ASSESSMENT_JOB_POLL_INTERVAL_MS = 3000;
const CAPABILITY_ASSESSMENT_JOB_TIMEOUT_MS = 8 * 60 * 1000;
const ACTIVITY_IMPORT_SOURCES_ENDPOINT = "/api/my-activities/import-sources";
const APPLICATION_ROUND_SCHOOLS_ENDPOINT = "./data/application-round-schools.md";
const APPLICATION_BACKUP_SCHOOLS_ENDPOINTS = [
  "./data/international-schools.md",
  "./data/other-region-schools.md",
];
const ACTIVITY_SLOT_COUNT = 10;
const COMPETITION_SLOT_COUNT = 5;
const SUMMER_SCHOOL_SLOT_COUNT = 3;
const COURSE_SYSTEM_IB = "IB课程";
const COURSE_SYSTEM_OTHER = "其他课程体系";
const COURSE_SYSTEM_OPTIONS = [COURSE_SYSTEM_IB, COURSE_SYSTEM_OTHER];
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
  {
    key: "multiCountry",
    label: "多国联申",
    title: "多国联申",
    addable: true,
    note: "英港澳加新与其他地区院校申请备份",
  },
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
const exportPortfolioSvgButton = document.querySelector("#exportPortfolioSvgButton");
const exportPortfolioWordButton = document.querySelector("#exportPortfolioWordButton");
const clearPortfolioButton = document.querySelector("#clearPortfolioButton");
const generateCapabilityAssessmentButton = document.querySelector("#generateCapabilityAssessmentButton");
const portfolioActionButtons = document.querySelectorAll(
  [
    "[data-save-portfolio]",
    "#savePortfolioButton",
    "#exportPortfolioSvgButton",
    "#exportPortfolioWordButton",
    "#clearPortfolioButton",
    "#generateCapabilityAssessmentButton",
  ].join(", "),
);
const portfolioStatus = document.querySelector("#portfolioStatus");
const academicRecordsProgress = document.querySelector("#academicRecordsProgress");
const academicRecordsPanel = document.querySelector("#academicRecordsPanel");
const gpaRecordsList = document.querySelector("#gpaRecordsList");
const addGpaRecordButton = document.querySelector("#addGpaRecordButton");
const academicCourseBlockTitle = document.querySelector("#academicCourseBlockTitle");
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
const capabilityAssessmentContent = document.querySelector("#capabilityAssessmentContent");
const capabilityAssessmentStatus = document.querySelector("#capabilityAssessmentStatus");
const portfolioCompletionCards = {
  academic: document.querySelector("#portfolioCompletionAcademic"),
  activities: document.querySelector("#portfolioCompletionActivities"),
  schoolPlan: document.querySelector("#portfolioCompletionSchoolPlan"),
};

let isDirty = false;
let isRendering = false;
let capabilityAssessmentJobPolling = false;
let currentPortfolio = emptyPortfolio();
let applicationRoundSchools = [];
let applicationRoundRowCounts = { ea: 1, uc: 1, rd: 1, multiCountry: 1 };
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
    multiCountry: [],
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
    planningActions: [],
    deepSeekNotes: [],
    schoolSelectionVersions: [],
    capabilityAssessment: {},
    updatedAt: null,
  };
}

function emptyAcademicRecords() {
  return {
    courseSystem: "",
    ibPredictedScore: "",
    gpaScale: "",
    gpaRecords: GPA_DEFAULT_RECORDS.map((record) => ({ ...record })),
    satTests: [],
    apExams: [],
    standardizedPlan: {},
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
  renderCapabilityAssessment(currentPortfolio.capabilityAssessment, currentPortfolio);
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
    planningActions: Array.isArray(portfolio.planningActions) ? portfolio.planningActions : [],
    deepSeekNotes: Array.isArray(portfolio.deepSeekNotes) ? portfolio.deepSeekNotes : [],
    schoolSelectionVersions: Array.isArray(portfolio.schoolSelectionVersions)
      ? portfolio.schoolSelectionVersions
      : [],
    capabilityAssessment: normalizeCapabilityAssessmentForView(portfolio.capabilityAssessment),
  };
}

function normalizeCapabilityAssessmentForView(assessment = {}) {
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) return {};
  const radarScores = Array.isArray(assessment.radarScores)
    ? assessment.radarScores
        .map((score) => ({
          key: String(score?.key || "").trim(),
          label: String(score?.label || "").trim(),
          score: clampScore(score?.score),
          confidence: ["high", "medium", "low"].includes(String(score?.confidence || "").toLowerCase())
            ? String(score.confidence).toLowerCase()
            : "medium",
          evidence: Array.isArray(score?.evidence) ? score.evidence.map(String).filter(Boolean).slice(0, 5) : [],
          missing: Array.isArray(score?.missing) ? score.missing.map(String).filter(Boolean).slice(0, 5) : [],
          nextAction: String(score?.nextAction || "").trim(),
        }))
        .filter((score) => score.key && score.label)
    : [];
  if (!radarScores.length) return {};
  return {
    version: String(assessment.version || "deepseek-agent-v1"),
    generatedAt: String(assessment.generatedAt || ""),
    inputHash: String(assessment.inputHash || ""),
    inputCompleteness: clampScore(assessment.inputCompleteness),
    overallScore: clampScore(assessment.overallScore),
    overallSummary: String(assessment.overallSummary || "").trim(),
    radarScores,
    strengths: Array.isArray(assessment.strengths) ? assessment.strengths.map(String).filter(Boolean).slice(0, 8) : [],
    gaps: Array.isArray(assessment.gaps) ? assessment.gaps.map(String).filter(Boolean).slice(0, 8) : [],
    actions30Days: Array.isArray(assessment.actions30Days)
      ? assessment.actions30Days.map(String).filter(Boolean).slice(0, 8)
      : [],
    generatedBy: String(assessment.generatedBy || ""),
  };
}

function normalizeAcademicRecordsForView(records = emptyAcademicRecords()) {
  const fallback = emptyAcademicRecords();
  const gpaRecords = Array.isArray(records?.gpaRecords) ? records.gpaRecords : fallback.gpaRecords;
  const gpaScale = records?.gpaScale || "";
  const ibPredictedScore = records?.ibPredictedScore || "";
  const courseSystem = normalizeAcademicCourseSystem(records?.courseSystem, {
    gpaScale,
    gpaRecords,
    ibPredictedScore,
  });
  const isIbCourseSystem = courseSystem === COURSE_SYSTEM_IB;
  return {
    courseSystem,
    ibPredictedScore: isIbCourseSystem ? ibPredictedScore : "",
    gpaScale: isIbCourseSystem ? "" : gpaScale,
    gpaRecords: isIbCourseSystem ? [] : gpaRecords,
    satTests: Array.isArray(records?.satTests) ? records.satTests : [],
    apExams: Array.isArray(records?.apExams) ? records.apExams : [],
    standardizedPlan: records?.standardizedPlan && typeof records.standardizedPlan === "object"
      ? records.standardizedPlan
      : {},
  };
}

function normalizeAcademicCourseSystem(value, { gpaScale = "", gpaRecords = [], ibPredictedScore = "" } = {}) {
  if (COURSE_SYSTEM_OPTIONS.includes(value)) return value;
  if (String(ibPredictedScore || "").trim()) return COURSE_SYSTEM_IB;
  if (String(gpaScale || "").trim() || gpaRecords.some((record) => String(record.gpa || "").trim())) {
    return COURSE_SYSTEM_OTHER;
  }
  return "";
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
  const isIbCourseSystem = normalized.courseSystem === COURSE_SYSTEM_IB;
  const isOtherCourseSystem = normalized.courseSystem === COURSE_SYSTEM_OTHER;
  if (gpaRecordsList) {
    gpaRecordsList.innerHTML = `
      <div class="academic-course-system">
        ${renderStandaloneSelect("academicRecords_courseSystem", "课程体系", COURSE_SYSTEM_OPTIONS, normalized.courseSystem)}
        <p>IB 学生填写最终 IB 预估总分；其他课程体系继续记录 GPA。</p>
      </div>
      <div class="academic-course-panel academic-ib-score-panel" data-academic-course-panel="ib" ${isIbCourseSystem ? "" : "hidden"}>
        ${renderStandaloneNumberInput("academicRecords_ibPredictedScore", "最终 IB 预估分（满分45）", normalized.ibPredictedScore, 0, 45)}
        <p class="portfolio-field-note">只记录总分即可，不需要换算 GPA。</p>
      </div>
      <div class="academic-course-panel academic-gpa-panel" data-academic-course-panel="other" ${isOtherCourseSystem ? "" : "hidden"}>
        <div class="academic-record-scale">
          ${renderStandaloneSelect("academicRecords_gpaScale", "GPA分制", GPA_SCALE_OPTIONS, normalized.gpaScale)}
        </div>
        ${renderGpaRecords(normalized.gpaRecords)}
      </div>
      <p class="portfolio-empty academic-course-empty" data-academic-course-panel="empty" ${normalized.courseSystem ? "hidden" : ""}>请选择课程体系后填写对应成绩。</p>`;
  }
  syncAcademicCourseSystemPanels(normalized.courseSystem);
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
      ${renderApplicationSchoolCombobox(round.key, index, entry.school)}
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

function renderApplicationSchoolCombobox(roundKey, index, value = "") {
  const options = getEligibleSchools(applicationRoundSchools, roundKey);
  const selectedValue = String(value || "");
  const selectedOption = options.find((school) => school.name === selectedValue);
  const hasSelectedOption = Boolean(selectedOption);
  const selectedLabel = selectedOption
    ? applicationSchoolDisplayLabel(selectedOption)
    : selectedValue
      ? `${selectedValue}（当前已保存）`
      : "";
  const controlName = applicationControlName(roundKey, index, "school");
  const menuId = applicationSchoolMenuId(roundKey, index);
  return `
    <label class="application-school-field">
      <span>院校</span>
      <input
        type="hidden"
        name="${escapeHtml(controlName)}"
        value="${escapeHtml(selectedValue)}"
        data-application-school-value
      />
      <div class="application-school-combobox" data-application-school-combobox>
        <button
          type="button"
          class="application-school-combobox-trigger"
          data-application-school-trigger
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="${escapeHtml(menuId)}"
        >
          <span data-application-school-trigger-text>${escapeHtml(selectedLabel || (options.length ? "请选择院校" : "正在加载院校"))}</span>
        </button>
        <div
          id="${escapeHtml(menuId)}"
          class="application-school-combobox-menu"
          data-application-school-menu
          role="listbox"
          hidden
        >
        ${
          selectedValue && !hasSelectedOption
            ? renderApplicationSchoolOption(selectedValue, `${selectedValue}（当前已保存）`, true)
            : ""
        }
        ${
          options.length
            ? options
                .map((school) =>
                  renderApplicationSchoolOption(
                    school.name,
                    applicationSchoolDisplayLabel(school),
                    school.name === selectedValue,
                  ),
                )
                .join("")
            : '<p class="application-school-combobox-empty">正在加载院校</p>'
        }
        </div>
      </div>
    </label>`;
}

function renderApplicationSchoolOption(value, label, selected = false) {
  return `
    <button
      type="button"
      class="application-school-combobox-option${selected ? " is-selected" : ""}"
      data-application-school-option
      data-school-value="${escapeHtml(value)}"
      data-school-label="${escapeHtml(label)}"
      role="option"
      aria-selected="${selected ? "true" : "false"}"
    >${escapeHtml(label)}</button>`;
}

function applicationSchoolDisplayLabel(school) {
  return `${school.name} · ${school.category} ${school.rank}`.trim();
}

function applicationSchoolMenuId(roundKey, index) {
  return `application-school-menu-${roundKey}-${index}`;
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

function renderStandaloneNumberInput(name, label, value = "", min = "", max = "") {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input
        name="${escapeHtml(name)}"
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
    planningActions: currentPortfolio.planningActions || [],
    deepSeekNotes: currentPortfolio.deepSeekNotes || [],
    schoolSelectionVersions: currentPortfolio.schoolSelectionVersions || [],
    capabilityAssessment: currentPortfolio.capabilityAssessment || {},
  };
}

function collectAcademicRecords() {
  const courseSystem = fieldValue("academicRecords_courseSystem");
  const isIbCourseSystem = courseSystem === COURSE_SYSTEM_IB;
  const isOtherCourseSystem = courseSystem === COURSE_SYSTEM_OTHER;
  return {
    courseSystem,
    ibPredictedScore: isIbCourseSystem ? fieldValue("academicRecords_ibPredictedScore") : "",
    gpaScale: isOtherCourseSystem ? fieldValue("academicRecords_gpaScale") : "",
    gpaRecords: isOtherCourseSystem ? collectAcademicRows("gpa", "academicGpa", gpaRecordFields) : [],
    satTests: collectAcademicRows("sat", "academicSat", satTestFields),
    apExams: collectAcademicRows("ap", "academicAp", apExamFields),
    standardizedPlan: currentPortfolio.academicRecords?.standardizedPlan || {},
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
  return collectEntrySlots(group, count, fields).filter(hasAnyValue);
}

function collectEntrySlots(group, count, fields) {
  return Array.from({ length: count }, (_, index) =>
    Object.fromEntries(fields.map((field) => [field, fieldValue(controlName(group, index, field))])),
  );
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
  const activitySlots = collectEntrySlots("activities", ACTIVITY_SLOT_COUNT, activityFields);
  const imported = insertEntryIntoFirstEmptySlot(
    activitySlots,
    mapPlanningActivityToPortfolio(activity),
    ACTIVITY_SLOT_COUNT,
  );
  if (!imported.inserted) {
    setImportStatus("课外活动已满 10 项，请先清空一个活动槽位。", true);
    return;
  }

  portfolio.activities = imported.entries;
  renderPortfolio(portfolio);
  isDirty = true;
  updateCompletion();
  setStatus("已导入 1 项活动，请保存进度。");
  setImportStatus(`已导入：${cleanPlanningActivityText(activity.activityName, "未命名活动")}`);
  trackPortfolioUsageEvent("portfolio_import_activity", {
    metrics: { generatedActivityCount: 1 },
    details: {
      sourceId,
      activityIndex,
      activityName: cleanPlanningActivityText(activity.activityName, "未命名活动"),
    },
  });
  portfolioForm.elements.namedItem(controlName("activities", imported.index, "activityName"))?.focus();
}

function updateCompletion() {
  const portfolio = collectPortfolio();
  renderPortfolioCompletion(portfolio);
  if (academicRecordsProgress) {
    const records = portfolio.academicRecords || emptyAcademicRecords();
    academicRecordsProgress.textContent = `成绩档案：${formatAcademicCourseProgress(records)} / SAT ${records.satTests.length} 次 / AP ${records.apExams.length} 门`;
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

function renderPortfolioCompletion(portfolio = collectPortfolio()) {
  const academicRecords = portfolio.academicRecords || emptyAcademicRecords();
  const normalizedAcademicRecords = normalizeAcademicRecordsForView(academicRecords);
  const hasIbScore =
    normalizedAcademicRecords.courseSystem === COURSE_SYSTEM_IB
    && String(normalizedAcademicRecords.ibPredictedScore || "").trim();
  const hasGpaSignal =
    normalizedAcademicRecords.courseSystem === COURSE_SYSTEM_OTHER
    && (String(normalizedAcademicRecords.gpaScale || "").trim()
      || (normalizedAcademicRecords.gpaRecords || []).some((record) => String(record.gpa || "").trim()));
  const hasAcademicSignal =
    hasIbScore
    || hasGpaSignal
    || (academicRecords.satTests || []).length > 0
    || (academicRecords.apExams || []).length > 0;
  const academicStatus = hasAcademicSignal
    ? "done"
    : normalizedAcademicRecords.courseSystem
      ? "progress"
      : "todo";
  const academicDetail = hasAcademicSignal
    ? "已有成绩基础，可继续补 SAT / AP。"
    : normalizedAcademicRecords.courseSystem === COURSE_SYSTEM_IB
      ? "已选择 IB，补最终预估总分（满分45）。"
      : normalizedAcademicRecords.courseSystem === COURSE_SYSTEM_OTHER
        ? "已选择其他课程体系，先补 GPA 分制或最近学期 GPA。"
        : "先选择课程体系，再补 IB 预估分或 GPA。";
  const activityCount = (portfolio.activities || []).length;
  const schoolCount = countApplicationPlanSchools(portfolio.applicationPlan);

  setPortfolioCompletionCard(
    portfolioCompletionCards.academic,
    academicStatus,
    academicDetail,
  );
  setPortfolioCompletionCard(
    portfolioCompletionCards.activities,
    activityCount >= 3 ? "done" : activityCount > 0 ? "progress" : "todo",
    activityCount >= 3 ? `已有 ${activityCount} 项活动，可做质量体检。` : `当前 ${activityCount} 项，建议先补到 3 项。`,
  );
  setPortfolioCompletionCard(
    portfolioCompletionCards.schoolPlan,
    schoolCount > 0 ? "done" : "todo",
    schoolCount > 0 ? `已保存 ${schoolCount} 所学校，适合进入版本复盘。` : "还没有选校计划，可先生成均衡版。",
  );
}

function renderCapabilityAssessment(assessment = {}, portfolio = collectPortfolio()) {
  if (!capabilityAssessmentContent) return;
  const normalized = normalizeCapabilityAssessmentForView(assessment);
  if (!normalized.radarScores?.length) {
    setCapabilityAssessmentStatus("DeepSeek Agent 待生成");
    capabilityAssessmentContent.innerHTML = renderCapabilityAssessmentEmpty(portfolio);
    return;
  }

  const overallScore = normalized.overallScore || averageScore(normalized.radarScores);
  setCapabilityAssessmentStatus(
    normalized.generatedAt ? `上次评估：${formatDate(normalized.generatedAt)}` : "已生成智能体评估",
  );
  capabilityAssessmentContent.innerHTML = `
    <div class="portfolio-capability-layout">
      <div class="portfolio-radar-surface">
        ${renderCapabilityRadar(normalized)}
        <div class="portfolio-capability-score">
          <strong>${overallScore}</strong>
          <span>综合能力结构分</span>
          <small>DeepSeek Agent，不含选校计划</small>
        </div>
      </div>
      <div class="portfolio-capability-summary">
        <p class="eyebrow">Assessment Summary</p>
        <h3>${escapeHtml(normalized.overallSummary || buildCapabilityOverallSummary(normalized.radarScores))}</h3>
        <dl>
          <div>
            <dt>输入完整度</dt>
            <dd>${normalized.inputCompleteness || 0}%</dd>
          </div>
          <div>
            <dt>评估方式</dt>
            <dd>${escapeHtml(normalized.generatedBy || "deepseek-capability-agent")}</dd>
          </div>
        </dl>
        ${renderCapabilityTextGroup("优势证据", normalized.strengths)}
        ${renderCapabilityTextGroup("优先短板", normalized.gaps)}
        ${renderCapabilityTextGroup("30 天动作", normalized.actions30Days)}
      </div>
    </div>
    ${renderCapabilityDimensions(normalized.radarScores)}
  `;
}

function renderCapabilityAssessmentEmpty(portfolio = collectPortfolio()) {
  const counts = countPortfolioEntries(portfolio);
  const missing = [];
  if (!hasFilledAcademicRecords(portfolio.academicRecords || emptyAcademicRecords())) missing.push("成绩与考试");
  if (!counts.filledActivityCount) missing.push("课外活动");
  if (!counts.competitionCount) missing.push("竞赛经历");
  if (!counts.summerSchoolCount) missing.push("夏校/项目");
  if (!counts.recommendationReady) missing.push("推荐信准备");
  const missingText = missing.length ? `建议先补：${missing.join("、")}。` : "当前已有基础信息，可以直接生成。";
  return `
    <div class="portfolio-capability-empty">
      <strong>让 DeepSeek Agent 先体检当前档案。</strong>
      <p>生成后会看到能力雷达图、强项、短板和 30 天行动建议；后端只会把非选校字段交给智能体评估。</p>
      <small>${escapeHtml(missingText)}</small>
    </div>`;
}

function renderCapabilityRadar(assessment) {
  const scores = assessment.radarScores.slice(0, 7);
  const size = 320;
  const center = size / 2;
  const radius = 104;
  const gridLevels = [25, 50, 75, 100];
  const grid = gridLevels
    .map((level) => {
      const points = scores.map((_, index) =>
        radarPoint(index, scores.length, center, radius * (level / 100)),
      ).join(" ");
      return `<polygon points="${points}" class="portfolio-radar-grid" />`;
    })
    .join("");
  const axes = scores
    .map((_, index) => {
      const point = radarPoint(index, scores.length, center, radius);
      return `<line x1="${center}" y1="${center}" x2="${point.split(",")[0]}" y2="${point.split(",")[1]}" class="portfolio-radar-axis" />`;
    })
    .join("");
  const scorePoints = scores.map((item, index) =>
    radarPoint(index, scores.length, center, radius * (clampScore(item.score) / 100)),
  ).join(" ");
  const markers = scores
    .map((item, index) => {
      const [x, y] = radarPoint(index, scores.length, center, radius * (clampScore(item.score) / 100)).split(",");
      return `<circle cx="${x}" cy="${y}" r="4" class="portfolio-radar-marker"><title>${escapeHtml(item.label)} ${clampScore(item.score)}分</title></circle>`;
    })
    .join("");
  const labels = scores
    .map((item, index) => {
      const [x, y] = radarPoint(index, scores.length, center, radius + 34).split(",");
      const anchor = Number(x) > center + 12 ? "start" : Number(x) < center - 12 ? "end" : "middle";
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="portfolio-radar-label">${escapeHtml(shortCapabilityLabel(item.label))}</text>`;
    })
    .join("");
  const ariaLabel = scores.map((item) => `${item.label} ${clampScore(item.score)}分`).join("，");
  return `
    <figure class="portfolio-radar-figure">
      <div class="portfolio-radar-svg-wrap" role="img" aria-label="能力雷达图：${escapeHtml(ariaLabel)}">
        <svg class="portfolio-radar-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
          ${grid}
          ${axes}
          <polygon points="${scorePoints}" class="portfolio-radar-score-area" />
          <polyline points="${scorePoints} ${scorePoints.split(" ")[0]}" class="portfolio-radar-score-line" />
          ${markers}
          ${labels}
        </svg>
      </div>
      <figcaption>雷达图越外圈代表该维度证据越充分，分数只用于档案补强参考。</figcaption>
    </figure>`;
}

function radarPoint(index, total, center, radius) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return `${(center + Math.cos(angle) * radius).toFixed(1)},${(center + Math.sin(angle) * radius).toFixed(1)}`;
}

function shortCapabilityLabel(label) {
  return String(label || "").replace("准备度", "准备").replace("一致性", "一致");
}

function renderCapabilityTextGroup(title, items = []) {
  const rows = items.length ? items : ["暂无明确结论，建议补充更多档案证据。"];
  return `
    <section class="portfolio-capability-list-block">
      <h4>${escapeHtml(title)}</h4>
      <ul>
        ${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>`;
}

function renderCapabilityDimensions(scores = []) {
  return `
    <div class="portfolio-capability-dimensions" role="list" aria-label="能力维度明细">
      ${scores.map((item) => `
        <article class="portfolio-capability-dimension" role="listitem">
          <div>
            <span>${escapeHtml(confidenceLabel(item.confidence))}</span>
            <h3>${escapeHtml(item.label)}</h3>
          </div>
          <strong>${clampScore(item.score)}</strong>
          <p>${escapeHtml(item.nextAction || "继续补充能证明该维度的具体材料。")}</p>
        </article>`).join("")}
    </div>`;
}

function confidenceLabel(confidence) {
  if (confidence === "high") return "高置信";
  if (confidence === "low") return "低置信";
  return "中置信";
}

async function generateCapabilityAssessment() {
  if (capabilityAssessmentJobPolling) return;
  capabilityAssessmentJobPolling = true;
  const portfolio = collectPortfolio();
  try {
    setButtonsDisabled(true);
    setStatus("正在提交 DeepSeek Agent 后台评估任务...");
    setCapabilityAssessmentStatus("正在提交 DeepSeek Agent 后台评估任务...");
    const job = await requestJson(CAPABILITY_ASSESSMENT_JOB_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(portfolio),
    });
    rememberPendingCapabilityAssessmentJob(job.jobId);
    setStatus("能力评估任务已提交，DeepSeek Agent 正在后台评估。");
    setCapabilityAssessmentStatus("DeepSeek Agent 正在后台评估...");
    const data = await waitForCapabilityAssessmentJob(job.jobId);
    renderPortfolio(data.portfolio || { ...portfolio, capabilityAssessment: data.capabilityAssessment || {} });
    isDirty = false;
    setStatus("能力评估已生成并保存");
    setCapabilityAssessmentStatus("DeepSeek Agent 已生成并保存");
    clearPendingCapabilityAssessmentJob();
  } catch (error) {
    if (error.final || /not found/i.test(error.message)) clearPendingCapabilityAssessmentJob();
    const message = error.message || "DeepSeek Agent 评估失败";
    setStatus(message, true);
    setCapabilityAssessmentStatus(message, true);
  } finally {
    capabilityAssessmentJobPolling = false;
    setButtonsDisabled(false);
  }
}

async function resumePendingCapabilityAssessmentJob() {
  const pendingJob = readPendingCapabilityAssessmentJob();
  if (!pendingJob || capabilityAssessmentJobPolling) return;

  capabilityAssessmentJobPolling = true;
  try {
    setButtonsDisabled(true);
    setStatus("正在接回上次未完成的能力评估任务...");
    setCapabilityAssessmentStatus("正在接回 DeepSeek Agent 后台评估任务...");
    const data = await waitForCapabilityAssessmentJob(pendingJob.jobId);
    if (data.portfolio || data.capabilityAssessment) {
      renderPortfolio(data.portfolio || {
        ...collectPortfolio(),
        capabilityAssessment: data.capabilityAssessment || {},
      });
      isDirty = false;
    } else {
      await loadPortfolio();
    }
    setStatus("能力评估已生成并保存");
    setCapabilityAssessmentStatus("DeepSeek Agent 已生成并保存");
    clearPendingCapabilityAssessmentJob();
  } catch (error) {
    if (error.final || /not found/i.test(error.message)) clearPendingCapabilityAssessmentJob();
    const message = error.message || "DeepSeek Agent 评估失败";
    setStatus(message, true);
    setCapabilityAssessmentStatus(message, true);
  } finally {
    capabilityAssessmentJobPolling = false;
    setButtonsDisabled(false);
  }
}

function buildLocalCapabilityAssessment(portfolio) {
  const assessmentPortfolio = {
    academicRecords: portfolio.academicRecords || emptyAcademicRecords(),
    activities: portfolio.activities || [],
    competitions: portfolio.competitions || [],
    summerSchools: portfolio.summerSchools || [],
    recommendationLetters: portfolio.recommendationLetters || {},
  };
  const radarScores = [
    scoreAcademicReadiness(assessmentPortfolio),
    scoreDirectionConsistency(assessmentPortfolio),
    scoreActivityDepth(assessmentPortfolio),
    scoreOutcomeImpact(assessmentPortfolio),
    scoreLeadershipInitiative(assessmentPortfolio),
    scoreCompetitiveExperience(assessmentPortfolio),
    scoreMaterialsReadiness(assessmentPortfolio),
  ];
  const sorted = [...radarScores].sort((left, right) => clampScore(right.score) - clampScore(left.score));
  const overallScore = averageScore(radarScores);
  return {
    version: "local-v1",
    generatedAt: new Date().toISOString(),
    inputHash: buildCapabilityInputHash(assessmentPortfolio),
    inputCompleteness: calculateCapabilityInputCompleteness(assessmentPortfolio),
    overallScore,
    overallSummary: buildCapabilityOverallSummary(radarScores),
    radarScores,
    strengths: sorted.slice(0, 3).map((item) => `${item.label}：${item.evidence[0] || "已有可用证据"}`),
    gaps: sorted.slice(-3).reverse().map((item) => `${item.label}：${item.missing[0] || item.nextAction}`),
    actions30Days: sorted.slice(-3).reverse().map((item) => item.nextAction),
    generatedBy: "client-baseline-agent",
  };
}

function buildCapabilityInputHash(portfolio) {
  return `local-v1:${JSON.stringify(portfolio).length}:${[
    portfolio.activities.length,
    portfolio.competitions.length,
    portfolio.summerSchools.length,
  ].join("-")}`;
}

function calculateCapabilityInputCompleteness(portfolio) {
  const records = normalizeAcademicRecordsForView(portfolio.academicRecords);
  const proofLinks = countProofLinks(portfolio);
  const signals = [
    records.courseSystem,
    records.ibPredictedScore || records.gpaRecords.length,
    records.satTests.length || records.apExams.length,
    portfolio.activities.length >= 3,
    portfolio.activities.some((activity) => activity.outcome),
    portfolio.competitions.length > 0,
    portfolio.summerSchools.length > 0,
    hasAnyRecommendation(portfolio.recommendationLetters),
    proofLinks >= 2,
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}

function scoreAcademicReadiness(portfolio) {
  const records = normalizeAcademicRecordsForView(portfolio.academicRecords);
  const evidence = [];
  const missing = [];
  let score = 0;
  if (records.courseSystem) {
    score += 15;
    evidence.push(`课程体系：${records.courseSystem}`);
  } else {
    missing.push("课程体系");
  }
  if (records.courseSystem === COURSE_SYSTEM_IB && records.ibPredictedScore) {
    score += Number(records.ibPredictedScore) >= 40 ? 35 : 26;
    evidence.push(`IB 预估分 ${records.ibPredictedScore}/45`);
  }
  if (records.courseSystem === COURSE_SYSTEM_OTHER) {
    if (records.gpaScale) score += 8;
    if (records.gpaRecords.length) {
      score += Math.min(30, 12 + records.gpaRecords.length * 4);
      evidence.push(`已记录 ${records.gpaRecords.length} 个 GPA 学期`);
    } else {
      missing.push("GPA 学期记录");
    }
  }
  const bestSat = Math.max(0, ...records.satTests.map((test) => Number(test.totalScore) || 0));
  if (bestSat) {
    score += bestSat >= 1500 ? 25 : bestSat >= 1400 ? 20 : 14;
    evidence.push(`SAT 最高 ${bestSat}`);
  } else {
    missing.push("SAT 记录");
  }
  const reportedAp = records.apExams.filter((exam) => exam.courseName || exam.score);
  const highAp = reportedAp.filter((exam) => Number(exam.score) >= 4).length;
  if (reportedAp.length) {
    score += Math.min(20, reportedAp.length * 4 + highAp * 3);
    evidence.push(`AP ${reportedAp.length} 门，其中 ${highAp} 门 4 分以上`);
  } else {
    missing.push("AP 记录");
  }
  return buildCapabilityDimension(
    "academicReadiness",
    "学术准备度",
    score,
    evidence,
    missing,
    "补齐课程体系、最近 GPA/IB、SAT 和 AP 记录，形成统一成绩口径。",
  );
}

function scoreDirectionConsistency(portfolio) {
  const tags = [
    ...portfolio.activities.map((activity) => activity.type),
    ...portfolio.competitions.map((competition) => competition.subject),
    ...portfolio.summerSchools.map((school) => school.direction),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const frequency = tags.reduce((map, tag) => map.set(tag, (map.get(tag) || 0) + 1), new Map());
  const strongest = [...frequency.entries()].sort((left, right) => right[1] - left[1])[0];
  const evidence = strongest ? [`${strongest[0]} 方向出现 ${strongest[1]} 次`] : [];
  const missing = [];
  if (tags.length < 3) missing.push("活动、竞赛或夏校方向标签不足");
  if (!strongest || strongest[1] < 2) missing.push("缺少反复出现的主线方向");
  const score = tags.length >= 5 && strongest?.[1] >= 3
    ? 86
    : tags.length >= 3 && strongest?.[1] >= 2
      ? 72
      : tags.length
        ? 48
        : 22;
  return buildCapabilityDimension(
    "directionConsistency",
    "专业方向一致性",
    score,
    evidence,
    missing,
    "把最能代表目标方向的 2-3 项经历补充为同一条申请主线。",
  );
}

function scoreActivityDepth(portfolio) {
  const activities = portfolio.activities || [];
  const roles = activities.filter((activity) => activity.role).length;
  const descriptions = activities.filter((activity) => activity.description).length;
  const outcomes = activities.filter((activity) => activity.outcome).length;
  const evidence = [];
  const missing = [];
  if (activities.length) evidence.push(`已记录 ${activities.length} 项活动`);
  if (roles) evidence.push(`${roles} 项写明角色`);
  if (outcomes) evidence.push(`${outcomes} 项写明成果`);
  if (activities.length < 3) missing.push("至少 3 项可讲述的核心活动");
  if (roles < Math.min(activities.length, 3)) missing.push("角色职责");
  if (outcomes < Math.min(activities.length, 3)) missing.push("可量化成果");
  const score = 18 + Math.min(28, activities.length * 5) + roles * 5 + descriptions * 4 + outcomes * 6;
  return buildCapabilityDimension(
    "activityDepth",
    "活动深度",
    score,
    evidence,
    missing,
    "优先补齐核心活动的角色、持续时间、具体任务和可量化结果。",
  );
}

function scoreOutcomeImpact(portfolio) {
  const activityOutcomes = portfolio.activities.filter((activity) => activity.outcome).length;
  const proofLinks = countProofLinks(portfolio);
  const awards = portfolio.competitions.filter((competition) => competition.award).length;
  const outputs = portfolio.summerSchools.filter((school) => school.output).length;
  const evidence = [];
  const missing = [];
  if (activityOutcomes) evidence.push(`${activityOutcomes} 项活动有成果描述`);
  if (awards) evidence.push(`${awards} 项竞赛有奖项结果`);
  if (outputs) evidence.push(`${outputs} 项夏校/项目有产出`);
  if (proofLinks) evidence.push(`${proofLinks} 条证明材料链接`);
  if (!activityOutcomes) missing.push("活动成果");
  if (!awards && !outputs) missing.push("外部认可或项目产出");
  if (proofLinks < 2) missing.push("证明材料链接");
  const score = 24 + activityOutcomes * 10 + awards * 13 + outputs * 10 + Math.min(18, proofLinks * 5);
  return buildCapabilityDimension(
    "outcomeImpact",
    "成果与影响力",
    score,
    evidence,
    missing,
    "给前 3 项经历补充数字结果、作品/报告链接或获奖证明。",
  );
}

function scoreLeadershipInitiative(portfolio) {
  const roles = portfolio.activities.map((activity) => activity.role).filter(Boolean);
  const leadershipRoles = roles.filter((role) =>
    includesAny(role, ["负责人", "创始", "组织", "主席", "队长", "leader", "captain", "founder", "president"]),
  );
  const contribution = portfolio.competitions.filter((competition) => competition.contribution).length;
  const evidence = [];
  const missing = [];
  if (roles.length) evidence.push(`${roles.length} 项活动写明角色`);
  if (leadershipRoles.length) evidence.push(`${leadershipRoles.length} 项有领导/发起信号`);
  if (contribution) evidence.push(`${contribution} 项竞赛写明个人贡献`);
  if (!roles.length) missing.push("活动角色");
  if (!leadershipRoles.length) missing.push("发起、组织或带动他人的证据");
  const score = 26 + roles.length * 7 + leadershipRoles.length * 14 + contribution * 6;
  return buildCapabilityDimension(
    "leadershipInitiative",
    "主动性与领导力",
    score,
    evidence,
    missing,
    "把核心经历改写为“我发起/组织/推动了什么”，并补个人贡献证据。",
  );
}

function scoreCompetitiveExperience(portfolio) {
  const competitions = portfolio.competitions || [];
  const awarded = competitions.filter((competition) => competition.award).length;
  const completedPrograms = portfolio.summerSchools.filter((school) =>
    includesAny([school.status, school.output].join(" "), ["已完成", "已录取", "完成", "录取"]),
  ).length;
  const apCount = (portfolio.academicRecords?.apExams || []).filter((exam) => exam.courseName || exam.score).length;
  const evidence = [];
  const missing = [];
  if (competitions.length) evidence.push(`${competitions.length} 项竞赛经历`);
  if (awarded) evidence.push(`${awarded} 项有奖项结果`);
  if (completedPrograms) evidence.push(`${completedPrograms} 项高门槛项目/夏校有进展`);
  if (!competitions.length) missing.push("竞赛或奖项记录");
  if (!awarded && !completedPrograms) missing.push("竞争性结果");
  const score = 22 + competitions.length * 12 + awarded * 15 + completedPrograms * 12 + Math.min(12, apCount * 3);
  return buildCapabilityDimension(
    "competitiveExperience",
    "竞争性经历",
    score,
    evidence,
    missing,
    "补充竞赛结果、排名、录取项目难度或项目筛选门槛。",
  );
}

function scoreMaterialsReadiness(portfolio) {
  const recommendationLetters = portfolio.recommendationLetters || {};
  const preparedMaterials = recommendationLetters.preparedMaterials || [];
  const teacherCount = [recommendationLetters.teacher1, recommendationLetters.teacher2]
    .filter(hasAnyRecommendation).length;
  const proofLinks = countProofLinks(portfolio);
  const evidence = [];
  const missing = [];
  if (teacherCount) evidence.push(`${teacherCount} 位校内推荐人已有记录`);
  if (preparedMaterials.length) evidence.push(`已准备 ${preparedMaterials.length} 类推荐信素材`);
  if (proofLinks) evidence.push(`${proofLinks} 条证明材料链接`);
  if (!teacherCount) missing.push("校内推荐人");
  if (preparedMaterials.length < 3) missing.push("简历、活动清单、项目说明等素材包");
  if (proofLinks < 3) missing.push("核心经历证明链接");
  const score = 20 + teacherCount * 16 + preparedMaterials.length * 8 + Math.min(22, proofLinks * 4);
  return buildCapabilityDimension(
    "materialsReadiness",
    "材料准备度",
    score,
    evidence,
    missing,
    "整理推荐信素材包，并给核心活动、竞赛、项目补证明链接。",
  );
}

function buildCapabilityDimension(key, label, score, evidence, missing, nextAction) {
  const safeEvidence = evidence.filter(Boolean).slice(0, 5);
  const safeMissing = missing.filter(Boolean).slice(0, 5);
  return {
    key,
    label,
    score: clampScore(score),
    confidence: safeEvidence.length >= 3 && safeMissing.length <= 1 ? "high" : safeEvidence.length >= 2 ? "medium" : "low",
    evidence: safeEvidence,
    missing: safeMissing,
    nextAction,
  };
}

function buildCapabilityOverallSummary(scores = []) {
  if (!scores.length) return "当前档案还没有足够信息生成能力画像。";
  const sorted = [...scores].sort((left, right) => clampScore(right.score) - clampScore(left.score));
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  return `当前最强维度是${strongest.label}，优先补强${weakest.label}。`;
}

function averageScore(scores = []) {
  if (!scores.length) return 0;
  return Math.round(scores.reduce((total, item) => total + clampScore(item.score), 0) / scores.length);
}

function countProofLinks(portfolio) {
  return [
    ...(portfolio.activities || []),
    ...(portfolio.competitions || []),
    ...(portfolio.summerSchools || []),
  ].filter((item) => String(item.proofLink || "").trim()).length;
}

function hasFilledAcademicRecords(records = emptyAcademicRecords()) {
  const normalized = normalizeAcademicRecordsForView(records);
  return Boolean(
    normalized.courseSystem
      || normalized.ibPredictedScore
      || normalized.gpaRecords.length
      || normalized.satTests.length
      || normalized.apExams.length,
  );
}

function includesAny(value, keywords) {
  const text = String(value || "").toLowerCase();
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function setCapabilityAssessmentStatus(message, isError = false) {
  if (!capabilityAssessmentStatus) return;
  capabilityAssessmentStatus.textContent = message;
  capabilityAssessmentStatus.classList.toggle("error", isError);
}

function setPortfolioCompletionCard(card, status, detail) {
  if (!card) return;
  card.dataset.status = status;
  const detailElement = card.querySelector("small");
  if (detailElement) detailElement.textContent = detail;
}

function countApplicationPlanSchools(plan = emptyApplicationPlan()) {
  return Object.values(plan).reduce((total, entries) => total + (entries?.length || 0), 0);
}

function filledText(value, fallback = "待补充") {
  const text = String(value || "").trim();
  return text || fallback;
}

function joinFilled(values, separator = "；", fallback = "暂无记录") {
  const items = values.map((value) => String(value || "").trim()).filter(Boolean);
  return items.length ? items.join(separator) : fallback;
}

function summarizeList(items, formatter, emptyText = "暂无记录") {
  const rows = (items || []).map(formatter).map((value) => String(value || "").trim()).filter(Boolean);
  return rows.length ? rows.join("\n") : emptyText;
}

function formatAcademicCourseProgress(records = emptyAcademicRecords()) {
  const normalized = normalizeAcademicRecordsForView(records);
  if (normalized.courseSystem === COURSE_SYSTEM_IB) {
    return normalized.ibPredictedScore ? `IB ${normalized.ibPredictedScore}/45` : "IB 预估分待填";
  }
  if (normalized.courseSystem === COURSE_SYSTEM_OTHER) {
    return `GPA ${normalized.gpaRecords.length} 学期`;
  }
  return "课程体系待选";
}

function summarizeAcademicRecords(records = emptyAcademicRecords()) {
  const normalized = normalizeAcademicRecordsForView(records);
  const gpaSummary = summarizeList(
    normalized.gpaRecords,
    (record) => joinFilled([record.gradeLevel, record.term, record.gpa && `GPA ${record.gpa}`], " "),
  );
  const courseSummary =
    normalized.courseSystem === COURSE_SYSTEM_IB
      ? `IB预估分：${normalized.ibPredictedScore ? `${normalized.ibPredictedScore}/45` : "暂无记录"}`
      : normalized.courseSystem === COURSE_SYSTEM_OTHER
        ? `GPA：${gpaSummary}`
        : "课程成绩：暂无记录";
  const satSummary = summarizeList(
    normalized.satTests,
    (test) =>
      joinFilled(
        [
          test.testDate,
          test.totalScore && `总分 ${test.totalScore}`,
          test.englishScore && `英文 ${test.englishScore}`,
          test.mathScore && `数学 ${test.mathScore}`,
        ],
        " ",
      ),
  );
  const apSummary = summarizeList(
    normalized.apExams,
    (exam) => joinFilled([exam.courseName, exam.score && `${exam.score} 分`, exam.examYear], " "),
  );
  return [courseSummary, `SAT：${satSummary}`, `AP：${apSummary}`].join("\n");
}

function summarizeApplicationPlan(plan = emptyApplicationPlan()) {
  const rows = APPLICATION_ROUND_CONFIG.flatMap((round) =>
    (plan?.[round.key] || []).map((entry) =>
      joinFilled([round.label, entry.school, entry.major && `专业方向：${entry.major}`], " "),
    ),
  );
  return rows.length ? rows.join("\n") : "暂无选校计划";
}

function countPortfolioEntries(portfolio = collectPortfolio()) {
  const academicRecords = portfolio.academicRecords || emptyAcademicRecords();
  return {
    completionFields: Object.values(academicRecords).filter((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(String(value || "").trim());
    }).length,
    filledActivityCount: (portfolio.activities || []).length,
    competitionCount: (portfolio.competitions || []).length,
    summerSchoolCount: (portfolio.summerSchools || []).length,
    gpaRecordCount: (academicRecords.gpaRecords || []).length,
    satTestCount: (academicRecords.satTests || []).length,
    apExamCount: (academicRecords.apExams || []).length,
    applicationSchoolCount: countApplicationPlanSchools(portfolio.applicationPlan),
    recommendationReady: hasAnyRecommendation(portfolio.recommendationLetters) ? 1 : 0,
  };
}

function buildPortfolioProfile(portfolio) {
  const academicRecords = normalizeAcademicRecordsForView(portfolio.academicRecords || emptyAcademicRecords());
  const latestGpaRecord = academicRecords.gpaRecords?.at(-1);
  return {
    grade: joinFilled(
      [
        latestGpaRecord?.gradeLevel,
        latestGpaRecord?.term,
      ],
      " ",
      "未填写年级",
    ),
    majorDirection: summarizeApplicationPlan(portfolio.applicationPlan).split("\n").slice(0, 3).join("；"),
    gpa: joinFilled(
      academicRecords.courseSystem === COURSE_SYSTEM_IB
        ? [
            COURSE_SYSTEM_IB,
            academicRecords.ibPredictedScore && `预估分 ${academicRecords.ibPredictedScore}/45`,
          ]
        : [
            academicRecords.gpaScale,
            latestGpaRecord?.gpa && `最新 GPA ${latestGpaRecord.gpa}`,
          ],
      "；",
      academicRecords.courseSystem === COURSE_SYSTEM_IB ? "未填写 IB 预估分" : "未填写 GPA",
    ),
    testScores: joinFilled(
      [
        academicRecords.satTests?.at(-1)?.totalScore && `SAT ${academicRecords.satTests.at(-1).totalScore}`,
        summarizeList(
          academicRecords.apExams,
          (exam) => joinFilled([exam.courseName, exam.score], " "),
          "",
        ),
      ],
      "；",
      "未填写标化/AP",
    ),
    applicationPlan: summarizeApplicationPlan(portfolio.applicationPlan),
  };
}

function mapPortfolioActivities(activities = []) {
  return activities.map((activity, index) => ({
    id: String(index + 1).padStart(2, "0"),
    type: filledText(activity.type, "活动档案"),
    activityName: filledText(activity.activityName, "未命名活动"),
    executionDescription: joinFilled(
      [
        activity.role && `角色：${activity.role}`,
        activity.timeStage && `时间：${activity.timeStage}`,
        activity.description,
        activity.outcome && `成果：${activity.outcome}`,
        activity.proofLink && `证明链接：${activity.proofLink}`,
        activity.status && `状态：${activity.status}`,
      ],
      "\n",
      "暂无活动细节",
    ),
    suggestedGrade: filledText(activity.timeStage || activity.status, "待定"),
  }));
}

function mapPortfolioCompetitions(competitions = []) {
  return competitions.map((competition, index) => ({
    id: `portfolio-competition-${index + 1}`,
    name: filledText(competition.competitionName, "未命名竞赛"),
    recommendationType: filledText(competition.subject || competition.status, "竞赛档案"),
    rating: filledText(competition.award || competition.status, "待补充"),
    recommendationReason: joinFilled(
      [
        competition.subject && `方向：${competition.subject}`,
        competition.contribution && `贡献：${competition.contribution}`,
        competition.award && `奖项：${competition.award}`,
      ],
      "；",
      "暂无竞赛说明",
    ),
    applicationHelp: joinFilled(
      [
        competition.yearGrade && `参与年级：${competition.yearGrade}`,
        competition.status && `当前状态：${competition.status}`,
        competition.proofLink && `证明链接：${competition.proofLink}`,
      ],
      "；",
      "待补充申请价值",
    ),
    prepTime: filledText(competition.yearGrade, "待定"),
    url: filledText(competition.proofLink, "暂无链接"),
  }));
}

function mapPortfolioSummerSchools(summerSchools = []) {
  return summerSchools.map((school, index) => ({
    id: `portfolio-summer-${index + 1}`,
    tier: filledText(school.status, "夏校档案"),
    name: filledText(school.programName, "未命名夏校"),
    rating: filledText(school.organizer, "待补充"),
    category: filledText(school.direction, "待定方向"),
    reason: joinFilled(
      [
        school.participationTime && `参与时间：${school.participationTime}`,
        school.output && `产出：${school.output}`,
      ],
      "；",
      "暂无夏校说明",
    ),
    formatAndWebsite: filledText(school.proofLink, "暂无链接"),
    admissionRate: "档案记录",
    requirements: school.output ? [school.output] : [],
    programTime: filledText(school.participationTime, "待定"),
    applicationTime: filledText(school.status, "待定"),
  }));
}

function buildTeacherRecommendation(role, teacher = {}) {
  if (!hasAnyRecommendation(teacher)) return null;
  return {
    role,
    recommenderType: joinFilled([teacher.subject, teacher.teacherName], " / ", "校内老师"),
    priority: filledText(teacher.relationshipStrength, "待评估"),
    recommendationFocus: filledText(teacher.subject, "待确认推荐重点"),
    evidence: filledText(teacher.materials, "待补充材料"),
    preparationAdvice: "整理档案中的活动、成绩和项目证据，并提前沟通推荐重点。",
  };
}

function mapPortfolioRecommendationLetters(recommendationLetters = {}) {
  const items = [
    recommendationLetters.counselorStatus || recommendationLetters.notes || recommendationLetters.preparedMaterials?.length
      ? {
          role: "Counselor 推荐信",
          recommenderType: "学校升学顾问",
          priority: filledText(recommendationLetters.counselorStatus, "待确认"),
          recommendationFocus: "整体学术表现、申请定位与选校策略",
          evidence: joinFilled(
            [
              ...(recommendationLetters.preparedMaterials || []),
              recommendationLetters.notes,
            ],
            "；",
            "待补充材料清单",
          ),
          preparationAdvice: "同步成绩、活动、竞赛、夏校和选校计划，方便 Counselor 快速理解申请主线。",
        }
      : null,
    buildTeacherRecommendation("校内老师推荐信 1", recommendationLetters.teacher1),
    buildTeacherRecommendation("校内老师推荐信 2", recommendationLetters.teacher2),
    hasAnyRecommendation(recommendationLetters.outsideRecommender)
      ? {
          role: "校外推荐信",
          recommenderType: filledText(recommendationLetters.outsideRecommender.identity, "校外推荐人"),
          priority: filledText(recommendationLetters.outsideRecommender.relationship, "待评估"),
          recommendationFocus: filledText(recommendationLetters.outsideRecommender.scenario, "待确认合作场景"),
          evidence: filledText(recommendationLetters.outsideRecommender.scenario, "待补充证据"),
          preparationAdvice: "明确推荐人与学生的合作场景、成果证据和推荐边界。",
        }
      : null,
  ].filter(Boolean);

  return {
    ready: items.length > 0,
    notice: items.length
      ? "以下内容来自我的申请档案，可作为推荐信沟通清单。"
      : "我的申请档案中暂未填写推荐信信息。",
    items,
  };
}

function buildPortfolioNarrative(portfolio) {
  const counts = countPortfolioEntries(portfolio);
  const capabilityAssessment = normalizeCapabilityAssessmentForView(portfolio.capabilityAssessment);
  return [
    `当前档案已记录 ${counts.filledActivityCount} 项活动、${counts.competitionCount} 项竞赛、${counts.summerSchoolCount} 项夏校、${counts.applicationSchoolCount} 所目标院校。`,
    `成绩与考试：\n${summarizeAcademicRecords(portfolio.academicRecords)}`,
    `选校计划：\n${summarizeApplicationPlan(portfolio.applicationPlan)}`,
    `活动主线：\n${summarizeList(
      portfolio.activities,
      (activity, index) =>
        `${index + 1}. ${filledText(activity.activityName, "未命名活动")}：${joinFilled(
          [activity.type, activity.role, activity.outcome || activity.status],
          " / ",
          "待补充细节",
        )}`,
    )}`,
    capabilityAssessment.overallSummary
      ? `能力评估（不含选校计划）：\n综合分 ${capabilityAssessment.overallScore || averageScore(capabilityAssessment.radarScores)}；${capabilityAssessment.overallSummary}`
      : "",
    "后续建议：优先补齐每项活动的成果证据、竞赛贡献、夏校产出和推荐信材料，让导出的方案更适合复盘和沟通。",
  ].filter(Boolean).join("\n\n");
}

function buildPortfolioExportPayload() {
  const portfolio = normalizePortfolioForView(collectPortfolio());
  return {
    profile: buildPortfolioProfile(portfolio),
    activities: mapPortfolioActivities(portfolio.activities),
    narrative: buildPortfolioNarrative(portfolio),
    competitionRecommendations: mapPortfolioCompetitions(portfolio.competitions),
    summerSchoolRecommendations: mapPortfolioSummerSchools(portfolio.summerSchools),
    recommendationLetterStrategy: mapPortfolioRecommendationLetters(portfolio.recommendationLetters),
    caseMatches: [],
  };
}

function trackPortfolioUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  const portfolio = collectPortfolio();
  csrfFetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: {
        grade: buildPortfolioProfile(portfolio).grade,
        majorDirection: summarizeApplicationPlan(portfolio.applicationPlan).split("\n").slice(0, 1).join(""),
      },
      metrics: {
        ...countPortfolioEntries(portfolio),
        ...metrics,
      },
      details: {
        source: "my_activities",
        ...details,
      },
    }),
  }).catch(() => {});
}

function downloadPortfolioDocument(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPortfolioSvgDocument() {
  const payload = buildPortfolioExportPayload();
  trackPortfolioUsageEvent("export_svg", {
    metrics: { generatedActivityCount: payload.activities.length },
    details: {
      exportSurface: "portfolio",
      format: "svg",
    },
  });
  downloadPortfolioDocument(
    buildSvgDocument(payload),
    "image/svg+xml;charset=utf-8",
    "我的申请档案.svg",
  );
}

function exportPortfolioWordDocument() {
  const payload = buildPortfolioExportPayload();
  trackPortfolioUsageEvent("export_word", {
    metrics: { generatedActivityCount: payload.activities.length },
    details: {
      exportSurface: "portfolio",
      format: "word",
    },
  });
  downloadPortfolioDocument(
    buildWordDocument(payload),
    "application/msword;charset=utf-8",
    "我的申请档案.doc",
  );
}

async function clearCurrentPortfolio() {
  if (
    !window.confirm(
      "确认清空当前方案？此操作会清空我的申请档案页面中已填写的成绩、活动、竞赛、夏校、推荐信和选校计划。",
    )
  ) {
    return;
  }
  trackPortfolioUsageEvent("clear_draft", { details: { exportSurface: "portfolio" } });
  renderPortfolio(emptyPortfolio());
  isDirty = true;
  updateCompletion();
  const saved = await savePortfolio();
  if (saved) setStatus("已清空当前方案");
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
    const [response, internationalResponse, otherRegionResponse] = await Promise.all([
      fetch(APPLICATION_ROUND_SCHOOLS_ENDPOINT),
      ...APPLICATION_BACKUP_SCHOOLS_ENDPOINTS.map((endpoint) => fetch(endpoint)),
    ]);
    if (response.status === 401) {
      window.location.href = "./index.html";
      throw new Error("请先登录");
    }
    if (!response.ok || !internationalResponse.ok || !otherRegionResponse.ok) {
      throw new Error("院校轮次数据加载失败");
    }
    applicationRoundSchools = [
      ...parseApplicationRoundSchoolsMarkdown(await response.text()),
      ...parseApplicationBackupSchoolsMarkdown(
        await internationalResponse.text(),
        await otherRegionResponse.text(),
      ),
    ];
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
    trackPortfolioUsageEvent("portfolio_save", {
      details: { saveSurface: "my_activities" },
    });
    return saved;
  } catch (error) {
    setStatus(error.message, true);
    return null;
  } finally {
    setButtonsDisabled(false);
  }
}

async function requestJson(url, options = {}) {
  const response = await csrfFetch(url, {
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

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readPendingCapabilityAssessmentJob() {
  try {
    const raw = localStorage.getItem(CAPABILITY_ASSESSMENT_PENDING_JOB_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record?.jobId ? record : null;
  } catch {
    return null;
  }
}

function rememberPendingCapabilityAssessmentJob(jobId) {
  if (!jobId) return;
  localStorage.setItem(
    CAPABILITY_ASSESSMENT_PENDING_JOB_KEY,
    JSON.stringify({ jobId, createdAt: new Date().toISOString() }),
  );
}

function clearPendingCapabilityAssessmentJob() {
  localStorage.removeItem(CAPABILITY_ASSESSMENT_PENDING_JOB_KEY);
}

async function waitForCapabilityAssessmentJob(jobId) {
  if (!jobId) throw new Error("能力评估任务创建失败，请刷新页面后重试。");
  const deadline = performance.now() + CAPABILITY_ASSESSMENT_JOB_TIMEOUT_MS;
  let consecutivePollFailures = 0;

  while (performance.now() < deadline) {
    let job;
    try {
      job = await requestJson(`${CAPABILITY_ASSESSMENT_JOB_ENDPOINT}/${encodeURIComponent(jobId)}`, {
        method: "GET",
      });
      consecutivePollFailures = 0;
    } catch (error) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 3) throw error;
      setCapabilityAssessmentStatus("正在重新连接 DeepSeek Agent 后台评估任务...");
      await delay(CAPABILITY_ASSESSMENT_JOB_POLL_INTERVAL_MS);
      continue;
    }

    if (job.status === "completed") return job.result || {};
    if (job.status === "failed") {
      const error = new Error(job.error || "DeepSeek Agent 评估失败，请稍后重试。");
      error.final = true;
      throw error;
    }
    setCapabilityAssessmentStatus("DeepSeek Agent 正在后台评估，可先切换页面；回到本页会自动接上。");
    await delay(CAPABILITY_ASSESSMENT_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("DeepSeek Agent 评估耗时过长，请稍后回到本页查看，或重新生成。");
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

function syncAcademicCourseSystemPanels(courseSystem = fieldValue("academicRecords_courseSystem")) {
  const normalizedCourseSystem = COURSE_SYSTEM_OPTIONS.includes(courseSystem) ? courseSystem : "";
  const activePanel = normalizedCourseSystem === COURSE_SYSTEM_IB
    ? "ib"
    : normalizedCourseSystem === COURSE_SYSTEM_OTHER
      ? "other"
      : "empty";
  gpaRecordsList?.querySelectorAll("[data-academic-course-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.academicCoursePanel !== activePanel;
  });
  if (addGpaRecordButton) {
    addGpaRecordButton.hidden = normalizedCourseSystem !== COURSE_SYSTEM_OTHER;
    addGpaRecordButton.disabled = normalizedCourseSystem !== COURSE_SYSTEM_OTHER;
  }
  if (academicCourseBlockTitle) {
    academicCourseBlockTitle.textContent =
      normalizedCourseSystem === COURSE_SYSTEM_IB
        ? "IB课程成绩"
        : normalizedCourseSystem === COURSE_SYSTEM_OTHER
          ? "GPA成绩"
          : "课程成绩";
  }
}

function toggleApplicationSchoolCombobox(trigger) {
  const combobox = trigger?.closest("[data-application-school-combobox]");
  const menu = combobox?.querySelector("[data-application-school-menu]");
  if (!combobox || !menu) return;
  const shouldOpen = menu.hidden;
  closeApplicationSchoolComboboxes(combobox);
  menu.hidden = !shouldOpen;
  trigger.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    menu.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
  }
}

function closeApplicationSchoolComboboxes(exceptCombobox = null) {
  applicationPlanList
    ?.querySelectorAll("[data-application-school-combobox]")
    .forEach((combobox) => {
      if (combobox === exceptCombobox) return;
      combobox.querySelector("[data-application-school-menu]")?.setAttribute("hidden", "");
      combobox.querySelector("[data-application-school-trigger]")?.setAttribute("aria-expanded", "false");
    });
}

function selectApplicationSchool(option) {
  const field = option.closest(".application-school-field");
  const input = field?.querySelector("[data-application-school-value]");
  if (!field || !input) return;
  updateApplicationSchoolValue(input, option.dataset.schoolValue || "", option.dataset.schoolLabel || "");
  closeApplicationSchoolComboboxes();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function updateApplicationSchoolValue(input, value, label = "") {
  input.value = value;
  const field = input.closest(".application-school-field");
  const triggerText = field?.querySelector("[data-application-school-trigger-text]");
  if (triggerText) triggerText.textContent = label || "请选择院校";
  field?.querySelectorAll("[data-application-school-option]").forEach((option) => {
    const selected = value && option.dataset.schoolValue === value;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(Boolean(selected)));
  });
}

function focusApplicationSchoolControl(roundKey, index) {
  applicationPlanList
    ?.querySelector(
      `[data-application-round="${roundKey}"][data-application-index="${index}"] [data-application-school-trigger]`,
    )
    ?.focus();
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
  focusApplicationSchoolControl(roundKey, applicationRoundRowCounts[roundKey] - 1);
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
  const isSchoolControl =
    target instanceof HTMLSelectElement
    || (target instanceof HTMLInputElement && target.matches("[data-application-school-value]"));
  if (!isSchoolControl || !target.value) return;
  if (target.name === applicationControlName("rea", 0, "school")) clearApplicationRound("ed1");
  if (target.name === applicationControlName("ed1", 0, "school")) clearApplicationRound("rea");
}

function clearApplicationRound(roundKey) {
  for (const field of ["school", "major"]) {
    const element = portfolioForm.elements.namedItem(applicationControlName(roundKey, 0, field));
    if (!element) continue;
    element.value = "";
    if (element instanceof HTMLInputElement && element.matches("[data-application-school-value]")) {
      updateApplicationSchoolValue(element, "");
    }
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
  portfolioActionButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function markDirty() {
  if (isRendering) return;
  isDirty = true;
  setStatus("有未保存修改");
  if (currentPortfolio.capabilityAssessment?.radarScores?.length) {
    setCapabilityAssessmentStatus("档案已修改，建议重新生成");
  }
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
  if (event.target instanceof HTMLSelectElement && event.target.name === "academicRecords_courseSystem") {
    syncAcademicCourseSystemPanels(event.target.value);
  }
  markDirty();
});
savePortfolioButtons.forEach((button) => {
  button.addEventListener("click", savePortfolio);
});
exportPortfolioSvgButton?.addEventListener("click", exportPortfolioSvgDocument);
exportPortfolioWordButton?.addEventListener("click", exportPortfolioWordDocument);
clearPortfolioButton?.addEventListener("click", clearCurrentPortfolio);
generateCapabilityAssessmentButton?.addEventListener("click", generateCapabilityAssessment);
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
  const schoolTrigger = event.target.closest("[data-application-school-trigger]");
  if (schoolTrigger) {
    toggleApplicationSchoolCombobox(schoolTrigger);
    return;
  }
  const schoolOption = event.target.closest("[data-application-school-option]");
  if (schoolOption) {
    selectApplicationSchool(schoolOption);
    return;
  }
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
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-application-school-combobox]")) return;
  closeApplicationSchoolComboboxes();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeApplicationSchoolComboboxes();
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
loadPortfolio().then(resumePendingCapabilityAssessmentJob);
loadActivityImportSources();
