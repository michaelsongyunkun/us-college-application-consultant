import { escapeHtml } from "./html-utils.mjs";
import { getRequestErrorMessage } from "./auth-client-errors.mjs";

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
const exportSchoolSelectionSvgButton = document.querySelector("#exportSchoolSelectionSvgButton");
const exportSchoolSelectionWordButton = document.querySelector("#exportSchoolSelectionWordButton");
const schoolSelectionStatus = document.querySelector("#schoolSelectionStatus");
const schoolSelectionResults = document.querySelector("#schoolSelectionResults");
const schoolSelectionVersionList = document.querySelector("#schoolSelectionVersionList");
const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";
const SCHOOL_SELECTION_JOB_ENDPOINT = "/api/school-selection-jobs";
const SCHOOL_SELECTION_JOB_POLL_INTERVAL_MS = 3000;
const SCHOOL_SELECTION_JOB_TIMEOUT_MS = 6 * 60 * 1000;

const ROUND_CONFIG = [
  { key: "reaEd1", label: "REA / ED1", count: "二选一，1所" },
  { key: "ed2", label: "ED2", count: "1所" },
  { key: "ea", label: "EA", count: "3-5所" },
  { key: "rd", label: "RD", count: "8-12所" },
  { key: "uc", label: "UC", count: "6所" },
];

const EXPORT_ROUND_CONFIG = [
  { key: "rea", label: "REA" },
  { key: "ed1", label: "ED1" },
  { key: "ed2", label: "ED2" },
  { key: "ea", label: "EA" },
  { key: "rd", label: "RD" },
  { key: "uc", label: "UC" },
];

let currentSelection = null;
let schoolSelectionVersions = [];

function collectSchoolSelectionAnalyticsProfile() {
  return {
    grade: "",
    majorDirection: selectionTargetMajor?.value.trim() || "",
  };
}

function countCompletedSelectionFields() {
  return [
    selectionNationality,
    selectionHighSchoolRegion,
    selectionTargetMajor,
    selectionBudgetSensitivity,
    selectionRegionPreference,
    selectionCampusSetting,
    selectionSchoolSize,
    selectionEdRiskTolerance,
    selectionScholarshipNeed,
    selectionStrategyMode,
    selectionPreferences,
  ].filter((field) => String(field?.value || "").trim()).length;
}

function trackSchoolSelectionUsageEvent(eventType, { metrics = {}, details = {} } = {}) {
  fetch("/api/analytics/usage-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      profile: collectSchoolSelectionAnalyticsProfile(),
      metrics: {
        completionFields: countCompletedSelectionFields(),
        generatedActivityCount: currentSelection ? countApplicationPlanSchools(currentSelection.rounds) : 0,
        ...metrics,
      },
      details: {
        source: "school_selection",
        nationality: selectionNationality?.value.trim() || "",
        highSchoolRegion: selectionHighSchoolRegion?.value.trim() || "",
        strategyMode: selectionStrategyMode?.value || "",
        ...details,
      },
    }),
  }).catch(() => {});
}

async function generateSchoolSelection(event) {
  event.preventDefault();
  setStatus("DeepSeek 正在生成选校方案，大约需要 2 分钟，请保持页面打开。");
  setWorking(true);
  const startedAt = performance.now();
  try {
    const payload = {
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
    };
    const job = await requestJson(SCHOOL_SELECTION_JOB_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus("生成任务已提交，DeepSeek 正在后台生成选校方案。");
    const result = await waitForSchoolSelectionJob(job.jobId);
    renderSchoolSelectionResults(result.selection);
    trackSchoolSelectionUsageEvent("school_selection_generate_success", {
      metrics: {
        generatedActivityCount: countApplicationPlanSchools(result.selection?.rounds || {}),
        durationMs: performance.now() - startedAt,
      },
    });
    setStatus("选校方案已生成");
  } catch (error) {
    trackSchoolSelectionUsageEvent("school_selection_generate_failure", {
      metrics: { generatedActivityCount: 0, durationMs: performance.now() - startedAt },
      details: { failureReason: error.message },
    });
    setStatus(error.message, true);
  } finally {
    setWorking(false);
  }
}

async function waitForSchoolSelectionJob(jobId) {
  if (!jobId) throw new Error("选校生成任务创建失败，请刷新页面后重试。");
  const deadline = performance.now() + SCHOOL_SELECTION_JOB_TIMEOUT_MS;
  let consecutivePollFailures = 0;

  while (performance.now() < deadline) {
    let job;
    try {
      job = await requestJson(`${SCHOOL_SELECTION_JOB_ENDPOINT}/${encodeURIComponent(jobId)}`, {
        method: "GET",
      });
      consecutivePollFailures = 0;
    } catch (error) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 3) throw error;
      setStatus("正在重新连接选校生成任务，请保持页面打开。");
      await delay(SCHOOL_SELECTION_JOB_POLL_INTERVAL_MS);
      continue;
    }

    if (job.status === "completed") {
      if (!job.result?.selection) throw new Error("选校方案结果为空，请重新生成。");
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "选校方案生成失败，请稍后重试。");
    }
    setStatus("DeepSeek 仍在后台生成选校方案，请保持页面打开。");
    await delay(SCHOOL_SELECTION_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("选校方案生成耗时过长，请刷新页面后重新生成。");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (exportSchoolSelectionSvgButton) exportSchoolSelectionSvgButton.disabled = false;
  if (exportSchoolSelectionWordButton) exportSchoolSelectionWordButton.disabled = false;
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
        <label class="school-selection-major-field">
          <span>专业方向</span>
          <input data-selection-field="major" value="${escapeHtml(entry.major || "")}" placeholder="待确认" />
        </label>
        <label class="school-selection-risk-field">
          <span>风险等级</span>
          <select data-selection-field="riskLevel">
            ${renderRiskOptions(entry.riskLevel)}
          </select>
        </label>
        <label class="school-selection-probability-field">
          <span>录取概率区间</span>
          <input
            data-selection-field="admissionProbability"
            value="${escapeHtml(getAdmissionProbabilityLabel(entry.admissionProbability))}"
            placeholder="例：8%-12%"
          />
        </label>
      </div>
      <p class="school-selection-probability-note">录取概率区间为系统估算，非录取承诺。</p>
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
        admissionProbability: getSelectionFieldValue(card, "admissionProbability") || "待估算",
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
        applicationPlan: buildApplicationPlan(selection, portfolio.applicationPlan),
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
    trackSchoolSelectionUsageEvent("school_selection_save", {
      metrics: { generatedActivityCount: countApplicationPlanSchools(selection.rounds) },
    });
    setStatus(`已保存为选校版本，并同步到我的申请档案：${countApplicationPlanSchools(saved.applicationPlan)} 所`);
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

async function deleteSchoolSelectionVersion(versionIndex) {
  const index = Number(versionIndex);
  if (!Number.isInteger(index) || index < 0) return;
  const version = schoolSelectionVersions[index];
  if (!version) return;
  const versionName = version.versionName || "这个选校版本";
  if (!window.confirm(`确认删除“${versionName}”吗？删除后不会影响当前正在编辑的选校结果。`)) return;

  setStatus("正在删除选校版本...");
  try {
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    const nextVersions = (portfolio.schoolSelectionVersions || []).filter((_, itemIndex) => itemIndex !== index);
    const saved = await requestJson(MY_ACTIVITIES_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify({
        ...portfolio,
        schoolSelectionVersions: nextVersions,
      }),
    });
    renderSchoolSelectionVersions(saved.schoolSelectionVersions || []);
    setStatus("选校版本已删除");
  } catch (error) {
    setStatus(error.message, true);
  }
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

function exportSchoolSelectionSvg() {
  const selection = getCurrentSelectionForExport();
  if (!selection) return;
  trackSchoolSelectionUsageEvent("school_selection_export_svg", {
    metrics: { generatedActivityCount: countApplicationPlanSchools(selection.rounds) },
    details: { format: "svg" },
  });
  downloadTextFile(
    `${getSchoolSelectionExportBaseName()}.svg`,
    buildSchoolSelectionSvgDocument(selection),
    "image/svg+xml;charset=utf-8",
  );
  setStatus("选校 SVG 已导出。");
}

function exportSchoolSelectionWord() {
  const selection = getCurrentSelectionForExport();
  if (!selection) return;
  trackSchoolSelectionUsageEvent("school_selection_export_word", {
    metrics: { generatedActivityCount: countApplicationPlanSchools(selection.rounds) },
    details: { format: "word" },
  });
  downloadTextFile(
    `${getSchoolSelectionExportBaseName()}.doc`,
    buildSchoolSelectionWordDocument(selection),
    "application/msword;charset=utf-8",
  );
  setStatus("选校 Word 文档已导出。");
}

function getCurrentSelectionForExport() {
  if (!currentSelection) {
    setStatus("请先生成选校方案。", true);
    return null;
  }
  return collectEditedSelection();
}

function getSchoolSelectionExportBaseName() {
  const versionName = String(selectionStrategyMode?.value || "均衡版").replace(/[\\/:*?"<>|]/g, "-");
  return `美本选校方案-${versionName}-${new Date().toISOString().slice(0, 10)}`;
}

function buildSchoolSelectionSvgDocument(selection) {
  const rows = buildSchoolSelectionExportRows(selection);
  const textRows = [];
  for (const row of rows) {
    for (const text of wrapExportText(row.text, row.maxLength || 42)) {
      textRows.push({ ...row, text });
    }
  }
  const height = Math.max(900, 96 + textRows.length * 30);
  const textElements = textRows
    .map((row, index) => {
      const y = 76 + index * 30;
      const x = 64 + (row.indent || 0);
      return `<text x="${x}" y="${y}" class="${escapeXml(row.variant || "body")}">${escapeXml(row.text)}</text>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
  <rect width="1200" height="${height}" fill="#fffdf7"/>
  <rect x="40" y="32" width="1120" height="${height - 64}" rx="18" fill="#ffffff" stroke="#e8e2d8"/>
  <style>
    text { font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; fill: #1f2933; }
    .title { font-size: 30px; font-weight: 800; fill: #1f4f3a; }
    .meta { font-size: 14px; fill: #6b7280; }
    .section { font-size: 20px; font-weight: 800; fill: #a86400; }
    .school { font-size: 17px; font-weight: 700; fill: #1f4f3a; }
    .body { font-size: 15px; fill: #344054; }
    .muted { font-size: 14px; fill: #6b7280; }
  </style>
  ${textElements}
</svg>`;
}

function buildSchoolSelectionWordDocument(selection) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(getSchoolSelectionExportBaseName())}</title>
    <style>
      body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #1f2933; line-height: 1.55; }
      h1 { color: #1f4f3a; }
      h2 { margin-top: 24px; color: #a86400; border-bottom: 1px solid #e8e2d8; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #d9d2c8; padding: 8px; vertical-align: top; }
      th { background: #faf8f2; color: #1f4f3a; text-align: left; }
      .meta { color: #6b7280; }
      .summary { background: #fff8e8; border: 1px solid #f1dfb8; padding: 12px; }
    </style>
  </head>
  <body>
    <h1>美本选校方案</h1>
    <p class="meta">策略版本：${escapeHtml(selectionStrategyMode?.value || "均衡版")}｜导出时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</p>
    ${selection.summary ? `<p class="summary">${formatWordText(selection.summary)}</p>` : ""}
    ${renderSchoolSelectionWordStrategy(selection.strategy || {})}
    ${EXPORT_ROUND_CONFIG.map((round) => renderSchoolSelectionWordRound(round, selection.rounds?.[round.key] || [])).join("")}
    ${renderSchoolSelectionWordNextActions(selection.nextActions || [])}
  </body>
</html>`;
}

function buildSchoolSelectionExportRows(selection) {
  const rows = [
    { text: "美本选校方案", variant: "title", maxLength: 28 },
    {
      text: `策略版本：${selectionStrategyMode?.value || "均衡版"}｜导出时间：${new Date().toLocaleString("zh-CN")}`,
      variant: "meta",
      maxLength: 52,
    },
  ];
  if (selection.summary) rows.push({ text: `方案摘要：${selection.summary}`, variant: "body", maxLength: 48 });

  const strategyItems = [
    ["早申策略", selection.strategy?.earlyStrategy],
    ["UC 策略", selection.strategy?.ucStrategy],
    ["RD 策略", selection.strategy?.rdStrategy],
  ].filter(([, value]) => value);
  if (strategyItems.length) {
    rows.push({ text: "申请策略摘要", variant: "section", maxLength: 34 });
    for (const [label, value] of strategyItems) {
      rows.push({ text: `${label}：${value}`, variant: "body", indent: 20, maxLength: 48 });
    }
  }

  for (const round of EXPORT_ROUND_CONFIG) {
    const entries = selection.rounds?.[round.key] || [];
    rows.push({ text: round.label, variant: "section", maxLength: 34 });
    if (!entries.length) {
      rows.push({ text: "暂无学校", variant: "muted", indent: 20, maxLength: 44 });
      continue;
    }
    entries.forEach((entry, index) => {
      rows.push({
        text: `${index + 1}. ${entry.school || "未命名学校"}｜${entry.major || "专业待确认"}｜${getRiskLabel(entry.riskLevel)}｜录取概率区间：${getAdmissionProbabilityLabel(entry.admissionProbability)}`,
        variant: "school",
        indent: 20,
        maxLength: 50,
      });
      if (entry.matchReason) rows.push({ text: `匹配理由：${entry.matchReason}`, variant: "body", indent: 40, maxLength: 48 });
      if (entry.gaps?.length) rows.push({ text: `补强/核验：${entry.gaps.join("；")}`, variant: "body", indent: 40, maxLength: 48 });
      if (entry.nextAction) rows.push({ text: `下一步：${entry.nextAction}`, variant: "body", indent: 40, maxLength: 48 });
    });
  }

  if (selection.nextActions?.length) {
    rows.push({ text: "全局下一步行动", variant: "section", maxLength: 34 });
    selection.nextActions.forEach((action, index) => {
      rows.push({ text: `${index + 1}. ${action}`, variant: "body", indent: 20, maxLength: 48 });
    });
  }
  return rows;
}

function renderSchoolSelectionWordStrategy(strategy) {
  const items = [
    ["早申策略", strategy.earlyStrategy],
    ["UC 策略", strategy.ucStrategy],
    ["RD 策略", strategy.rdStrategy],
  ].filter(([, value]) => value);
  if (!items.length) return "";
  return `
    <h2>申请策略摘要</h2>
    <table>
      <tbody>
        ${items.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${formatWordText(value)}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function renderSchoolSelectionWordRound(round, entries) {
  return `
    <h2>${escapeHtml(round.label)}</h2>
    ${
      entries.length
        ? `<table>
            <thead>
              <tr>
                <th>学校</th>
                <th>专业方向</th>
                <th>风险等级</th>
                <th>录取概率区间</th>
                <th>匹配理由</th>
                <th>补强/核验</th>
                <th>下一步行动</th>
              </tr>
            </thead>
            <tbody>
              ${entries
                .map(
                  (entry) => `
                    <tr>
                      <td>${escapeHtml(entry.school || "未命名学校")}</td>
                      <td>${escapeHtml(entry.major || "专业待确认")}</td>
                      <td>${escapeHtml(getRiskLabel(entry.riskLevel))}</td>
                      <td>${escapeHtml(getAdmissionProbabilityLabel(entry.admissionProbability))}<br><span class="meta">系统估算，非录取承诺</span></td>
                      <td>${formatWordText(entry.matchReason || "")}</td>
                      <td>${formatWordText((entry.gaps || []).join("\n"))}</td>
                      <td>${formatWordText(entry.nextAction || "")}</td>
                    </tr>`,
                )
                .join("")}
            </tbody>
          </table>`
        : '<p class="meta">暂无学校。</p>'
    }`;
}

function renderSchoolSelectionWordNextActions(actions) {
  if (!actions.length) return "";
  return `
    <h2>全局下一步行动</h2>
    <ol>${actions.map((action) => `<li>${formatWordText(action)}</li>`).join("")}</ol>`;
}

function wrapExportText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [""];
  const lines = [];
  for (let index = 0; index < text.length; index += maxLength) {
    lines.push(text.slice(index, index + maxLength));
  }
  return lines;
}

function formatWordText(value) {
  return escapeHtml(value || "").replace(/\r?\n/g, "<br>");
}

function getRiskLabel(value) {
  return {
    high: "冲刺",
    medium: "匹配",
    low: "稳妥",
  }[String(value || "").toLowerCase()] || "匹配";
}

function getAdmissionProbabilityLabel(value) {
  return String(value || "").trim() || "待估算";
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
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
  schoolSelectionVersions = versions;
  if (!versions.length) {
    schoolSelectionVersionList.innerHTML = '<p class="portfolio-empty">保存选校版本后会显示在这里。</p>';
    return;
  }
  schoolSelectionVersionList.innerHTML = versions
    .map((version, index) => `
      <article class="school-selection-version-card">
        <strong>${escapeHtml(version.versionName || "选校版本")}</strong>
        <p>${escapeHtml(version.summary || "暂无摘要")}</p>
        <div class="snapshot-actions">
          <small>${escapeHtml(version.source || "美本选校系统")}</small>
          <button type="button" class="danger" data-delete-school-selection-version="${index}">删除版本</button>
        </div>
      </article>`)
    .join("");
}

function buildApplicationPlan(selection, existingPlan = {}) {
  const generatedPlan = Object.fromEntries(
    Object.entries(selection.rounds).map(([round, entries]) => [
      round,
      entries.map((entry) => ({ school: entry.school, major: entry.major })),
    ]),
  );
  return {
    ...generatedPlan,
    multiCountry: Array.isArray(existingPlan?.multiCountry) ? existingPlan.multiCountry : [],
  };
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
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(getRequestErrorMessage(error));
  }
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
  generateSchoolSelectionButton.textContent = isWorking ? "DeepSeek 生成中，约 2 分钟..." : "用 DeepSeek 生成选校方案";
  generateSchoolSelectionButton.setAttribute("aria-busy", isWorking ? "true" : "false");
  if (saveSchoolSelectionButton) {
    saveSchoolSelectionButton.disabled = isWorking || !currentSelection;
  }
  if (exportSchoolSelectionSvgButton) {
    exportSchoolSelectionSvgButton.disabled = isWorking || !currentSelection;
  }
  if (exportSchoolSelectionWordButton) {
    exportSchoolSelectionWordButton.disabled = isWorking || !currentSelection;
  }
}

function setSaveWorking(isWorking) {
  if (!saveSchoolSelectionButton) return;
  saveSchoolSelectionButton.disabled = isWorking;
  saveSchoolSelectionButton.textContent = isWorking ? "保存中..." : "保存为选校版本";
  saveSchoolSelectionButton.setAttribute("aria-busy", isWorking ? "true" : "false");
}

function setStatus(message, isError = false) {
  if (!schoolSelectionStatus) return;
  schoolSelectionStatus.textContent = message;
  schoolSelectionStatus.classList.toggle("error", isError);
}

schoolSelectionForm?.addEventListener("submit", generateSchoolSelection);
saveSchoolSelectionButton?.addEventListener("click", saveSchoolSelectionToPortfolio);
exportSchoolSelectionSvgButton?.addEventListener("click", exportSchoolSelectionSvg);
exportSchoolSelectionWordButton?.addEventListener("click", exportSchoolSelectionWord);
schoolSelectionVersionList?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-school-selection-version]");
  if (!deleteButton) return;
  deleteSchoolSelectionVersion(deleteButton.dataset.deleteSchoolSelectionVersion);
});
loadSchoolSelectionVersions();
