import { escapeHtml } from "./html-utils.mjs";

const STRATEGY_LABELS = {
  table: "Markdown / 表格",
  "plain-text-table": "纯文本表格",
  "numbered-blocks": "编号段落",
  none: "未识别",
};

export function buildParseFailureMessage(diagnostics = {}) {
  const firstIssue = diagnostics.issues?.[0] || "未识别到活动表格。";
  const firstSuggestion =
    diagnostics.suggestions?.[0] || "请粘贴包含序号、活动类型、活动名称、具体执行描述、建议年级的完整回答。";
  return `${firstIssue}${firstSuggestion ? ` ${firstSuggestion}` : ""}`;
}

export function renderParseDiagnostics(container, diagnostics = {}) {
  if (!container) return;

  const activityCount = diagnostics.activityCount || 0;
  const issues = diagnostics.issues || [];
  const suggestions = diagnostics.suggestions || [];
  const evidence = diagnostics.evidence || {};
  const isSuccessful = activityCount > 0;
  container.hidden = false;
  container.classList.remove("is-hidden");
  container.classList.toggle("has-error", !isSuccessful);
  container.classList.toggle("is-success", isSuccessful);
  container.innerHTML = `
    <div class="parse-diagnostics__header">
      <div>
        <h3>解析诊断</h3>
        <p>${escapeHtml(
          isSuccessful
            ? `已通过${STRATEGY_LABELS[diagnostics.strategy] || "未知方式"}识别 ${activityCount} 项活动。`
            : "系统没有找到可稳定填入表格的活动行。",
        )}</p>
      </div>
      <span>${escapeHtml(diagnostics.narrativeFound ? "已识别叙事解读" : "未识别叙事解读")}</span>
    </div>
    <div class="parse-diagnostics__metrics" aria-label="解析证据">
      <div><span>非空行</span><strong>${escapeHtml(diagnostics.nonEmptyLineCount || 0)}</strong></div>
      <div><span>候选表格行</span><strong>${escapeHtml(evidence.candidatePipeRows || 0)}</strong></div>
      <div><span>候选纯文本行</span><strong>${escapeHtml(evidence.candidatePlainTextRows || 0)}</strong></div>
      <div><span>候选编号段落</span><strong>${escapeHtml(evidence.candidateNumberedBlocks || 0)}</strong></div>
    </div>
    ${renderList("发现的问题", issues)}
    ${renderList("建议操作", suggestions)}
  `;
}

function renderList(title, items) {
  if (!items?.length) return "";
  return `
    <section class="parse-diagnostics__list">
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>`;
}
