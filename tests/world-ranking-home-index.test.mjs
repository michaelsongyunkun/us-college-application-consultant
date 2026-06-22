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

function homeCompositeScore(savedRankings, datasetIds, weights, universityName) {
  const byUniversity = new Map();

  for (const datasetId of datasetIds) {
    const saved = savedRankings[datasetId];
    const savedTotal = saved.rows.length;
    for (const row of saved.rows) {
      if (!byUniversity.has(row.university.university)) {
        byUniversity.set(row.university.university, { indicatorScores: {} });
      }

      const record = byUniversity.get(row.university.university);
      record.indicatorScores[datasetId] = Number.isFinite(row.rankIndex)
        ? row.rankIndex
        : rankToIndex(row.customRank, savedTotal);
    }
  }

  const record = byUniversity.get(universityName);
  return datasetIds.reduce((sum, datasetId, index) => {
    return sum + record.indicatorScores[datasetId] * (weights[index] / 100);
  }, 0);
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

const sampleUniversity = { university: "Sample University" };
const syntheticSavedRankings = {
  qs: {
    rows: [
      { university: { university: "QS Leader" }, customRank: 1, customScore: 98 },
      { university: sampleUniversity, customRank: 2, customScore: 56.83 },
      { university: { university: "QS Trailer" }, customRank: 3, customScore: 40 },
    ],
  },
  arwu: {
    rows: [
      { university: { university: "ARWU Leader" }, customRank: 1, customScore: 60 },
      { university: sampleUniversity, customRank: 2, customScore: 22.87 },
      { university: { university: "ARWU Trailer" }, customRank: 3, customScore: 5 },
    ],
  },
};

assert.equal(
  homeCompositeScore(syntheticSavedRankings, ["qs", "arwu"], [50, 50], sampleUniversity.university),
  50,
  "home composite score should weight per-list rank indexes instead of raw custom score distributions",
);
assert.equal(rankToIndex(1, 1), 100, "a one-row saved ranking should normalize to a 100 index");
