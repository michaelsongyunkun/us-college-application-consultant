import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appPages = [
  "index.html",
  "my-activities.html",
  "school-selection.html",
  "ask-deepseek.html",
  "resource-library.html",
  "school-encyclopedia.html",
  "course-helper.html",
  "gpa-calculator.html",
  "disclaimer.html",
  "feedback.html",
  "contact.html",
];

for (const page of appPages) {
  const html = readFileSync(page, "utf8");
  const navigation = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(
    navigation.includes('href="./school-selection.html"'),
    `${page} sidebar should include the school selection entry.`,
  );
  assert.ok(
    navigation.indexOf("my-activities.html") < navigation.indexOf("school-selection.html")
      && navigation.indexOf("school-selection.html") < navigation.indexOf("ask-deepseek.html"),
    `${page} sidebar should place school selection between portfolio and Ask DeepSeek.`,
  );
}

const pageHtml = readFileSync("school-selection.html", "utf8");
const script = readFileSync("src/client/school-selection.js", "utf8");
const styles = readFileSync("styles.css", "utf8");

for (const expected of [
  "美本选校系统",
  "用户国籍",
  "用户高中地区",
  "REA / ED1",
  "ED2",
  "EA",
  "RD",
  "UC",
  'id="schoolSelectionForm"',
  'id="selectionNationality"',
  'id="selectionHighSchoolRegion"',
  'id="selectionPreferences"',
  'id="generateSchoolSelectionButton"',
  'id="schoolSelectionStatus"',
  'id="schoolSelectionResults"',
  "./assets/logo-mark.svg",
  "./styles.css?v=20260601-school-selection-layout",
  "./src/client/school-selection.js?v=20260601-school-selection",
]) {
  assert.ok(pageHtml.includes(expected), `School selection page should include ${expected}.`);
}

assert.ok(script.includes('"/api/school-selection"'), "School selection page should call the dedicated API.");
assert.ok(script.includes("renderSchoolSelectionResults"), "School selection page should render grouped results.");
assert.ok(script.includes("selectionNationality"), "School selection page should read nationality.");
assert.ok(script.includes("selectionHighSchoolRegion"), "School selection page should read high school region.");
assert.ok(script.includes("REA / ED1"), "School selection page should label the mutually exclusive early bucket.");
assert.ok(script.includes("3-5所"), "School selection page should explain the EA count range.");
assert.ok(script.includes("8-12所"), "School selection page should explain the RD count range.");
assert.doesNotMatch(script, /deepSeekApiKey/i, "School selection should not expose a user DeepSeek API key field.");

for (const selector of [
  ".school-selection-shell",
  ".school-selection-form",
  ".school-selection-results",
  ".school-selection-round",
  ".school-selection-card",
]) {
  assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing style ${selector}`);
}

assert.match(
  styles,
  /\.school-selection-panel\s+\.section-heading\s*,\s*\.school-selection-results-panel\s+\.section-heading\s*\{[\s\S]*?border-bottom:\s*1px solid/,
  "School selection panels should separate headers from content without causing text to touch card edges.",
);
assert.match(
  styles,
  /\.school-selection-form\s*\{[\s\S]*?padding:\s*24px 30px 30px;/,
  "School selection form should have dedicated inner padding.",
);
assert.match(
  styles,
  /\.school-selection-form\s+label\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*8px;/,
  "School selection labels should have a tidy stacked layout.",
);
assert.match(
  styles,
  /\.school-selection-results\s*\{[\s\S]*?padding:\s*24px 30px 30px;/,
  "School selection results should have dedicated inner padding.",
);
