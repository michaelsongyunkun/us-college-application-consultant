import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/client/admin-dashboard.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

for (const id of [
  "metricActiveUsers",
  "metricPlanGenerations",
  "metricWordExports",
  "metricRecommendationRefreshes",
  "metricFailedLogins",
  "filterEventType",
  "securityStatusFilter",
  "behaviorPanel",
  "usersPanel",
  "securityPanel",
  "feedbackPanel",
  "feedbackEntriesBody",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing focused dashboard element #${id}`);
}

for (const tab of ["behavior", "users", "security", "feedback"]) {
  assert.match(html, new RegExp(`data-admin-tab=["']${tab}["']`), `Missing ${tab} dashboard tab`);
}

assert.doesNotMatch(
  html.match(/id="dashboardFilters"[\s\S]*?<\/form>/)?.[0] || "",
  /name="status"/,
  "Login status should not be presented as a global dashboard filter.",
);
assert.match(script, /dashboard\.overview/, "Summary cards should render server-computed operational totals.");
assert.match(html, /解析 Codex 回答进表格/, "Overview metric should use the clearer Codex parsing label.");
assert.doesNotMatch(html, /规划生成/, "Admin dashboard should not show the old planning-generation label.");
assert.match(script, /generate_plan_success: "解析 Codex 回答进表格成功"/, "Usage event label should match the updated dashboard wording.");
assert.doesNotMatch(script, /规划生成/, "Dashboard script should not show the old planning-generation label.");
assert.match(script, /refresh_case_matches/, "Dashboard should label similar-case refresh events.");
assert.match(script, /renderFeedbackEntries/, "Dashboard should render submitted feedback entries.");
assert.match(script, /feedbackEntries/, "Dashboard should read feedback entries from the admin payload.");
assert.match(html, /处理状态/, "Feedback table should expose an admin handling status column.");
assert.match(html, /处理备注/, "Feedback table should expose admin notes.");
assert.match(script, /feedbackStatusOptions/, "Dashboard should render feedback status options.");
assert.match(script, /data-feedback-status/, "Dashboard should mark feedback status controls.");
assert.match(script, /saveFeedbackStatus/, "Dashboard should save feedback status changes.");
assert.match(script, /\/api\/admin\/feedback\/\$\{feedbackId\}/, "Dashboard should call the feedback status API.");
assert.match(script, /data-admin-tab/, "Dashboard script should activate focused tab panels.");
assert.match(script, /<details class="technical-details">/, "Low-frequency browser and IP data should be expandable.");
assert.match(styles, /\.admin-tabs/, "Tabbed dashboard navigation should be styled.");
assert.match(styles, /\.admin-toolbar/, "Global dashboard filters should be styled as a toolbar.");
