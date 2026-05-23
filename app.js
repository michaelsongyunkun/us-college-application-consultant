import { getAgentAvailability } from "./ui-state.mjs";
import { clearDraftFields } from "./draft-state.mjs";
import { buildFutureLearningDirection } from "./learning-direction.mjs";
import { buildCodexTaskPackage } from "./codex-mode.mjs";
import { parseAgentOutput } from "./agent-output-parser.mjs";
import {
  buildStudentCaseProfile,
  matchAdmissionCases,
  parseAdmissionCasesMarkdown,
} from "./admission-case-matcher.mjs";
import {
  buildCompetitionStudentProfile,
  parseCompetitionsMarkdown,
  recommendCompetitions,
} from "./competition-recommender.mjs";
import {
  buildSummerSchoolStudentProfile,
  parseSummerSchoolsMarkdown,
  recommendSummerSchools,
} from "./summer-school-recommender.mjs";
import { buildRecommendationLetterStrategy } from "./recommendation-letter-recommender.mjs";
import { buildWordDocument } from "./word-export.mjs";
import { renderMarkdown } from "./markdown-renderer.mjs";

const STORAGE_KEY = "us-college-application-consultant-draft";

const profileForm = document.querySelector("#profileForm");
const activityTable = document.querySelector("#activityTable");
const saveButton = document.querySelector("#saveButton");
const exportButton = document.querySelector("#exportButton");
const exportWordButton = document.querySelector("#exportWordButton");
const resetButton = document.querySelector("#resetButton");
const generateButton = document.querySelector("#generateButton");
const saveStatus = document.querySelector("#saveStatus");
const agentStatus = document.querySelector("#agentStatus");
const promptStatus = document.querySelector("#promptStatus");
const apiKeyInput = document.querySelector("#apiKeyInput");
const rawAnswer = document.querySelector("#rawAnswer");
const narrativeOutput = document.querySelector("#narrativeOutput");
const futureLearningOutput = document.querySelector("#futureLearningOutput");
const buildCodexTaskButton = document.querySelector("#buildCodexTaskButton");
const copyCodexTaskButton = document.querySelector("#copyCodexTaskButton");
const parseCodexAnswerButton = document.querySelector("#parseCodexAnswerButton");
const codexTaskPackage = document.querySelector("#codexTaskPackage");
const codexAnswerInput = document.querySelector("#codexAnswerInput");
const caseMatchStatus = document.querySelector("#caseMatchStatus");
const caseMatchNotice = document.querySelector("#caseMatchNotice");
const caseMatchList = document.querySelector("#caseMatchList");
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

let serverHasApiKey = false;
let fixedPrompt = "";
let admissionCases = [];
let latestCaseMatches = [];
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

function collectProfile() {
  return Object.fromEntries(new FormData(profileForm).entries());
}

function collectActivities() {
  return Array.from(activityTable.querySelectorAll("tbody tr")).map((row, index) => ({
    id: index + 1,
    type: row.querySelector(`[name="type-${index + 1}"]`).value,
    activityName: row.querySelector(`[name="name-${index + 1}"]`).value,
    executionDescription: row.querySelector(`[name="description-${index + 1}"]`).value,
    suggestedGrade: row.querySelector(`[name="grade-${index + 1}"]`).value,
  }));
}

function collectDraft() {
  return {
    profile: collectProfile(),
    activities: collectActivities(),
    rawAnswer: rawAnswer.value,
    narrative: narrativeOutput.value,
    futureLearningDirection: futureLearningOutput?.value || "",
    competitionRecommendations: latestCompetitionRecommendations,
    summerSchoolRecommendations: latestSummerSchoolRecommendations,
    recommendationLetterStrategy: latestRecommendationLetterStrategy,
    caseMatches: latestCaseMatches,
    updatedAt: new Date().toISOString(),
  };
}

function collectGenerationPayload() {
  return {
    ...collectDraft(),
    apiKey: apiKeyInput.value.trim(),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildCurrentStudentCaseProfile() {
  return buildStudentCaseProfile({
    profile: collectProfile(),
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

function updateFutureLearningDirection() {
  if (!futureLearningOutput) return;
  futureLearningOutput.value = buildFutureLearningDirection({
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

function hasMarkdownSyntax(value) {
  return /(^|\n)\s*(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s+)|(\*\*[^*]+\*\*)|(__[^_]+__)|(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/m.test(
    String(value ?? ""),
  );
}

function updateActivityMarkdownPreviews() {
  activityTable.querySelectorAll("tbody tr").forEach((row, index) => {
    const textarea = row.querySelector(`[name="description-${index + 1}"]`);
    if (!textarea) return;

    let preview = row.querySelector(".markdown-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "markdown-preview";
      preview.setAttribute("aria-label", "具体执行描述预览");
      textarea.insertAdjacentElement("afterend", preview);
    }

    const rendered = renderMarkdown(textarea.value);
    preview.innerHTML = rendered;
    preview.hidden = !rendered || !hasMarkdownSyntax(textarea.value);
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
    profile: collectProfile(),
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

function renderCaseMatches() {
  if (!caseMatchList || !caseMatchNotice || !caseMatchStatus) return;

  if (!admissionCases.length) {
    latestCaseMatches = [];
    caseMatchStatus.textContent = "案例库为空";
    caseMatchNotice.textContent =
      "当前案例库暂未找到合适案例，建议后续补充更多录取案例数据后再生成匹配结果。";
    caseMatchList.innerHTML = "";
    return;
  }

  latestCaseMatches = matchAdmissionCases({
    studentProfile: buildCurrentStudentCaseProfile(),
    cases: admissionCases,
    limit: 1,
  });

  caseMatchStatus.textContent = `已载入 ${admissionCases.length} 个案例`;

  if (!latestCaseMatches.length) {
    caseMatchNotice.textContent =
      "当前案例库暂未找到合适案例，建议后续补充更多录取案例数据后再生成匹配结果。";
    caseMatchList.innerHTML = "";
    return;
  }

  const hasHighMatch = latestCaseMatches.some((match) => match.strength === "high");
  caseMatchNotice.textContent = hasHighMatch
    ? "以下为当前案例库中专业方向和背景最接近的一个录取案例。"
    : "以下为当前案例库中专业方向接近、但整体相似度仍需谨慎参考的一个案例。";

  caseMatchList.innerHTML = latestCaseMatches
    .map((match, index) => {
      const admissionCase = match.case;
      const score = Math.round(match.score * 100);
      return `
        <article class="case-card">
          <div class="case-card__header">
            <div>
              <p class="case-index">案例 ${index + 1}</p>
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
  updateActivityMarkdownPreviews();
  updateFutureLearningDirection();
  previousCompetitionBatchIds = [];
  competitionBatchIndex = 0;
  previousSummerSchoolBatchIds = [];
  seenSummerSchoolIds = [];
  summerSchoolBatchIndex = 0;
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
    summerSchools = [];
    renderSummerSchoolRecommendations();
  }
}

function updateAgentAvailability(promptLoaded = true) {
  const availability = getAgentAvailability({
    protocol: window.location.protocol,
    promptLoaded,
    hasApiKey: serverHasApiKey || Boolean(apiKeyInput.value.trim()),
  });

  promptStatus.textContent = availability.message;
  agentStatus.textContent = availability.canGenerate ? "等待生成" : availability.message;
  agentStatus.classList.toggle("error", !availability.canGenerate);
  generateButton.disabled = !availability.canGenerate;
  return availability;
}

function setFieldValue(name, value) {
  const field = document.querySelector(`[name="${name}"]`);
  if (field) field.value = value || "";
}

function fillActivities(activities) {
  activities.slice(0, 10).forEach((activity, index) => {
    const rowNumber = index + 1;
    setFieldValue(`type-${rowNumber}`, activity.type);
    setFieldValue(`name-${rowNumber}`, activity.activityName);
    setFieldValue(`description-${rowNumber}`, activity.executionDescription);
    setFieldValue(`grade-${rowNumber}`, activity.suggestedGrade);
  });
  updateActivityMarkdownPreviews();
}

function restoreDraft() {
  const rawDraft = localStorage.getItem(STORAGE_KEY);
  if (!rawDraft) return;

  try {
    const draft = JSON.parse(rawDraft);
    Object.entries(draft.profile || {}).forEach(([name, value]) => setFieldValue(name, value));
    fillActivities(draft.activities || []);
    rawAnswer.value = draft.rawAnswer || "";
    narrativeOutput.value = draft.narrative || "";
    if (futureLearningOutput) {
      futureLearningOutput.value =
        draft.futureLearningDirection ||
        buildFutureLearningDirection({
          profile: collectProfile(),
          activities: collectActivities(),
          narrative: narrativeOutput.value,
        });
    }
    saveStatus.textContent = "已恢复本地草稿";
  } catch {
    saveStatus.textContent = "草稿读取失败";
  }
}

async function checkPrompt() {
  if (window.location.protocol === "file:") {
    const availability = getAgentAvailability({
      protocol: window.location.protocol,
      promptLoaded: false,
      hasApiKey: false,
    });
    promptStatus.textContent = availability.message;
    agentStatus.textContent = availability.message;
    agentStatus.classList.add("error");
    rawAnswer.value = availability.message;
    generateButton.disabled = true;
    return;
  }

  try {
    const response = await fetch("/api/prompt");
    if (!response.ok) throw new Error("prompt unavailable");
    const data = await response.json();
    fixedPrompt = data.prompt || "";
    serverHasApiKey = Boolean(data.hasApiKey);
    const availability = updateAgentAvailability(Boolean(data.prompt));
    if (!availability.canGenerate) rawAnswer.value = availability.message;
  } catch {
    const availability = getAgentAvailability({
      protocol: window.location.protocol,
      promptLoaded: false,
      hasApiKey: false,
    });
    promptStatus.textContent = availability.message;
    agentStatus.textContent = availability.message;
    agentStatus.classList.add("error");
    rawAnswer.value = availability.message;
    generateButton.disabled = true;
  }
}

function buildCodexTask() {
  if (!fixedPrompt) {
    agentStatus.textContent = "固定提示词尚未加载，无法生成 Codex 任务包。";
    agentStatus.classList.add("error");
    return;
  }

  codexTaskPackage.value = buildCodexTaskPackage({
    fixedPrompt,
    profile: collectProfile(),
    activities: collectActivities(),
  });
  agentStatus.textContent = "Codex 任务包已生成，可复制给当前 Codex 对话。";
  agentStatus.classList.remove("error");
}

async function copyCodexTask() {
  if (!codexTaskPackage.value) buildCodexTask();
  await navigator.clipboard.writeText(codexTaskPackage.value);
  agentStatus.textContent = "Codex 任务包已复制。";
  agentStatus.classList.remove("error");
}

function parseCodexAnswer() {
  const parsed = parseAgentOutput(codexAnswerInput.value);
  rawAnswer.value = codexAnswerInput.value;
  fillActivities(parsed.activities || []);
  narrativeOutput.value = parsed.narrative || "";
  renderStudentDependentRecommendations();
  agentStatus.textContent = `已解析 Codex 回答，并填入 ${parsed.activities?.length || 0} 项活动`;
  agentStatus.classList.remove("error");
  saveDraft();
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectDraft(), null, 2));
  saveStatus.textContent = `已保存 ${new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function exportDraft() {
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
  renderCompetitionRecommendations();
  renderSummerSchoolRecommendations();
  renderRecommendationLetterStrategy();
  renderCaseMatches();
  const html = buildWordDocument({
    profile: collectProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
    futureLearningDirection: futureLearningOutput?.value || "",
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

function resetDraft() {
  clearDraftFields({
    profileForm,
    activityTable,
    rawAnswer,
    narrativeOutput,
    futureLearningOutput,
    codexTaskPackage,
    codexAnswerInput,
  });
  renderStudentDependentRecommendations();
  localStorage.removeItem(STORAGE_KEY);
  saveStatus.textContent = "已清空";
}

async function generatePlan() {
  generateButton.disabled = true;
  agentStatus.textContent = "Agent 正在根据固定提示词生成规划回答...";

  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectGenerationPayload()),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Agent 调用失败");
    }

    rawAnswer.value = data.answer || "";
    fillActivities(data.parsed?.activities || []);
    narrativeOutput.value = data.parsed?.narrative || "";
    renderStudentDependentRecommendations();
    agentStatus.textContent = `已生成，并填入 ${data.parsed?.activities?.length || 0} 项活动`;
    saveDraft();
  } catch (error) {
    agentStatus.textContent = error.message;
    agentStatus.classList.add("error");
    rawAnswer.value = error.message;
  } finally {
    if (window.location.protocol !== "file:") generateButton.disabled = false;
  }
}

saveButton.addEventListener("click", saveDraft);
exportButton.addEventListener("click", exportDraft);
exportWordButton.addEventListener("click", exportWordDocument);
resetButton.addEventListener("click", resetDraft);
generateButton.addEventListener("click", generatePlan);
buildCodexTaskButton.addEventListener("click", buildCodexTask);
copyCodexTaskButton.addEventListener("click", copyCodexTask);
parseCodexAnswerButton.addEventListener("click", parseCodexAnswer);
refreshCompetitionsButton?.addEventListener("click", () => {
  renderCompetitionRecommendations({ refresh: true });
});
refreshSummerSchoolsButton?.addEventListener("click", () => {
  renderSummerSchoolRecommendations({ refresh: true });
});
document.addEventListener("input", renderStudentDependentRecommendations);

document.addEventListener("input", () => {
  saveStatus.textContent = "有未保存修改";
});

apiKeyInput.addEventListener("input", () => {
  updateAgentAvailability();
});

restoreDraft();
renderStudentDependentRecommendations();
loadCompetitions();
loadSummerSchools();
loadAdmissionCases();
checkPrompt();
