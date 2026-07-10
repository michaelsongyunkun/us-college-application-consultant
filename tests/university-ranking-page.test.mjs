import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("university-ranking.html", "utf8");
const script = readFileSync("src/client/university-ranking.js", "utf8");
const domain = readFileSync("src/domain/university-ranking.mjs", "utf8");
const styles = readFileSync("styles.css", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const commandNavigation = indexHtml.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(html, /<title>大学排名<\/title>/);
assert.match(html, /class="[^"]*university-ranking-shell[^"]*"/);
assert.ok(html.includes('styles.css?v=20260710-ranking-structure-v2'));
assert.ok(html.includes('href="./university-ranking.html" data-safe-nav aria-current="page"'));
assert.ok(html.includes('src="./data/university-ranking-data.js?v=20260622-university-ranking"'));
assert.ok(html.includes('src="./src/client/university-ranking.js?v=20260710-ranking-structure-v2"'));
assert.ok(html.includes('id="rankingWeightForm"'));
assert.ok(html.includes('id="rankingDatasetTabs"'));
assert.ok(html.includes('id="rankingTableBody"'));
assert.ok(html.includes('id="exportRankingSvgButton"'));
assert.ok(html.includes('class="ranking-workspace-layout"'));
assert.ok(html.includes('id="rankingEmptyState"'));
assert.ok(html.includes('id="rankingEmptyStateTitle"'));
assert.ok(html.includes('id="rankingEmptyStateCopy"'));
assert.ok(
  html.indexOf('class="ranking-workspace-layout"') < html.indexOf('class="panel ranking-board-panel"')
    && html.indexOf('class="panel ranking-board-panel"') < html.indexOf('class="panel ranking-results-panel"'),
  "The ranking page should expose one strategy-and-results workspace instead of unrelated stacked panels.",
);
assert.ok(
  html.indexOf('class="ranking-control-footer"') < html.indexOf('id="rankingWeightForm"'),
  "The visible ranking action bar should precede the weight editor in DOM and keyboard order.",
);
assert.ok(!html.includes("brand-page-header"));
assert.ok(!html.includes("rankingDatasetEyebrow"));
assert.ok(!html.includes("rankingSourceLabel"));
assert.ok(!html.includes("rankingGeneratedAt"));

assert.ok(
  commandNavigation.indexOf("resource-library.html") < commandNavigation.indexOf("school-encyclopedia.html")
    && commandNavigation.indexOf("school-encyclopedia.html") < commandNavigation.indexOf("university-ranking.html")
    && commandNavigation.indexOf("university-ranking.html") < commandNavigation.indexOf("major-encyclopedia.html")
    && commandNavigation.indexOf("major-encyclopedia.html") < commandNavigation.indexOf("course-helper.html"),
  "Command navigation should place university ranking in the reference section between schools and majors.",
);

assert.ok(script.includes("window.UNIVERSITY_RANKING_DATA"));
assert.ok(script.includes("collegeCompass.universityRanking.savedRankings.v1"));
assert.ok(script.includes("buildRanking"));
assert.ok(script.includes("buildHomeDataset"));
assert.ok(script.includes('class="resource-tab ranking-tab${selected ? " is-active" : ""}"'));
assert.ok(!script.includes("rankingSourceLabel"));
assert.ok(!script.includes("rankingGeneratedAt"));
assert.ok(!script.includes("rankingDatasetEyebrow"));
assert.ok(!script.includes("Source: ${dataset.sourceLabel}"));
assert.ok(!script.includes("Generated: ${new Date(data.generatedAt)"));
assert.ok(!script.includes("/api/deepseek"));
assert.ok(!script.includes("deepSeekRag"));
assert.ok(!script.includes("assistantProfile"));
assert.ok(!domain.includes("deepseek"));
assert.ok(!domain.includes("Rag"));
assert.ok(!domain.includes("/api/"));

assert.ok(
  script.indexOf('elements.weightTotal.dataset.state = "valid";')
    < script.indexOf("if (dataset.isHome && !homeIsReady"),
  "A valid 100% total should stay valid even when the home ranking is waiting for saved sources.",
);

assert.match(
  styles,
  /\.university-ranking-shell \.command-summary-metrics strong\s*\{[\s\S]*?color:\s*var\(--color-brand-deep\)/,
  "Ranking summary metrics should use the same brand green as peer reference modules.",
);
assert.match(
  styles,
  /\.university-ranking-shell \.ranking-tabs\s*\{[\s\S]*?gap:\s*4px;[\s\S]*?padding:\s*4px;/,
  "Ranking source tabs should use the shared compact segmented-control surface.",
);
assert.match(
  styles,
  /\.university-ranking-shell \.resource-tab\.ranking-tab\s*\{[\s\S]*?min-height:\s*38px;[\s\S]*?border-radius:\s*var\(--radius\)/,
  "Ranking tabs should match the radius and height of reference-module tabs.",
);
assert.match(
  styles,
  /\.university-ranking-shell \.ranking-control-footer #generateRankingButton\s*\{[\s\S]*?background:\s*var\(--color-brand\)/,
  "Ranking generation should use the same brand action treatment as peer modules.",
);
assert.match(
  styles,
  /\.university-ranking-shell \.ranking-control-footer button\s*\{[\s\S]*?min-height:\s*42px/,
  "Ranking actions should match the shared control height.",
);
assert.match(
  styles,
  /@media \(max-width: 560px\)[\s\S]*?\.university-ranking-shell \.ranking-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  "Mobile ranking tabs should stay compact instead of becoming five full-width rows.",
);
assert.match(
  styles,
  /\.university-ranking-shell \.ranking-result-workspace\[hidden\]\s*\{[\s\S]*?display:\s*none/,
  "An ungenerated ranking workspace should not leak empty filters and tables through its hidden state.",
);
assert.ok(
  script.includes('elements.meta.textContent = "完成权重设置并生成排名后，在这里查看完整结果。";'),
  "The empty result panel should retain a useful next-step message.",
);
assert.ok(
  script.includes("elements.emptyState.hidden = isVisible;"),
  "The preview empty state should trade places with generated ranking results.",
);
assert.ok(script.includes('class="ranking-save-summary"'));
assert.ok(!script.includes('class="ranking-save-status-row"'));
assert.match(
  styles,
  /\.ranking-save-status\s*\{[^}]*display:\s*block/,
  "The consolidated home-save progress should occupy the full strategy-panel width.",
);
assert.match(
  styles,
  /\.ranking-workspace-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(330px, 0\.82fr\) minmax\(0, 1\.6fr\)/,
  "Desktop ranking should use a strategy sidebar and a wider result workspace.",
);
assert.match(
  styles,
  /\.ranking-workspace-layout \.ranking-board-panel\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?max-height:\s*calc\(100vh - 36px\)/,
  "The strategy panel should remain available while scanning long rankings.",
);
assert.match(
  styles,
  /\.ranking-empty-state\s*\{[\s\S]*?min-height:\s*520px/,
  "The result side should provide a substantial task-oriented preview state before generation.",
);
assert.match(
  styles,
  /@media \(max-width: 1180px\)[\s\S]*?\.ranking-workspace-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  "The two-pane workspace should return to one column on narrower screens.",
);
