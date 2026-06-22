import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  buildHomeDataset,
  buildRanking,
  createSavedRankingSnapshot,
  defaultStateForHome,
  filterRankingRows,
  getFilteredRankingRows,
  getRankingPage,
  homeIsReady,
  validateWeights,
} from "../src/domain/university-ranking.mjs";

const dataScript = readFileSync("data/university-ranking-data.js", "utf8");
assert.ok(!dataScript.includes("sourceCsv"), "Ranking data should not expose build-time source CSV paths.");
assert.ok(!dataScript.includes("C:\\Users"), "Ranking data should not expose local filesystem paths.");

const sandbox = { window: {} };
vm.runInNewContext(dataScript, sandbox, { filename: "data/university-ranking-data.js" });
const rankingData = sandbox.window.UNIVERSITY_RANKING_DATA;

assert.equal(rankingData.datasets.length, 4);
assert.deepEqual(
  Array.from(rankingData.datasets, (dataset) => dataset.id),
  ["qs", "arwu", "the", "usnews"],
);
assert.deepEqual(
  Array.from(rankingData.datasets, (dataset) => dataset.universities.length),
  [263, 260, 249, 215],
);

const qs = rankingData.datasets[0];
const qsDefaultWeights = qs.indicators.map((indicator) => indicator.defaultWeight);
assert.deepEqual(validateWeights(qsDefaultWeights, qs.indicators.length), {
  valid: true,
  reason: "valid",
  total: 100,
});

const qsRanking = buildRanking(qs, qsDefaultWeights);
assert.equal(qsRanking.length, qs.universities.length);
assert.equal(qsRanking[0].customRank, 1);
assert.ok(
  qsRanking.every((row, index, rows) => index === 0 || rows[index - 1].customScore >= row.customScore),
  "Ranking rows should be sorted by custom score descending.",
);

const unitedStatesRows = filterRankingRows(qsRanking, { country: "United States" });
assert.ok(unitedStatesRows.length > 20);
assert.ok(unitedStatesRows.every((row) => row.university.country === "United States"));
assert.ok(getFilteredRankingRows(qs, qsRanking, { query: "Stanford", sort: "rank" })[0].university.university.includes("Stanford"));

const page = getRankingPage(qsRanking, { page: 2, pageSize: "25" });
assert.equal(page.page, 2);
assert.equal(page.rows.length, 25);
assert.equal(page.start, 26);

const savedRankings = Object.fromEntries(
  rankingData.datasets.map((dataset) => {
    const weights = dataset.indicators.map((indicator) => indicator.defaultWeight);
    const ranking = buildRanking(dataset, weights);
    return [dataset.id, createSavedRankingSnapshot(dataset, { weights, ranking })];
  }),
);
assert.equal(homeIsReady(rankingData.datasets, savedRankings), true);

const homeDataset = buildHomeDataset(rankingData.datasets, savedRankings);
const homeWeights = defaultStateForHome(rankingData.datasets).weights;
const homeRanking = buildRanking(homeDataset, homeWeights);
assert.equal(homeDataset.indicators.length, 4);
assert.ok(homeDataset.universities.length >= qs.universities.length);
assert.equal(homeRanking[0].customRank, 1);
