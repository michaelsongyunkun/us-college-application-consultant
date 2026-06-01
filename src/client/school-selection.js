import { escapeHtml } from "./html-utils.mjs";

const schoolSelectionForm = document.querySelector("#schoolSelectionForm");
const selectionNationality = document.querySelector("#selectionNationality");
const selectionHighSchoolRegion = document.querySelector("#selectionHighSchoolRegion");
const selectionPreferences = document.querySelector("#selectionPreferences");
const generateSchoolSelectionButton = document.querySelector("#generateSchoolSelectionButton");
const schoolSelectionStatus = document.querySelector("#schoolSelectionStatus");
const schoolSelectionResults = document.querySelector("#schoolSelectionResults");

const ROUND_CONFIG = [
  { key: "reaEd1", label: "REA / ED1", count: "二选一，1所" },
  { key: "ed2", label: "ED2", count: "1所" },
  { key: "ea", label: "EA", count: "3-5所" },
  { key: "rd", label: "RD", count: "8-12所" },
  { key: "uc", label: "UC", count: "6所" },
];

async function generateSchoolSelection(event) {
  event.preventDefault();
  setStatus("DeepSeek 正在生成选校方案...");
  setWorking(true);
  try {
    const data = await requestJson("/api/school-selection", {
      method: "POST",
      body: JSON.stringify({
        nationality: selectionNationality.value.trim(),
        highSchoolRegion: selectionHighSchoolRegion.value.trim(),
        preferences: selectionPreferences.value.trim(),
      }),
    });
    renderSchoolSelectionResults(data.selection);
    setStatus("选校方案已生成");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setWorking(false);
  }
}

export function renderSchoolSelectionResults(selection = {}) {
  if (!schoolSelectionResults) return;
  const rounds = selection.rounds || {};
  schoolSelectionResults.innerHTML = `
    ${selection.summary ? `<div class="school-selection-summary">${escapeHtml(selection.summary)}</div>` : ""}
    ${ROUND_CONFIG.map((round) => renderRound(round, rounds)).join("")}
    ${renderNextActions(selection.nextActions || [])}
  `;
}

function renderRound(round, rounds) {
  const entries = round.key === "reaEd1"
    ? [
        ...(rounds.rea || []).map((entry) => ({ ...entry, roundLabel: "REA" })),
        ...(rounds.ed1 || []).map((entry) => ({ ...entry, roundLabel: "ED1" })),
      ]
    : (rounds[round.key] || []).map((entry) => ({ ...entry, roundLabel: round.label }));
  return `
    <section class="school-selection-round" aria-label="${escapeHtml(round.label)}">
      <div class="school-selection-round-heading">
        <h3>${escapeHtml(round.label)}</h3>
        <span>${escapeHtml(round.count)}</span>
      </div>
      <div class="school-selection-card-grid">
        ${
          entries.length
            ? entries.map(renderSchoolCard).join("")
            : '<p class="portfolio-empty">暂无学校。</p>'
        }
      </div>
    </section>`;
}

function renderSchoolCard(entry) {
  return `
    <article class="school-selection-card">
      <div class="school-selection-card-heading">
        <span>${escapeHtml(entry.roundLabel || "")}</span>
        <strong>${escapeHtml(entry.school || "未命名学校")}</strong>
      </div>
      <dl>
        <div><dt>专业方向</dt><dd>${escapeHtml(entry.major || "待确认")}</dd></div>
        <div><dt>风险等级</dt><dd>${escapeHtml(renderRisk(entry.riskLevel))}</dd></div>
      </dl>
      <p>${escapeHtml(entry.matchReason || "暂无匹配理由。")}</p>
      ${renderList("补强/核验", entry.gaps || [])}
      <p class="school-selection-next"><strong>下一步：</strong>${escapeHtml(entry.nextAction || "核验官网并补充材料。")}</p>
    </article>`;
}

function renderNextActions(actions) {
  if (!actions.length) return "";
  return `
    <section class="school-selection-next-actions" aria-label="全局下一步">
      <h3>下一步行动</h3>
      <ul>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
    </section>`;
}

function renderList(label, items) {
  if (!items.length) return "";
  return `
    <div class="school-selection-gap-list">
      <strong>${escapeHtml(label)}</strong>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
}

function renderRisk(value) {
  return {
    high: "冲刺",
    medium: "匹配",
    low: "稳妥",
  }[String(value || "").toLowerCase()] || "匹配";
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

function setWorking(isWorking) {
  if (!generateSchoolSelectionButton) return;
  generateSchoolSelectionButton.disabled = isWorking;
  generateSchoolSelectionButton.textContent = isWorking ? "DeepSeek 生成中..." : "用 DeepSeek 生成选校方案";
  generateSchoolSelectionButton.setAttribute("aria-busy", isWorking ? "true" : "false");
}

function setStatus(message, isError = false) {
  if (!schoolSelectionStatus) return;
  schoolSelectionStatus.textContent = message;
  schoolSelectionStatus.classList.toggle("error", isError);
}

schoolSelectionForm?.addEventListener("submit", generateSchoolSelection);
