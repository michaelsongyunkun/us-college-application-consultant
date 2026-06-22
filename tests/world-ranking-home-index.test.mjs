import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const appPath = "world-ranking/app.js";
const dataPath = "world-ranking/data/universities.js";

const appScript = await readFile(appPath, "utf8");
assert.match(appScript, /function rankToIndex\(rank, total\)/);
assert.match(appScript, /record\.indicatorScores\[dataset\.id\] = rankIndex/);
assert.match(appScript, /rankIndex: rankToIndex\(row\.customRank, entry\.ranking\.length\)/);

const dataScript = await readFile(dataPath, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(dataScript, sandbox, { filename: dataPath });
const data = sandbox.window.UNIVERSITY_RANKING_DATA;

function rankToIndex(rank, total) {
  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) return 0;
  if (total <= 1) return 100;
  const index = 100 * (1 - (rank - 1) / (total - 1));
  return Math.round(Math.max(0, Math.min(100, index)) * 100) / 100;
}

function score(dataset, university, weights) {
  return dataset.indicators.reduce((sum, indicator, index) => {
    return sum + university.indicatorScores[indicator.slug] * (weights[index] / 100);
  }, 0);
}

function rankedRows(dataset) {
  const weights = dataset.indicators.map((indicator) => indicator.defaultWeight);
  return dataset.universities
    .map((university) => ({ university, customScore: score(dataset, university, weights) }))
    .sort((a, b) => {
      if (b.customScore !== a.customScore) return b.customScore - a.customScore;
      if (b.university.referenceScore !== a.university.referenceScore) {
        return b.university.referenceScore - a.university.referenceScore;
      }
      if (a.university.avgRank !== b.university.avgRank) return a.university.avgRank - b.university.avgRank;
      return a.university.university.localeCompare(b.university.university);
    })
    .map((row, index, rows) => ({
      ...row,
      customRank: index + 1,
      rankIndex: rankToIndex(index + 1, rows.length),
    }));
}

for (const dataset of data.datasets) {
  const rows = rankedRows(dataset);
  assert.equal(rows[0].rankIndex, 100, `${dataset.id}: top saved row should have 100 rank index`);
  assert.equal(rows.at(-1).rankIndex, 0, `${dataset.id}: last saved row should have 0 rank index`);

  const midpoint = Math.floor(rows.length / 2);
  assert.equal(
    rows[midpoint].rankIndex,
    rankToIndex(rows[midpoint].customRank, rows.length),
    `${dataset.id}: saved rank index should be derived from custom rank and row count`,
  );
  assert.notEqual(
    rows[midpoint].rankIndex,
    Math.round(rows[midpoint].customScore * 100) / 100,
    `${dataset.id}: home index should not reuse the raw custom score`,
  );
}
