import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("world-ranking/index.html", "utf8");
const styles = readFileSync("world-ranking/styles.css", "utf8");

assert.ok(
  html.includes('styles.css?v=20260710-brand-alignment-v3'),
  "The standalone ranking page should cache-bust the final aligned stylesheet.",
);
assert.ok(
  html.includes('class="ranking-brand"') && html.includes('src="./assets/logo-mark.svg"'),
  "The standalone ranking page should reuse the College Compass brand identity.",
);
assert.ok(
  html.includes("用于辅助比较，不替代院校官网、项目要求或顾问判断"),
  "The ranking intro should keep the same pragmatic trust boundary as the consultant workspace.",
);

for (const token of [
  "--color-canvas: #f8f7f1",
  "--color-surface: #ffffff",
  "--color-text: #132033",
  "--color-brand: #287250",
  "--color-action: #b45309",
  "--color-info: #2f6fb3",
  "--radius-panel: 14px",
]) {
  assert.ok(styles.includes(token), `Standalone ranking styles should define ${token}.`);
}

assert.match(
  styles,
  /\.ranker-tab\[aria-current="page"\][\s\S]*?background:\s*var\(--color-info\)/,
  "The selected ranking source should use the shared blue information state.",
);
assert.match(
  styles,
  /\.primary-button\s*\{[\s\S]*?background:\s*var\(--color-action\)/,
  "Ranking generation should use the shared orange action state.",
);
assert.match(
  styles,
  /\.ranking-table thead th\s*\{[\s\S]*?background:\s*var\(--color-surface-muted\)/,
  "Ranking tables should use the same light work-surface header treatment as the main app.",
);
assert.ok(
  html.indexOf('class="action-bar"') < html.indexOf('id="weightForm"'),
  "The primary ranking action should appear before the long weight editor.",
);
assert.match(
  styles,
  /\.primary-button,\s*\.secondary-button\s*\{[\s\S]*?min-height:\s*44px/,
  "Primary and secondary controls should meet the shared 44px touch target.",
);
assert.match(
  styles,
  /@media \(max-width: 420px\)[\s\S]*?\.data-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  "Mobile summary metrics should stay in the same compact three-column pattern as the main app.",
);
assert.match(
  styles,
  /@media \(max-width: 420px\)[\s\S]*?\.ranker-tab:not\(:first-child\) span\s*\{[\s\S]*?display:\s*none/,
  "Mobile ranking tabs should prioritize complete source names over secondary counts.",
);
