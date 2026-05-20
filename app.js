import { getAgentAvailability } from "./ui-state.mjs";
import { buildCodexTaskPackage } from "./codex-mode.mjs";
import { parseAgentOutput } from "./agent-output-parser.mjs";
import { buildWordDocument } from "./word-export.mjs";

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
const buildCodexTaskButton = document.querySelector("#buildCodexTaskButton");
const copyCodexTaskButton = document.querySelector("#copyCodexTaskButton");
const parseCodexAnswerButton = document.querySelector("#parseCodexAnswerButton");
const codexTaskPackage = document.querySelector("#codexTaskPackage");
const codexAnswerInput = document.querySelector("#codexAnswerInput");

let serverHasApiKey = false;
let fixedPrompt = "";

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
    updatedAt: new Date().toISOString(),
  };
}

function collectGenerationPayload() {
  return {
    ...collectDraft(),
    apiKey: apiKeyInput.value.trim(),
  };
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
  const html = buildWordDocument({
    profile: collectProfile(),
    activities: collectActivities(),
    narrative: narrativeOutput.value,
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
  profileForm.reset();
  activityTable.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  rawAnswer.value = "";
  narrativeOutput.value = "";
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

document.addEventListener("input", () => {
  saveStatus.textContent = "有未保存修改";
});

apiKeyInput.addEventListener("input", () => {
  updateAgentAvailability();
});

restoreDraft();
checkPrompt();
