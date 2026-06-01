import { escapeHtml } from "./html-utils.mjs";

const schoolSelectionForm = document.querySelector("#schoolSelectionForm");
const selectionNationality = document.querySelector("#selectionNationality");
const selectionHighSchoolRegion = document.querySelector("#selectionHighSchoolRegion");
const selectionTargetMajor = document.querySelector("#selectionTargetMajor");
const selectionBudgetSensitivity = document.querySelector("#selectionBudgetSensitivity");
const selectionRegionPreference = document.querySelector("#selectionRegionPreference");
const selectionCampusSetting = document.querySelector("#selectionCampusSetting");
const selectionSchoolSize = document.querySelector("#selectionSchoolSize");
const selectionEdRiskTolerance = document.querySelector("#selectionEdRiskTolerance");
const selectionScholarshipNeed = document.querySelector("#selectionScholarshipNeed");
const selectionStrategyMode = document.querySelector("#selectionStrategyMode");
const selectionPreferences = document.querySelector("#selectionPreferences");
const generateSchoolSelectionButton = document.querySelector("#generateSchoolSelectionButton");
const saveSchoolSelectionButton = document.querySelector("#saveSchoolSelectionButton");
const exportSchoolSelectionButton = document.querySelector("#exportSchoolSelectionButton");
const schoolSelectionStatus = document.querySelector("#schoolSelectionStatus");
const schoolSelectionResults = document.querySelector("#schoolSelectionResults");
const schoolSelectionVersionList = document.querySelector("#schoolSelectionVersionList");
const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";

const ROUND_CONFIG = [
  { key: "reaEd1", label: "REA / ED1", count: "二选一，1所" },
  { key: "ed2", label: "ED2", count: "1所" },
  { key: "ea", label: "EA", count: "3-5所" },
  { key: "rd", label: "RD", count: "8-12所" },
  { key: "uc", label: "UC", count: "6所" },
];

let currentSelection = null;

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
        targetMajor: selectionTargetMajor.value.trim(),
        budgetSensitivity: selectionBudgetSensitivity.value.trim(),
        regionPreference: selectionRegionPreference.value.trim(),
        campusSetting: selectionCampusSetting.value.trim(),
        schoolSize: selectionSchoolSize.value.trim(),
        edRiskTolerance: selectionEdRiskTolerance.value.trim(),
        scholarshipNeed: selectionScholarshipNeed.value.trim(),
        strategyMode: selectionStrategyMode.value.trim(),
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
  currentSelection = normalizeSelectionForEditor(selection);
  const rounds = selection.rounds || {};
  schoolSelectionResults.innerHTML = `
    ${selection.summary ? `<div class="school-selection-summary">${escapeHtml(selection.summary)}</div>` : ""}
    ${renderStrategySummary(selection.strategy || {})}
    ${ROUND_CONFIG.map((round) => renderRound(round, rounds)).join("")}
    ${renderNextActions(selection.nextActions || [])}
  `;
  if (saveSchoolSelectionButton) saveSchoolSelectionButton.disabled = false;
  if (exportSchoolSelectionButton) exportSchoolSelectionButton.disabled = false;
}

function renderStrategySummary(strategy = {}) {
  const items = [
    ["earlyStrategy", "早申策略", strategy.earlyStrategy],
    ["ucStrategy", "UC 策略", strategy.ucStrategy],
    ["rdStrategy", "RD 策略", strategy.rdStrategy],
  ];
  return `
    <section class="school-selection-strategy" aria-label="申请策略摘要">
      <h3>申请策略摘要</h3>
      <div class="school-selection-strategy-grid">
        ${items
          .map(
            ([key, label, value]) => `
              <label>
                <span>${escapeHtml(label)}</span>
                <textarea data-selection-strategy="${escapeHtml(key)}">${escapeHtml(value || "")}</textarea>
              </label>`,
          )
          .join("")}
      </div>
    </section>`;
}

function renderRound(round, rounds) {
  const entries = round.key === "reaEd1"
    ? [
        ...(rounds.rea || []).map((entry) => ({ ...entry, roundKey: "rea", roundLabel: "REA" })),
        ...(rounds.ed1 || []).map((entry) => ({ ...entry, roundKey: "ed1", roundLabel: "ED1" })),
      ]
    : (rounds[round.key] || []).map((entry) => ({ ...entry, roundKey: round.key, roundLabel: round.label }));
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
    <article class="school-selection-card" data-selection-school-card data-selection-round="${escapeHtml(entry.roundKey || "")}">
      <div class="school-selection-card-heading">
        <span>${escapeHtml(entry.roundLabel || "")}</span>
        <label>
          <span>学校</span>
          <input data-selection-field="school" value="${escapeHtml(entry.school || "")}" placeholder="未命名学校" />
        </label>
      </div>
      <div class="school-selection-card-fields">
        <label>
          <span>专业方向</span>
          <input data-selection-field="major" value="${escapeHtml(entry.major || "")}" placeholder="待确认" />
        </label>
        <label>
          <span>风险等级</span>
          <select data-selection-field="riskLevel">
            ${renderRiskOptions(entry.riskLevel)}
          </select>
        </label>
      </div>
      <label>
        <span>匹配理由</span>
        <textarea data-selection-field="matchReason">${escapeHtml(entry.matchReason || "")}</textarea>
      </label>
      <label>
        <span>补强/核验</span>
        <textarea data-selection-field="gaps">${escapeHtml((entry.gaps || []).join("\n"))}</textarea>
      </label>
      <label>
        <span>下一步行动</span>
        <input data-selection-field="nextAction" value="${escapeHtml(entry.nextAction || "")}" placeholder="核验官网并补充材料。" />
      </label>
    </article>`;
}

function renderRiskOptions(value) {
  return [
    ["high", "冲刺"],
    ["medium", "匹配"],
    ["low", "稳妥"],
  ]
    .map(([key, label]) =>
      `<option value="${key}" ${String(value || "").toLowerCase() === key ? "selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderNextActions(actions) {
  if (!actions.length) return "";
  return `
    <section class="school-selection-next-actions" aria-label="全局下一步">
      <h3>下一步行动</h3>
      <textarea data-selection-next-actions>${escapeHtml(actions.join("\n"))}</textarea>
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

function collectEditedSelection() {
  const rounds = Object.fromEntries(["rea", "ed1", "ed2", "ea", "rd", "uc"].map((key) => [key, []]));
  schoolSelectionResults
    ?.querySelectorAll("[data-selection-school-card]")
    .forEach((card) => {
      const round = card.dataset.selectionRound;
      if (!round || !rounds[round]) return;
      const school = getSelectionFieldValue(card, "school");
      if (!school) return;
      rounds[round].push({
        school,
        major: getSelectionFieldValue(card, "major"),
        riskLevel: getSelectionFieldValue(card, "riskLevel") || "medium",
        matchReason: getSelectionFieldValue(card, "matchReason"),
        gaps: splitLines(getSelectionFieldValue(card, "gaps")).slice(0, 6),
        nextAction: getSelectionFieldValue(card, "nextAction"),
      });
    });

  return {
    summary: currentSelection?.summary || "",
    strategy: collectEditedStrategy(),
    rounds,
    nextActions: splitLines(
      schoolSelectionResults?.querySelector("[data-selection-next-actions]")?.value || "",
    ).slice(0, 8),
  };
}

function collectEditedStrategy() {
  const strategy = {
    earlyStrategy: "",
    ucStrategy: "",
    rdStrategy: "",
  };
  schoolSelectionResults
    ?.querySelectorAll("[data-selection-strategy]")
    .forEach((field) => {
      strategy[field.dataset.selectionStrategy] = field.value.trim();
    });
  return strategy;
}

function getSelectionFieldValue(card, field) {
  return card.querySelector(`[data-selection-field="${field}"]`)?.value.trim() || "";
}

async function saveSchoolSelectionToPortfolio() {
  if (!currentSelection) {
    setStatus("请先生成选校方案。", true);
    return;
  }
  setSaveWorking(true);
  try {
    const selection = collectEditedSelection();
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    const version = buildSchoolSelectionVersion(selection);
    const saved = await requestJson(MY_ACTIVITIES_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify({
        ...portfolio,
        applicationPlan: buildApplicationPlan(selection),
        schoolSelectionVersions: saveSchoolSelectionVersion(
          portfolio.schoolSelectionVersions || [],
          version,
        ),
        planningActions: mergePortfolioItems(
          portfolio.planningActions || [],
          buildPlanningActions(selection),
          "text",
        ),
        deepSeekNotes: mergePortfolioItems(
          portfolio.deepSeekNotes || [],
          [buildStrategyNote(selection)],
          "content",
        ),
      }),
    });
    currentSelection = selection;
    renderSchoolSelectionVersions(saved.schoolSelectionVersions || []);
    setStatus(`已保存到我的申请档案：${countApplicationPlanSchools(saved.applicationPlan)} 所`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setSaveWorking(false);
  }
}

function saveSchoolSelectionVersion(existingVersions, version) {
  const versions = [
    version,
    ...existingVersions.filter((item) => item.versionName !== version.versionName),
  ];
  return versions.slice(0, 12);
}

function buildSchoolSelectionVersion(selection) {
  return {
    versionName: selectionStrategyMode?.value || "均衡版",
    summary: selection.summary || buildStrategyNote(selection).content,
    selectionJson: JSON.stringify(selection),
    source: "美本选校系统",
  };
}

function exportSchoolSelection() {
  if (!currentSelection) {
    setStatus("请先生成选校方案。", true);
    return;
  }
  const selection = collectEditedSelection();
  downloadTextFile(
    `school-selection-${selectionStrategyMode?.value || "均衡版"}-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(selection, null, 2),
    "application/json;charset=utf-8",
  );
  setStatus("选校结果已导出");
}

async function loadSchoolSelectionVersions() {
  try {
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    renderSchoolSelectionVersions(portfolio.schoolSelectionVersions || []);
  } catch {
    renderSchoolSelectionVersions([]);
  }
}

function renderSchoolSelectionVersions(versions = []) {
  if (!schoolSelectionVersionList) return;
  if (!versions.length) {
    schoolSelectionVersionList.innerHTML = '<p class="portfolio-empty">保存选校版本后会显示在这里。</p>';
    return;
  }
  schoolSelectionVersionList.innerHTML = versions
    .map((version) => `
      <article class="school-selection-version-card">
        <strong>${escapeHtml(version.versionName || "选校版本")}</strong>
        <p>${escapeHtml(version.summary || "暂无摘要")}</p>
        <small>${escapeHtml(version.source || "美本选校系统")}</small>
      </article>`)
    .join("");
}

function buildApplicationPlan(selection) {
  return Object.fromEntries(
    Object.entries(selection.rounds).map(([round, entries]) => [
      round,
      entries.map((entry) => ({ school: entry.school, major: entry.major })),
    ]),
  );
}

function buildPlanningActions(selection) {
  const schoolActions = Object.entries(selection.rounds).flatMap(([round, entries]) =>
    entries
      .map((entry) => entry.nextAction && `${round.toUpperCase()} ${entry.school}：${entry.nextAction}`)
      .filter(Boolean),
  );
  return [...selection.nextActions, ...schoolActions].slice(0, 12).map((text) => ({
    text,
    source: "美本选校系统",
  }));
}

function buildStrategyNote(selection) {
  return {
    title: "选校策略摘要",
    content: [
      selection.summary,
      selection.strategy.earlyStrategy && `早申策略：${selection.strategy.earlyStrategy}`,
      selection.strategy.ucStrategy && `UC 策略：${selection.strategy.ucStrategy}`,
      selection.strategy.rdStrategy && `RD 策略：${selection.strategy.rdStrategy}`,
    ].filter(Boolean).join("\n"),
    source: "美本选校系统",
  };
}

function mergePortfolioItems(existingItems, newItems, key) {
  const seen = new Set();
  return [...existingItems, ...newItems]
    .filter((item) => {
      const value = String(item?.[key] || "").trim().toLowerCase();
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(-20);
}

function normalizeSelectionForEditor(selection = {}) {
  return {
    summary: String(selection.summary || "").trim(),
    strategy: selection.strategy || {},
    rounds: selection.rounds || {},
    nextActions: selection.nextActions || [],
  };
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function countApplicationPlanSchools(applicationPlan = {}) {
  return Object.values(applicationPlan).reduce(
    (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
    0,
  );
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  if (saveSchoolSelectionButton) {
    saveSchoolSelectionButton.disabled = isWorking || !currentSelection;
  }
  if (exportSchoolSelectionButton) {
    exportSchoolSelectionButton.disabled = isWorking || !currentSelection;
  }
}

function setSaveWorking(isWorking) {
  if (!saveSchoolSelectionButton) return;
  saveSchoolSelectionButton.disabled = isWorking;
  saveSchoolSelectionButton.textContent = isWorking ? "保存中..." : "保存到我的申请档案";
  saveSchoolSelectionButton.setAttribute("aria-busy", isWorking ? "true" : "false");
}

function setStatus(message, isError = false) {
  if (!schoolSelectionStatus) return;
  schoolSelectionStatus.textContent = message;
  schoolSelectionStatus.classList.toggle("error", isError);
}

schoolSelectionForm?.addEventListener("submit", generateSchoolSelection);
saveSchoolSelectionButton?.addEventListener("click", saveSchoolSelectionToPortfolio);
exportSchoolSelectionButton?.addEventListener("click", exportSchoolSelection);
loadSchoolSelectionVersions();
