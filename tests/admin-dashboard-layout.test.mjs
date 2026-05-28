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
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing focused dashboard element #${id}`);
}

for (const tab of ["behavior", "users", "security"]) {
  assert.match(html, new RegExp(`data-admin-tab=["']${tab}["']`), `Missing ${tab} dashboard tab`);
}

assert.doesNotMatch(
  html.match(/id="dashboardFilters"[\s\S]*?<\/form>/)?.[0] || "",
  /name="status"/,
  "Login status should not be presented as a global dashboard filter.",
);
assert.match(script, /dashboard\.overview/, "Summary cards should render server-computed operational totals.");
assert.match(script, /refresh_case_matches/, "Dashboard should label similar-case refresh events.");
assert.match(script, /data-admin-tab/, "Dashboard script should activate focused tab panels.");
assert.match(script, /<details class="technical-details">/, "Low-frequency browser and IP data should be expandable.");
assert.match(styles, /\.admin-tabs/, "Tabbed dashboard navigation should be styled.");
assert.match(styles, /\.admin-toolbar/, "Global dashboard filters should be styled as a toolbar.");
