import {
  getAgentAvailability,
  getDeepSeekGenerationAvailability,
} from "./ui-state.mjs";
import { clearDraftFields } from "./draft-state.mjs";
import { buildCodexTaskPackage } from "../domain/codex-mode.mjs";
import { parseAgentOutput } from "../domain/agent-output-parser.mjs";
import {
  buildStudentCaseProfile,
  matchAdmissionCases,
  parseAdmissionCasesMarkdown,
} from "../domain/admission-case-matcher.mjs?v=20260528-case-refresh";
import {
  buildCompetitionStudentProfile,
  parseCompetitionsMarkdown,
  recommendCompetitions,
} from "../domain/competition-recommender.mjs";
import {
  buildSummerSchoolStudentProfile,
  parseSummerSchoolsMarkdown,
  recommendSummerSchools,
} from "../domain/summer-school-recommender.mjs";
import { buildRecommendationLetterStrategy } from "../domain/recommendation-letter-recommender.mjs";
import { renderActivityQualityPanel } from "./activity-quality-ui.mjs";
import {
  buildParseFailureMessage,
  renderParseDiagnostics,
} from "./agent-answer-diagnostics-ui.mjs";
import { buildWordDocument } from "../domain/word-export.mjs";
import { getRequestErrorMessage } from "./auth-client-errors.mjs";
import { escapeHtml } from "./html-utils.mjs";
import {
  applyProfileFields,
  collectActivitiesFromTable,
  collectPlanningProfileFromForm,
  collectProfileFromForm,
  fillActivityTable,
} from "./planning-form-state.mjs";
import {
  readUserDraft,
  removeLegacySharedDraft,
  removeUserDraft,
} from "./draft-storage.mjs";
import { normalizeSnapshotNote, stripSensitiveDraftFields } from "../shared/privacy-guards.mjs";

const authShell = document.querySelector("#authShell");
const appShell = document.querySelector("#appShell");
const heroStartButton = document.querySelector("#heroStartButton");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#auth-title");
const authNameField = document.querySelector("#authNameField");
const authNameInput = document.querySelector("#authName");
const authEmailInput = document.querySelector("#authEmail");
const authPasswordInput = document.querySelector("#authPassword");
const authSubmitButton = document.querySelector("#authSubmitButton");
const authModeButton = document.querySelector("#authModeButton");
const forgotPasswordButton = document.querySelector("#forgotPasswordButton");
const authStatus = document.querySelector("#authStatus");
const currentUserBadge = document.querySelector("#currentUserBadge");
const logoutButton = document.querySelector("#logoutButton");
const adminDashboardLink = document.querySelector("#adminDashboardLink");
const profileForm = document.querySelector("#profileForm");
const activityTable = document.querySelector("#activityTable");
const saveButton = document.querySelector("#saveButton");
const exportButton = document.querySelector("#exportButton");
const exportWordButton = document.querySelector("#exportWordButton");
const resetButton = document.querySelector("#resetButton");
const saveStatus = document.querySelector("#saveStatus");
const agentStatus = document.querySelector("#agentStatus");
const promptStatus = document.querySelector("#promptStatus");
const generateDeepSeekButton = document.querySelector("#generateDeepSeekButton");
const deepSeekStatus = document.querySelector("#deepSeekStatus");
const rawAnswer = document.querySelector("#rawAnswer");
const narrativeOutput = document.querySelector("#narrativeOutput");
const buildCodexTaskButton = document.querySelector("#buildCodexTaskButton");
const copyCodexTaskButton = document.querySelector("#copyCodexTaskButton");
const parseCodexAnswerButton = document.querySelector("#parseCodexAnswerButton");
const codexTaskPackage = document.querySelector("#codexTaskPackage");
const codexAnswerInput = document.querySelector("#codexAnswerInput");
const parseDiagnostics = document.querySelector("#parseDiagnostics");
const caseMatchStatus = document.querySelector("#caseMatchStatus");
const caseMatchNotice = document.querySelector("#caseMatchNotice");
const caseMatchList = document.querySelector("#caseMatchList");
const refreshCaseMatchesButton = document.querySelector("#refreshCaseMatchesButton");
const competitionStatus = document.querySelector("#competitionStatus");
const competitionNotice = document.querySelector("#competitionNotice");
const competitionList = document.querySelector("#competitionList");
const refreshCompetitionsButton = document.querySelector("#refreshCompetitionsButton");
const summerSchoolStatus = document.querySelector("#summerSchoolStatus");
const summerSchoolNotice = document.querySelector("#summerSchoolNotice");
const summerSchoolList = document.querySelector("#summerSchoolList");
const refreshSummerSchoolsButton = document.querySelector("#refreshSummerSchoolsButton");
const recommendationLetterStatus = document.querySelector("#recommendationLetterStatus");
const recommendationLetterNotice = document.querySelector("#recommendationLetterNotice");
const recommendationLetterList = document.querySelector("#recommendationLetterList");
const activityQualityStatus = document.querySelector("#activityQualityStatus");
const activityQualityScore = document.querySelector("#activityQualityScore");
const activityQualitySummary = document.querySelector("#activityQualitySummary");
const activityQualityMetrics = document.querySelector("#activityQualityMetrics");
const activityQualityStrengths = document.querySelector("#activityQualityStrengths");
const activityQualityIssues = document.querySelector("#activityQualityIssues");
const activityQualityActivityNotes = document.querySelector("#activityQualityActivityNotes");
const studentProfileSummary = document.querySelector("#studentProfileSummary");
const profileUpdatedAt = document.querySelector("#profileUpdatedAt");
const planList = document.querySelector("#planList");
const newPlanButton = document.querySelector("#newPlanButton");
const renamePlanButton = document.querySelector("#renamePlanButton");
const deletePlanButton = document.querySelector("#deletePlanButton");
const planningWorkspaceStatus = document.querySelector("#planningWorkspaceStatus");
const snapshotNote = document.querySelector("#snapshotNote");
const createSnapshotButton = document.querySelector("#createSnapshotButton");
const snapshotList = document.querySelector("#snapshotList");

let fixedPrompt = "";
let serverHasDeepSeekApiKey = false;
let admissionCases = [];
let latestCaseMatches = [];
let caseMatchBatchIndex = 0;
let competitions = [];
let latestCompetitionRecommendations = [];
let previousCompetitionBatchIds = [];
let competitionBatchIndex = 0;
let summerSchools = [];
let latestSummerSchoolRecommendations = [];
let previousSummerSchoolBatchIds = [];
let seenSummerSchoolIds = [];
let summerSchoolBatchIndex = 0;
let latestRecommendationLetterStrategy = { items: [] };
let authMode = "register";
let appInitialized = false;
let currentUser = null;
let currentProfileUpdatedAt = null;
let plans = [];
let currentPlan = null;
let snapshots = [];
let workspaceDirty = false;
const initialResetToken = new URLSearchParams(window.location.search).get("resetToken");
const PROTECTED_NEXT_PATHS = new Set([
  "/course-helper.html",
  "/gpa-calculator.html",
  "/my-activities.html",
  "/resource-library.html",
  "/school-encyclopedia.html",
]);

function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  if (!next.startsWith("/") || next.startsWith("//")) return "";
  return PROTECTED_NEXT_PATHS.has(next) ? next : "";
}

function redirectToNextPath() {
  const nextPath = getSafeNextPath();
  if (!nextPath) return false;
  window.location.assign(nextPath);
  return true;
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegistering = authMode === "register";
  const isForgotPassword = authMode === "forgot";
  const isResetPassword = authMode === "reset";

  authTitle.textContent = {
    login: "登录",
    register: "领取你的申请行动地图",
    forgot: "找回密码",
    reset: "设置新密码",
  }[authMode];
  authSubmitButton.textContent = {
    login: "登录",
    register: "免费注册并生成规划",
    forgot: "发送重置邮件",
    reset: "更新密码",
  }[authMode];
  authModeButton.textContent = isRegistering ? "已有账号？登录" : "返回登录";
  if (authMode === "login") authModeButton.textContent = "没有账号？注册";
  authNameField.classList.toggle("is-hidden", !isRegistering);
  authEmailInput.closest("label").classList.toggle("is-hidden", isResetPassword);
  authPasswordInput.closest("label").classList.toggle("is-hidden", isForgotPassword);
  forgotPasswordButton.classList.toggle("is-hidden", authMode !== "login");
  authNameInput.required = isRegistering;
  authEmailInput.required = !isResetPassword;
  authPasswordInput.required = !isForgotPassword;
  authPasswordInput.autocomplete = isRegistering || isResetPassword ? "new-password" : "current-password";
  authStatus.textContent = "";
  authStatus.classList.remove("error");
}

function showAuthView(message = "") {
  authShell.classList.remove("is-hidden");
  appShell.classList.add("is-hidden");
  currentUserBadge.textContent = "";
  adminDashboardLink?.classList.add("is-hidden");
  if (message) authStatus.textContent = message;
}

function showAppView(user) {
  authShell.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  currentUserBadge.textContent = `${user.name} (${user.role})`;
  adminDashboardLink?.classList.toggle(
    "is-hidden",
    user.role !== "admin",
  );
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  } catch (error) {
    throw new Error(getRequestErrorMessage(error));
  }
}

async function loadCurrentUser() {
  try {
    const data = await requestJson("/api/auth/me", { method: "GET" });
    if (redirectToNextPath()) return;
    await initializeApp(data.user);
    showAppView(data.user);
  } catch {
    showAuthView(getSafeNextPath() ? "请先登录后继续访问该页面。" : "");
  }
}

async function submitAuthForm(event) {
  event.preventDefault();
  authSubmitButton.disabled = true;
  authStatus.textContent =
    {
      login: "正在登录...",
      register: "正在注册...",
      forgot: "正在发送...",
      reset: "正在更新密码...",
    }[authMode] || "处理中...";
  authStatus.classList.remove("error");

  try {
    if (authMode === "forgot") {
      const data = await requestJson("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: authEmailInput.value.trim() }),
      });
      authStatus.textContent = data.message || "如果邮箱已注册，重置邮件会发送到该邮箱。";
      return;
    }

    if (authMode === "reset") {
      await requestJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: initialResetToken,
          password: authPasswordInput.value,
        }),
      });
      authForm.reset();
      setAuthMode("login");
      authStatus.textContent = "密码已更新，请使用新密码登录。";
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const payload = {
      email: authEmailInput.value.trim(),
      password: authPasswordInput.value,
    };
    if (authMode === "register") payload.name = authNameInput.value.trim();

    const data = await requestJson(`/api/auth/${authMode}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    authForm.reset();
    if (redirectToNextPath()) return;
    await initializeApp(data.user);
    showAppView(data.user);
  } catch (error) {
    authStatus.textContent = error.message;
    authStatus.classList.add("error");
  } finally {
    authSubmitButton.disabled = false;
  }
}

async function logout() {
  await requestJson("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => ({}));
  clearVisibleDraft();
  currentUser = null;
  currentPlan = null;
  plans = [];
  snapshots = [];
  workspaceDirty = false;
  setAuthMode("login");
  showAuthView("已退出登录");
}

function collectProfile() {
  return collectProfileFromForm(profileForm);
}

function collectPlanningProfile() {
  return collectPlanningProfileFromForm(profileForm);
}

function collectActivities() {
  return collectActivitiesFromTable(activityTable);
}

function collectDraft() {
  return stripSensitiveDraftFields({
    profile: collectProfile(),
    activities: collectActivities(),
    rawAnswer: rawAnswer.value,
    narrative: narrativeOutput.value,
    competitionRecommendations: latestCompetitionRecommendations,
    summerSchoolRecommendations: latestSummerSchoolRecommendations,
    recommendationLetterStrategy: latestRecommendationLetterStrategy,
    caseMatches: latestCaseMatches,
    updatedAt: new Date().toISOString(),
  });
}

function collectPlanDraft() {
  const { profile, updatedAt, ...draft } = collectDraft();
  return draft;
}

function collectAnalyticsProfile() {
  const profile = collectProfile();
  return {
    grade: profile.grade || "",
    majorDirection: profile.majorDirection || "",
  };
}

function countFilledActivities() {
  return collectActivities().filter(
    (activity) =>
      activity.type ||
      activity.activityName ||
      activity.executionDescription ||
      activity.suggestedGrade,
  ).length;
}

function countCompletedProfileFields() {
  return Object.values(collectProfile()).filter((value) => String(value || "").trim()).length;
}

function buildAnalyticsMetrics(extra = {}) {
  return {
    completionFields: countCompletedProfileFields(),
    filledActivityCount: countFilledActivities(),
    ...extra,
  };
}

function trackUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  fetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: collectAnalyticsProfile(),
      metrics: buildAnalyticsMetrics(metrics),
      details,
    }),
  }).catch(() => {});
}

function buildCurrentStudentCaseProfile() {
  return buildStudentCaseProfile({
    profile: collectPlanningProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
  });
}

function buildCurrentCompetitionStudentProfile() {
  return buildCompetitionStudentProfile({
    profile: collectProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
  });
}

function buildCurrentSummerSchoolStudentProfile() {
  return buildSummerSchoolStudentProfile({
    profile: collectProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
  });
}

function renderActivityQuality() {
  renderActivityQualityPanel({
    elements: {
      status: activityQualityStatus,
      score: activityQualityScore,
      summary: activityQualitySummary,
      metrics: activityQualityMetrics,
      strengths: activityQualityStrengths,
      issues: activityQualityIssues,
      activityNotes: activityQualityActivityNotes,
    },
    profile: collectProfile(),
    activities: collectActivities(),
  });
}

function renderCompetitionRecommendations({ refresh = false } = {}) {
  if (!competitionList || !competitionNotice || !competitionStatus) return;

  if (refresh) {
    previousCompetitionBatchIds = latestCompetitionRecommendations.map((item) => item.id);
    competitionBatchIndex += 1;
  }

  if (!competitions.length) {
    latestCompetitionRecommendations = [];
    competitionStatus.textContent = "竞赛库为空";
    competitionNotice.textContent = "当前竞赛库暂未找到合适竞赛，请补充竞赛资料后再生成推荐。";
    competitionList.innerHTML = "";
    return;
  }

  const result = recommendCompetitions({
    studentProfile: buildCurrentCompetitionStudentProfile(),
    competitions,
    previousBatchIds: previousCompetitionBatchIds,
    batchIndex: competitionBatchIndex,
  });

  latestCompetitionRecommendations = result.items;
  competitionStatus.textContent = `已载入 ${competitions.length} 个竞赛`;
  competitionNotice.textContent = result.notice || "已根据当前学生背景生成 3 个学科强相关竞赛和 2 个拓展型竞赛。";

  competitionList.innerHTML = latestCompetitionRecommendations
    .map(
      (competition, index) => `
        <article class="competition-card">
          <div class="competition-card__header">
            <div>
              <p class="case-index">推荐 ${index + 1}</p>
              <h3>${escapeHtml(competition.name)}</h3>
            </div>
            <span class="competition-type">${escapeHtml(competition.recommendationType)}</span>
          </div>
          <dl class="case-fields">
            <div><dt>含金量评级</dt><dd>${escapeHtml(competition.rating || "B")}</dd></div>
            <div><dt>推荐理由</dt><dd>${escapeHtml(competition.recommendationReason)}</dd></div>
            <div><dt>申请帮助</dt><dd>${escapeHtml(competition.applicationHelp)}</dd></div>
            <div><dt>准备时间</dt><dd>${escapeHtml(competition.prepTime)}</dd></div>
            <div><dt>官网链接</dt><dd>${renderCompetitionUrl(competition.url)}</dd></div>
          </dl>
        </article>`,
    )
    .join("");
}

function renderCompetitionUrl(url) {
  if (!url || url === "官网待确认") return "官网待确认";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
}

function renderSummerSchoolRecommendations({ refresh = false } = {}) {
  if (!summerSchoolList || !summerSchoolNotice || !summerSchoolStatus) return;

  if (refresh) {
    previousSummerSchoolBatchIds = latestSummerSchoolRecommendations.map((item) => item.id);
    seenSummerSchoolIds = [...new Set([...seenSummerSchoolIds, ...previousSummerSchoolBatchIds])];
    summerSchoolBatchIndex += 1;
  }

  if (!summerSchools.length) {
    latestSummerSchoolRecommendations = [];
    summerSchoolStatus.textContent = "夏校库为空";
    summerSchoolNotice.textContent = "当前夏校库暂未找到合适项目，请补充夏校资料后再生成推荐。";
    summerSchoolList.innerHTML = "";
    return;
  }

  const result = recommendSummerSchools({
    studentProfile: buildCurrentSummerSchoolStudentProfile(),
    summerSchools,
    seenIds: seenSummerSchoolIds,
    previousBatchIds: previousSummerSchoolBatchIds,
    batchIndex: summerSchoolBatchIndex,
  });

  latestSummerSchoolRecommendations = result.items;
  summerSchoolStatus.textContent = `已载入 ${summerSchools.length} 个夏校`;
  summerSchoolNotice.textContent = result.notice || "已根据当前学生背景生成冲刺型、匹配型和保底型夏校推荐。";

  summerSchoolList.innerHTML = latestSummerSchoolRecommendations
    .map(
      (school) => `
        <article class="summer-card">
          <div class="summer-card__header">
            <div>
              <p class="case-index">${escapeHtml(school.tier)}</p>
              <h3>${escapeHtml(school.name)}</h3>
            </div>
            <span class="summer-rating">${escapeHtml(school.rating)}</span>
          </div>
          <dl class="case-fields">
            <div><dt>适配方向</dt><dd>${escapeHtml(school.category)}</dd></div>
            <div><dt>推荐理由</dt><dd>${escapeHtml(school.reason)}</dd></div>
            <div><dt>形式 & 官网</dt><dd>${escapeHtml(school.formatAndWebsite)}</dd></div>
            <div><dt>录取率</dt><dd>${escapeHtml(school.admissionRate)}</dd></div>
            <div><dt>申请要求</dt><dd>${escapeHtml((school.requirements || []).join("；"))}</dd></div>
            <div><dt>举办时间</dt><dd>${escapeHtml(school.programTime)}</dd></div>
            <div><dt>申请时间</dt><dd>${escapeHtml(school.applicationTime)}</dd></div>
          </dl>
        </article>`,
    )
    .join("");
}

function renderRecommendationLetterStrategy() {
  if (!recommendationLetterList || !recommendationLetterNotice || !recommendationLetterStatus) return;

  latestRecommendationLetterStrategy = buildRecommendationLetterStrategy({
    profile: collectPlanningProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
  });

  recommendationLetterStatus.textContent = latestRecommendationLetterStrategy.ready ? "已生成策略" : "等待完整输入";
  recommendationLetterNotice.textContent = latestRecommendationLetterStrategy.notice;

  if (!latestRecommendationLetterStrategy.items?.length) {
    recommendationLetterList.innerHTML = "";
    return;
  }

  recommendationLetterList.innerHTML = latestRecommendationLetterStrategy.items
    .map(
      (letter, index) => `
        <article class="recommendation-letter-card">
          <div class="recommendation-letter-card__header">
            <div>
              <p class="case-index">推荐信 ${index + 1}</p>
              <h3>${escapeHtml(letter.role)}</h3>
            </div>
            <span class="letter-priority">${escapeHtml(letter.priority)}</span>
          </div>
          <dl class="case-fields">
            <div><dt>推荐人类型</dt><dd>${escapeHtml(letter.recommenderType)}</dd></div>
            <div><dt>推荐重点</dt><dd>${escapeHtml(letter.recommendationFocus)}</dd></div>
            <div><dt>可用证据</dt><dd>${escapeHtml(letter.evidence)}</dd></div>
            <div><dt>准备建议</dt><dd>${escapeHtml(letter.preparationAdvice)}</dd></div>
          </dl>
        </article>`,
    )
    .join("");
}

function renderCaseMatches({ refresh = false } = {}) {
  if (!caseMatchList || !caseMatchNotice || !caseMatchStatus) return;

  if (refresh) caseMatchBatchIndex += 1;

  if (!admissionCases.length) {
    latestCaseMatches = [];
    caseMatchBatchIndex = 0;
    caseMatchStatus.textContent = "案例库为空";
    caseMatchNotice.textContent =
      "当前案例库暂未找到合适案例，建议后续补充更多录取案例数据后再生成匹配结果。";
    caseMatchList.innerHTML = "";
    if (refreshCaseMatchesButton) refreshCaseMatchesButton.disabled = true;
    return;
  }

  const rankedMatches = matchAdmissionCases({
    studentProfile: buildCurrentStudentCaseProfile(),
    cases: admissionCases,
    limit: admissionCases.length,
  });

  if (!rankedMatches.length) {
    latestCaseMatches = [];
    caseMatchBatchIndex = 0;
    caseMatchStatus.textContent = `已载入 ${admissionCases.length} 个案例`;
    caseMatchNotice.textContent =
      "当前案例库暂未找到合适案例，建议后续补充更多录取案例数据后再生成匹配结果。";
    caseMatchList.innerHTML = "";
    if (refreshCaseMatchesButton) refreshCaseMatchesButton.disabled = true;
    return;
  }

  const selectedIndex = caseMatchBatchIndex % rankedMatches.length;
  latestCaseMatches = [rankedMatches[selectedIndex]];
  caseMatchStatus.textContent = `已载入 ${admissionCases.length} 个案例 · 当前第 ${selectedIndex + 1}/${rankedMatches.length} 个`;
  if (refreshCaseMatchesButton) refreshCaseMatchesButton.disabled = rankedMatches.length <= 1;

  const hasHighMatch = latestCaseMatches.some((match) => match.strength === "high");
  if (selectedIndex > 0) {
    caseMatchNotice.textContent = `以下为匹配度排名第 ${selectedIndex + 1} 的相似案例，匹配度仅次于上一条推荐案例。`;
  } else {
    caseMatchNotice.textContent = hasHighMatch
      ? "以下为当前案例库中专业方向和背景最接近的一个录取案例。点击“换一批”可查看匹配度次高的案例。"
      : "以下为当前案例库中专业方向接近、但整体相似度仍需谨慎参考的一个案例。点击“换一批”可查看匹配度次高的案例。";
  }

  caseMatchList.innerHTML = latestCaseMatches
    .map((match, index) => {
      const admissionCase = match.case;
      const score = Math.round(match.score * 100);
      return `
        <article class="case-card">
          <div class="case-card__header">
            <div>
              <p class="case-index">案例 ${selectedIndex + index + 1}</p>
              <h3>${escapeHtml(admissionCase.admission)}</h3>
            </div>
            <span class="case-score">匹配度 ${score}</span>
          </div>
          <dl class="case-fields">
            <div><dt>专业方向</dt><dd>${escapeHtml(admissionCase.major)}</dd></div>
            <div><dt>课程成绩</dt><dd>${escapeHtml(admissionCase.academics)}</dd></div>
            <div><dt>奖项亮点</dt><dd>${escapeHtml(admissionCase.awards)}</dd></div>
            <div><dt>活动亮点</dt><dd>${escapeHtml(admissionCase.activities)}</dd></div>
            <div><dt>匹配理由</dt><dd>${escapeHtml(match.matchReason)}</dd></div>
            <div><dt>可借鉴点</dt><dd>${escapeHtml(match.takeaway)}</dd></div>
          </dl>
        </article>`;
    })
    .join("");
}

function renderStudentDependentRecommendations() {
  renderActivityQuality();
  previousCompetitionBatchIds = [];
  competitionBatchIndex = 0;
  previousSummerSchoolBatchIds = [];
  seenSummerSchoolIds = [];
  summerSchoolBatchIndex = 0;
  caseMatchBatchIndex = 0;
  renderCompetitionRecommendations();
  renderSummerSchoolRecommendations();
  renderRecommendationLetterStrategy();
  renderCaseMatches();
}

async function loadAdmissionCases() {
  if (!caseMatchStatus) return;

  try {
    const response = await fetch("./data/admission-cases.md");
    if (!response.ok) throw new Error("admission cases unavailable");
    const markdown = await response.text();
    admissionCases = parseAdmissionCasesMarkdown(markdown);
    renderCaseMatches();
  } catch {
    trackUsageEvent("data_load_failure", { details: { dataset: "admission_cases" } });
    admissionCases = [];
    renderCaseMatches();
  }
}

async function loadCompetitions() {
  if (!competitionStatus) return;

  try {
    const response = await fetch("./data/competitions.md");
    if (!response.ok) throw new Error("competitions unavailable");
    const markdown = await response.text();
    competitions = parseCompetitionsMarkdown(markdown);
    renderCompetitionRecommendations();
  } catch {
    trackUsageEvent("data_load_failure", { details: { dataset: "competitions" } });
    competitions = [];
    renderCompetitionRecommendations();
  }
}

async function loadSummerSchools() {
  if (!summerSchoolStatus) return;

  try {
    const response = await fetch("./data/summer-schools.md");
    if (!response.ok) throw new Error("summer schools unavailable");
    const markdown = await response.text();
    summerSchools = parseSummerSchoolsMarkdown(markdown);
    renderSummerSchoolRecommendations();
  } catch {
    trackUsageEvent("data_load_failure", { details: { dataset: "summer_schools" } });
    summerSchools = [];
    renderSummerSchoolRecommendations();
  }
}

function updateAgentAvailability(promptLoaded = true) {
  const availability = getAgentAvailability({
    protocol: window.location.protocol,
    promptLoaded,
  });

  promptStatus.textContent = availability.message;
  agentStatus.textContent = availability.canGenerate ? "等待生成任务包" : availability.message;
  agentStatus.classList.toggle("error", !availability.canGenerate);
  updateDeepSeekAvailability(promptLoaded);
  return availability;
}

function updateDeepSeekAvailability(promptLoaded = Boolean(fixedPrompt)) {
  if (!deepSeekStatus || !generateDeepSeekButton) return null;

  const availability = getDeepSeekGenerationAvailability({
    protocol: window.location.protocol,
    promptLoaded,
    hasServerApiKey: serverHasDeepSeekApiKey,
  });

  deepSeekStatus.textContent = availability.message;
  deepSeekStatus.classList.toggle("error", !availability.canGenerate);
  generateDeepSeekButton.disabled = !availability.canGenerate;
  return availability;
}

function fillActivities(activities) {
  fillActivityTable(activityTable, activities);
}

function applyProfile(profile = {}) {
  applyProfileFields(profileForm, profile);
}

function clearPlanFields() {
  activityTable.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  rawAnswer.value = "";
  narrativeOutput.value = "";
  codexTaskPackage.value = "";
  codexAnswerInput.value = "";
  latestCompetitionRecommendations = [];
  latestSummerSchoolRecommendations = [];
  latestRecommendationLetterStrategy = { items: [] };
  latestCaseMatches = [];
}

function applyPlanDraft(draft = {}) {
  draft = stripSensitiveDraftFields(draft);
  clearPlanFields();
  fillActivities(draft.activities || []);
  rawAnswer.value = draft.rawAnswer || "";
  narrativeOutput.value = draft.narrative || "";
  renderStudentDependentRecommendations();
}

function isPlanDraftEmpty(draft = {}) {
  return (
    !(draft.activities || []).some((activity) =>
      Object.values(activity || {}).some((value) => String(value || "").trim()),
    ) &&
    !String(draft.rawAnswer || "").trim() &&
    !String(draft.narrative || "").trim() &&
    !(draft.competitionRecommendations || []).length &&
    !(draft.summerSchoolRecommendations || []).length &&
    !(draft.recommendationLetterStrategy?.items || []).length &&
    !(draft.caseMatches || []).length
  );
}

function formatWorkspaceDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderProfileSummary() {
  if (!studentProfileSummary || !profileUpdatedAt) return;
  const profile = collectProfile();
  const summary = [profile.grade, profile.majorDirection, profile.interests]
    .filter((item) => String(item || "").trim())
    .join(" / ");
  studentProfileSummary.textContent = summary || "还没有填写学生信息。";
  profileUpdatedAt.textContent = currentProfileUpdatedAt
    ? `最近保存：${formatWorkspaceDate(currentProfileUpdatedAt)}`
    : "尚未保存";
}

function setWorkspaceStatus(message, isError = false) {
  if (!planningWorkspaceStatus) return;
  planningWorkspaceStatus.textContent = message;
  planningWorkspaceStatus.classList.toggle("error", isError);
}

function renderPlanList() {
  if (!planList) return;
  planList.innerHTML = plans
    .map(
      (plan) => `
        <div class="plan-item">
          <button type="button" data-plan-id="${plan.id}" class="${currentPlan?.id === plan.id ? "is-active" : ""}">
            ${escapeHtml(plan.name)}
          </button>
        </div>`,
    )
    .join("");
}

function renderSnapshots() {
  if (!snapshotList) return;
  if (!snapshots.length) {
    snapshotList.innerHTML = '<p class="workspace-empty">还没有备份。</p>';
    return;
  }
  snapshotList.innerHTML = snapshots
    .map(
      (snapshot) => `
        <div class="snapshot-row">
          <div>
            <p>${escapeHtml(snapshot.note || "未填写备注")}</p>
            <p class="workspace-meta">${escapeHtml(formatWorkspaceDate(snapshot.createdAt))}</p>
          </div>
          <div class="snapshot-actions">
            <button type="button" class="quiet neutral" data-snapshot-id="${snapshot.id}">恢复</button>
            <button type="button" class="danger" data-delete-snapshot-id="${snapshot.id}">删除</button>
          </div>
        </div>`,
    )
    .join("");
}

async function loadSnapshots() {
  if (!currentPlan) return;
  const data = await requestJson(`/api/plans/${currentPlan.id}/snapshots`, { method: "GET" });
  snapshots = data.snapshots || [];
  renderSnapshots();
}

async function openPlan(planId) {
  if (workspaceDirty) {
    if (!window.confirm("当前内容还没有保存，切换方案会放弃这些修改。继续吗？")) return;
    const profileData = await requestJson("/api/student-profile", { method: "GET" });
    currentProfileUpdatedAt = profileData.updatedAt;
    applyProfile(profileData.profile);
    renderProfileSummary();
  }
  const data = await requestJson(`/api/plans/${planId}`, { method: "GET" });
  currentPlan = data.plan;
  applyPlanDraft(currentPlan.draft);
  workspaceDirty = false;
  renderPlanList();
  await loadSnapshots();
  saveStatus.textContent = `当前方案：${currentPlan.name}`;
}

async function persistCurrentWorkspace() {
  if (!currentUser || !currentPlan) return;
  const [profileData, planData] = await Promise.all([
    requestJson("/api/student-profile", {
      method: "PUT",
      body: JSON.stringify({ profile: collectProfile() }),
    }),
    requestJson(`/api/plans/${currentPlan.id}`, {
      method: "PUT",
      body: JSON.stringify({ draft: collectPlanDraft() }),
    }),
  ]);
  currentProfileUpdatedAt = profileData.updatedAt;
  currentPlan = planData.plan;
  plans = plans.map((plan) => (plan.id === currentPlan.id ? currentPlan : plan));
  workspaceDirty = false;
  removeUserDraft(localStorage, currentUser.id);
  renderProfileSummary();
  renderPlanList();
}

async function loadWorkspace() {
  setWorkspaceStatus("正在加载");
  const [profileData, planData] = await Promise.all([
    requestJson("/api/student-profile", { method: "GET" }),
    requestJson("/api/plans", { method: "GET" }),
  ]);
  plans = planData.plans || [];
  currentPlan = (await requestJson(`/api/plans/${plans[0].id}`, { method: "GET" })).plan;
  const localDraft = currentUser ? readUserDraft(localStorage, currentUser.id) : "";
  let migrated = false;

  if (!profileData.updatedAt && isPlanDraftEmpty(currentPlan.draft) && localDraft) {
    try {
      const draft = stripSensitiveDraftFields(JSON.parse(localDraft));
      applyProfile(draft.profile || {});
      applyPlanDraft(draft);
      await persistCurrentWorkspace();
      migrated = true;
      setWorkspaceStatus("已恢复原有内容");
    } catch {
      setWorkspaceStatus("原有内容恢复失败，未覆盖当前数据", true);
    }
  }

  if (!migrated) {
    currentProfileUpdatedAt = profileData.updatedAt;
    applyProfile(profileData.profile);
    applyPlanDraft(currentPlan.draft);
    setWorkspaceStatus("内容已加载");
  }
  workspaceDirty = false;
  renderProfileSummary();
  renderPlanList();
  await loadSnapshots();
}

async function createPlan() {
  const name = window.prompt("请输入新方案名称：");
  if (name === null) return;
  if (workspaceDirty) {
    if (!window.confirm("当前内容还没有保存，新建方案会放弃这些修改。继续吗？")) return;
    const profileData = await requestJson("/api/student-profile", { method: "GET" });
    currentProfileUpdatedAt = profileData.updatedAt;
    applyProfile(profileData.profile);
    renderProfileSummary();
  }
  const data = await requestJson("/api/plans", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  plans = [data.plan, ...plans];
  currentPlan = data.plan;
  applyPlanDraft(currentPlan.draft);
  workspaceDirty = false;
  renderPlanList();
  await loadSnapshots();
  setWorkspaceStatus("新方案已创建");
}

async function renameCurrentPlan() {
  if (!currentPlan) return;
  const name = window.prompt("请输入方案新名称：", currentPlan.name);
  if (name === null) return;
  const data = await requestJson(`/api/plans/${currentPlan.id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  currentPlan = data.plan;
  plans = plans.map((plan) => (plan.id === currentPlan.id ? currentPlan : plan));
  renderPlanList();
  setWorkspaceStatus("方案名称已更新");
}

async function deleteCurrentPlan() {
  if (!currentPlan || !window.confirm(`确认删除“${currentPlan.name}”及其所有历史备份吗？`)) return;
  await requestJson(`/api/plans/${currentPlan.id}`, { method: "DELETE" });
  const data = await requestJson("/api/plans", { method: "GET" });
  plans = data.plans || [];
  currentPlan = null;
  workspaceDirty = false;
  await openPlan(plans[0].id);
  setWorkspaceStatus("方案已删除");
}

async function createCurrentSnapshot() {
  if (!currentPlan) return;
  await saveDraft();
  const note = normalizeSnapshotNote(snapshotNote.value);
  await requestJson(`/api/plans/${currentPlan.id}/snapshots`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  snapshotNote.value = "";
  await loadSnapshots();
  setWorkspaceStatus("备份已保存");
}

async function restoreCurrentSnapshot(snapshotId) {
  if (!currentPlan || !window.confirm("恢复这份备份会覆盖当前学生信息和方案内容。继续吗？")) return;
  const data = await requestJson(
    `/api/plans/${currentPlan.id}/snapshots/${snapshotId}/restore`,
    { method: "POST", body: "{}" },
  );
  currentProfileUpdatedAt = data.profile.updatedAt;
  applyProfile(data.profile.profile);
  currentPlan = data.plan;
  applyPlanDraft(currentPlan.draft);
  workspaceDirty = false;
  renderProfileSummary();
  renderPlanList();
  saveStatus.textContent = "已恢复备份";
  setWorkspaceStatus("备份已恢复");
}

async function deleteCurrentSnapshot(snapshotId) {
  if (!currentPlan || !window.confirm("确认删除这份历史备份吗？删除后无法恢复。")) return;
  await requestJson(`/api/plans/${currentPlan.id}/snapshots/${snapshotId}`, {
    method: "DELETE",
  });
  await loadSnapshots();
  setWorkspaceStatus("备份已删除");
}

async function checkPrompt() {
  if (window.location.protocol === "file:") {
    const availability = getAgentAvailability({
      protocol: window.location.protocol,
      promptLoaded: false,
    });
    promptStatus.textContent = availability.message;
    agentStatus.textContent = availability.message;
    agentStatus.classList.add("error");
    rawAnswer.value = availability.message;
    updateDeepSeekAvailability(false);
    return;
  }

  try {
    const response = await fetch("/api/prompt");
    if (!response.ok) throw new Error("prompt unavailable");
    const data = await response.json();
    fixedPrompt = data.prompt || "";
    serverHasDeepSeekApiKey = Boolean(data.hasDeepSeekApiKey);
    const availability = updateAgentAvailability(Boolean(data.prompt));
    if (!availability.canGenerate) rawAnswer.value = availability.message;
  } catch {
    serverHasDeepSeekApiKey = false;
    const availability = getAgentAvailability({
      protocol: window.location.protocol,
      promptLoaded: false,
    });
    promptStatus.textContent = availability.message;
    agentStatus.textContent = availability.message;
    agentStatus.classList.add("error");
    rawAnswer.value = availability.message;
    updateDeepSeekAvailability(false);
  }
}

function buildCodexTask() {
  trackUsageEvent("build_codex_task");
  if (!fixedPrompt) {
    agentStatus.textContent = "固定提示词尚未加载，无法生成任务包。";
    agentStatus.classList.add("error");
    return;
  }

  codexTaskPackage.value = buildCodexTaskPackage({
    fixedPrompt,
    profile: collectPlanningProfile(),
    activities: collectActivities(),
  });
  agentStatus.textContent = "任务包已生成，可复制给 DeepSeek、ChatGPT 或其他 AI 对话。";
  agentStatus.classList.remove("error");
}

async function generateDeepSeekPlan() {
  const availability = updateDeepSeekAvailability(Boolean(fixedPrompt));
  if (!availability?.canGenerate) return;

  generateDeepSeekButton.disabled = true;
  deepSeekStatus.textContent = "DeepSeek 正在生成规划回答...";
  deepSeekStatus.classList.remove("error");
  const startedAt = performance.now();

  try {
    const data = await requestJson("/api/deepseek-plan", {
      method: "POST",
      body: JSON.stringify({
        profile: collectPlanningProfile(),
        activities: collectActivities(),
      }),
    });

    rawAnswer.value = data.answer || "";
    codexAnswerInput.value = data.answer || "";
    fillActivities(data.parsed?.activities || []);
    narrativeOutput.value = data.parsed?.narrative || "";
    renderParseDiagnostics(parseDiagnostics, data.parsed?.diagnostics);
    renderStudentDependentRecommendations();
    deepSeekStatus.textContent = `DeepSeek 已生成，并写入 ${data.parsed?.activities?.length || 0} 项活动`;
    agentStatus.textContent = deepSeekStatus.textContent;
    agentStatus.classList.remove("error");
    trackUsageEvent("generate_deepseek_plan_success", {
      metrics: {
        generatedActivityCount: data.parsed?.activities?.length || 0,
        durationMs: performance.now() - startedAt,
      },
    });
    await saveDraft();
  } catch (error) {
    deepSeekStatus.textContent = error.message;
    deepSeekStatus.classList.add("error");
    agentStatus.textContent = error.message;
    agentStatus.classList.add("error");
    trackUsageEvent("generate_deepseek_plan_failure", {
      metrics: { durationMs: performance.now() - startedAt },
      details: { failureReason: error.message },
    });
  } finally {
    const availability = getDeepSeekGenerationAvailability({
      protocol: window.location.protocol,
      promptLoaded: Boolean(fixedPrompt),
      hasServerApiKey: serverHasDeepSeekApiKey,
    });
    generateDeepSeekButton.disabled = !availability.canGenerate;
  }
}

async function copyCodexTask() {
  trackUsageEvent("copy_codex_task");
  if (!codexTaskPackage.value) buildCodexTask();
  await navigator.clipboard.writeText(codexTaskPackage.value);
  agentStatus.textContent = "任务包已复制。";
  agentStatus.classList.remove("error");
}

async function parseCodexAnswer() {
  const parsed = parseAgentOutput(codexAnswerInput.value);
  renderParseDiagnostics(parseDiagnostics, parsed.diagnostics);
  trackUsageEvent("parse_codex_answer", {
    metrics: { generatedActivityCount: parsed.activities?.length || 0 },
    details: {
      parseStrategy: parsed.diagnostics?.strategy || "none",
      narrativeFound: Boolean(parsed.diagnostics?.narrativeFound),
    },
  });
  if (!parsed.activities?.length) {
    agentStatus.textContent = buildParseFailureMessage(parsed.diagnostics);
    agentStatus.classList.add("error");
    return;
  }
  rawAnswer.value = codexAnswerInput.value;
  fillActivities(parsed.activities || []);
  narrativeOutput.value = parsed.narrative || "";
  renderStudentDependentRecommendations();
  agentStatus.textContent = `已解析 AI 回答，并填入 ${parsed.activities?.length || 0} 项活动`;
  agentStatus.classList.remove("error");
  await saveDraft();
}

async function saveDraft() {
  if (!currentUser) return;
  trackUsageEvent("save_draft");
  await persistCurrentWorkspace();
  saveStatus.textContent = `已保存 ${new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  setWorkspaceStatus("当前内容已保存");
}

function exportDraft() {
  trackUsageEvent("export_json", {
    metrics: { filledActivityCount: countFilledActivities() },
  });
  const blob = new Blob([JSON.stringify(collectDraft(), null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "美本申请顾问-活动规划.json";
  link.click();
  URL.revokeObjectURL(url);
}

function exportWordDocument() {
  trackUsageEvent("export_word", {
    metrics: { filledActivityCount: countFilledActivities() },
    details: {
      hasCompetitions: latestCompetitionRecommendations.length > 0,
      hasSummerSchools: latestSummerSchoolRecommendations.length > 0,
      hasRecommendationLetters: latestRecommendationLetterStrategy.items?.length > 0,
      hasCaseMatches: latestCaseMatches.length > 0,
    },
  });
  renderCompetitionRecommendations();
  renderSummerSchoolRecommendations();
  renderRecommendationLetterStrategy();
  renderCaseMatches();
  const html = buildWordDocument({
    profile: collectProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
    competitionRecommendations: latestCompetitionRecommendations,
    summerSchoolRecommendations: latestSummerSchoolRecommendations,
    recommendationLetterStrategy: latestRecommendationLetterStrategy,
    caseMatches: latestCaseMatches,
  });
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "美本申请顾问-活动规划.doc";
  link.click();
  URL.revokeObjectURL(url);
}

async function resetDraft() {
  trackUsageEvent("clear_draft");
  clearVisibleDraft();
  renderProfileSummary();
  workspaceDirty = true;
  await saveDraft();
  saveStatus.textContent = "已清空";
}

function clearVisibleDraft() {
  clearDraftFields({
    profileForm,
    activityTable,
    rawAnswer,
    narrativeOutput,
    codexTaskPackage,
    codexAnswerInput,
    snapshotNote,
  });
  renderStudentDependentRecommendations();
}

saveButton.addEventListener("click", () => runWorkspaceAction(saveDraft));
exportButton.addEventListener("click", exportDraft);
exportWordButton.addEventListener("click", exportWordDocument);
resetButton.addEventListener("click", () => runWorkspaceAction(resetDraft));
generateDeepSeekButton?.addEventListener("click", () => runWorkspaceAction(generateDeepSeekPlan));
buildCodexTaskButton.addEventListener("click", buildCodexTask);
copyCodexTaskButton.addEventListener("click", copyCodexTask);
parseCodexAnswerButton.addEventListener("click", () => runWorkspaceAction(parseCodexAnswer));
refreshCompetitionsButton?.addEventListener("click", () => {
  trackUsageEvent("refresh_competitions", {
    metrics: { generatedActivityCount: latestCompetitionRecommendations.length },
  });
  renderCompetitionRecommendations({ refresh: true });
});
refreshSummerSchoolsButton?.addEventListener("click", () => {
  trackUsageEvent("refresh_summer_schools", {
    metrics: { generatedActivityCount: latestSummerSchoolRecommendations.length },
  });
  renderSummerSchoolRecommendations({ refresh: true });
});
refreshCaseMatchesButton?.addEventListener("click", () => {
  trackUsageEvent("refresh_case_matches", {
    metrics: { generatedActivityCount: latestCaseMatches.length },
    details: { currentCaseRank: caseMatchBatchIndex + 1 },
  });
  renderCaseMatches({ refresh: true });
});
function isWorkspaceDataInput(event) {
  const target = event.target;
  return appShell.contains(target) && target !== snapshotNote;
}

document.addEventListener("input", (event) => {
  if (!isWorkspaceDataInput(event)) return;
  renderStudentDependentRecommendations();
});

document.addEventListener("input", (event) => {
  if (!isWorkspaceDataInput(event)) return;
  workspaceDirty = true;
  saveStatus.textContent = "有未保存修改";
  renderProfileSummary();
});

authForm.addEventListener("submit", submitAuthForm);
heroStartButton?.addEventListener("click", () => {
  setAuthMode("register");
  authNameInput.focus();
});
authModeButton.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});
forgotPasswordButton.addEventListener("click", () => setAuthMode("forgot"));
logoutButton.addEventListener("click", logout);

newPlanButton?.addEventListener("click", () => runWorkspaceAction(createPlan));
renamePlanButton?.addEventListener("click", () => runWorkspaceAction(renameCurrentPlan));
deletePlanButton?.addEventListener("click", () => runWorkspaceAction(deleteCurrentPlan));
createSnapshotButton?.addEventListener("click", () => runWorkspaceAction(createCurrentSnapshot));
planList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-id]");
  if (button) runWorkspaceAction(() => openPlan(Number(button.dataset.planId)));
});
snapshotList?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-snapshot-id]");
  if (deleteButton) {
    runWorkspaceAction(() => deleteCurrentSnapshot(Number(deleteButton.dataset.deleteSnapshotId)));
    return;
  }
  const restoreButton = event.target.closest("[data-snapshot-id]");
  if (restoreButton) {
    runWorkspaceAction(() => restoreCurrentSnapshot(Number(restoreButton.dataset.snapshotId)));
  }
});

async function runWorkspaceAction(action) {
  try {
    await action();
  } catch (error) {
    setWorkspaceStatus(error.message, true);
  }
}

async function initializeApp(user) {
  const changedUser = currentUser?.id !== user.id;
  currentUser = user;

  if (changedUser) {
    removeLegacySharedDraft(localStorage);
    clearVisibleDraft();
    await loadWorkspace();
  }

  if (appInitialized) return;
  appInitialized = true;
  if (!changedUser) await loadWorkspace();
  loadCompetitions();
  loadSummerSchools();
  loadAdmissionCases();
  checkPrompt();
}

if (initialResetToken) {
  setAuthMode("reset");
  showAuthView();
} else {
  setAuthMode(getSafeNextPath() ? "login" : "register");
  loadCurrentUser();
}
