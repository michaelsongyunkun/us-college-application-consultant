import { analyzeActivityQuality } from "../domain/activity-quality-checker.mjs";
import { escapeHtml } from "./html-utils.mjs";

export function renderActivityQualityPanel({ elements, profile, activities }) {
  if (!elements.status || !elements.score || !elements.summary) return;

  const result = analyzeActivityQuality({ profile, activities });
  const metricItems = [
    ["完整活动", `${result.metrics.completedCount}/10`],
    ["数字证据", result.metrics.quantifiedCount],
    ["影响表达", result.metrics.impactCount],
    ["领导力线索", result.metrics.leadershipCount],
    ["专业连接", result.metrics.majorFitCount],
  ];

  elements.status.textContent = result.statusLabel;
  elements.score.textContent = result.score ? String(result.score) : "--";
  elements.summary.textContent = result.summary;
  if (elements.metrics) {
    elements.metrics.innerHTML = metricItems
      .map(
        ([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>`,
      )
      .join("");
  }
  if (elements.strengths) {
    elements.strengths.innerHTML = result.strengths
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }
  if (elements.issues) {
    elements.issues.innerHTML = result.issues
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }
  if (elements.activityNotes) {
    elements.activityNotes.innerHTML = result.activityNotes.length
      ? result.activityNotes
          .map(
            (item) => `
              <div class="activity-quality-note">
                <strong>第 ${escapeHtml(item.id)} 项：${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.notes.join("；"))}</span>
              </div>`,
          )
          .join("")
      : '<p class="activity-quality-empty">暂无逐项提醒。</p>';
  }
}
