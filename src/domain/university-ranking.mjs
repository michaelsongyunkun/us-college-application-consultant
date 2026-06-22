export const HOME_DATASET_ID = "home";
export const DEFAULT_RANKING_PAGE_SIZE = "50";

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatRank(value) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

export function formatWeight(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export function weightsKey(weights) {
  return weights.map((weight) => formatWeight(weight)).join(",");
}

export function createEvenWeights(count) {
  if (!Number.isInteger(count) || count <= 0) return [];
  const base = Math.floor((100 / count) * 10) / 10;
  const weights = Array.from({ length: count }, () => base);
  const currentTotal = weights.reduce((sum, weight) => sum + weight, 0);
  weights[count - 1] = Math.round((weights[count - 1] + 100 - currentTotal) * 10) / 10;
  return weights;
}

export function defaultStateForDataset(dataset) {
  return {
    weights: dataset.indicators.map((indicator) => indicator.defaultWeight),
    ranking: null,
    generatedWeightsKey: "",
    search: "",
    country: "all",
    region: "all",
    sort: "rank",
    page: 1,
    pageSize: DEFAULT_RANKING_PAGE_SIZE,
  };
}

export function defaultStateForHome(datasets) {
  return {
    weights: createEvenWeights(datasets.length),
    ranking: null,
    generatedWeightsKey: "",
    search: "",
    country: "all",
    region: "all",
    sort: "rank",
    page: 1,
    pageSize: DEFAULT_RANKING_PAGE_SIZE,
  };
}

export function validateWeights(weights, expectedLength) {
  if (!Array.isArray(weights) || weights.length !== expectedLength) {
    return { valid: false, reason: "length", total: 0 };
  }

  const usable = weights.filter((weight) => Number.isFinite(weight));
  const total = Math.round(usable.reduce((sum, weight) => sum + weight, 0) * 100) / 100;

  if (!weights.every((weight) => Number.isFinite(weight))) {
    return { valid: false, reason: "number", total };
  }

  if (!weights.every((weight) => weight >= 0 && weight <= 100)) {
    return { valid: false, reason: "range", total };
  }

  if (Math.abs(total - 100) > 0.01) {
    return { valid: false, reason: "total", total };
  }

  return { valid: true, reason: "valid", total: 100 };
}

export function parseUrlWeights(raw, expectedLength) {
  if (!raw) return { status: "missing", weights: null };
  const weights = String(raw).split(",").map((part) => Number(part));
  const validation = validateWeights(weights, expectedLength);
  if (!validation.valid) return { status: "invalid", weights: null };
  return { status: "valid", weights };
}

export function normalizeUniversityKey(university) {
  const chinese = university.officialChineseName || "";
  if (chinese) return `cn:${chinese}`;
  return `en:${String(university.university)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
}

export function savedDatasetIds(datasets, savedRankings) {
  return datasets.filter((dataset) => savedRankings?.[dataset.id]).map((dataset) => dataset.id);
}

export function missingSavedDatasets(datasets, savedRankings) {
  return datasets.filter((dataset) => !savedRankings?.[dataset.id]);
}

export function homeIsReady(datasets, savedRankings) {
  return missingSavedDatasets(datasets, savedRankings).length === 0;
}

export function buildHomeDataset(datasets, savedRankings = {}) {
  const indicators = datasets.map((dataset) => ({
    slug: dataset.id,
    labelZh: dataset.shortName,
    labelEn: dataset.title,
    defaultWeight: createEvenWeights(datasets.length)[datasets.indexOf(dataset)] ?? 0,
  }));
  const byUniversity = new Map();

  for (const dataset of datasets) {
    const saved = savedRankings[dataset.id];
    if (!saved) continue;

    for (const row of saved.rows || []) {
      const key = normalizeUniversityKey(row.university);
      if (!byUniversity.has(key)) {
        byUniversity.set(key, {
          university: row.university.university,
          officialChineseName: row.university.officialChineseName,
          chineseNameSource: row.university.chineseNameSource,
          country: row.university.country,
          region: row.university.region,
          city: row.university.city,
          indicatorScores: {},
          sourceRanks: {},
          savedRecords: {},
          externalUrl: "",
        });
      }

      const record = byUniversity.get(key);
      record.indicatorScores[dataset.id] = row.customScore;
      record.sourceRanks[dataset.shortName] = `#${row.customRank} / ${formatNumber(row.customScore)}`;
      record.savedRecords[dataset.id] = {
        shortName: dataset.shortName,
        customRank: row.customRank,
        customScore: row.customScore,
        savedAt: saved.savedAt,
      };
    }
  }

  const universities = [...byUniversity.values()].map((university) => {
    let coverage = 0;
    let bestScore = 0;
    for (const dataset of datasets) {
      const score = university.indicatorScores[dataset.id];
      if (Number.isFinite(score)) {
        coverage += 1;
        bestScore = Math.max(bestScore, score);
      } else {
        university.indicatorScores[dataset.id] = 0;
        university.sourceRanks[dataset.shortName] = savedRankings[dataset.id] ? "未收录" : "未保存";
      }
    }
    return {
      ...university,
      coverage,
      avgRank: coverage,
      referenceScore: bestScore,
    };
  });

  return {
    id: HOME_DATASET_ID,
    shortName: "我的主页",
    title: "我的主页自定义榜单",
    eyebrow: "我的主页 / 多榜单合成",
    sourceLabel: "本地保存的各榜单自定义结果",
    sourceUrl: "",
    detailsSummary: "各榜单保存分数和名次",
    avgRankLabel: "覆盖榜单",
    referenceScoreLabel: "最佳单榜分",
    resetLabel: "恢复均衡权重",
    weightStep: 1,
    isHome: true,
    indicators,
    universities,
  };
}

export function computeScore(dataset, university, weights) {
  return dataset.indicators.reduce((sum, indicator, index) => {
    return sum + (university.indicatorScores[indicator.slug] || 0) * (weights[index] / 100);
  }, 0);
}

export function compareRankedRows(dataset, a, b) {
  if (b.customScore !== a.customScore) return b.customScore - a.customScore;
  if (b.university.referenceScore !== a.university.referenceScore) {
    return b.university.referenceScore - a.university.referenceScore;
  }
  if (dataset.isHome && b.university.coverage !== a.university.coverage) {
    return b.university.coverage - a.university.coverage;
  }
  if (a.university.avgRank !== b.university.avgRank) {
    return a.university.avgRank - b.university.avgRank;
  }
  return String(a.university.university).localeCompare(String(b.university.university));
}

export function buildRanking(dataset, weights) {
  const validation = validateWeights(weights, dataset.indicators.length);
  if (!validation.valid) return [];
  return dataset.universities
    .map((university) => ({
      university,
      customScore: computeScore(dataset, university, weights),
    }))
    .sort((a, b) => compareRankedRows(dataset, a, b))
    .map((row, index) => ({
      ...row,
      customRank: index + 1,
    }));
}

export function filterRankingRows(rows, { query = "", country = "all", region = "all" } = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();
  return rows.filter((row) => {
    const university = row.university;
    const searchableText = [
      university.officialChineseName,
      university.university,
      university.country,
      university.region,
      university.city,
    ].join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
    const matchesCountry = country === "all" || university.country === country;
    const matchesRegion = region === "all" || university.region === region;
    return matchesQuery && matchesCountry && matchesRegion;
  });
}

export function sortRankingRows(dataset, rows, sort = "rank") {
  return [...rows].sort((a, b) => {
    if (sort === "score") return b.customScore - a.customScore || a.customRank - b.customRank;
    if (sort === "avgRank") {
      if (dataset.isHome) return b.university.coverage - a.university.coverage || a.customRank - b.customRank;
      return a.university.avgRank - b.university.avgRank || a.customRank - b.customRank;
    }
    if (sort === "official") {
      return b.university.referenceScore - a.university.referenceScore || a.customRank - b.customRank;
    }
    if (sort === "country") {
      return (
        String(a.university.country).localeCompare(String(b.university.country)) ||
        String(a.university.university).localeCompare(String(b.university.university))
      );
    }
    return a.customRank - b.customRank;
  });
}

export function getFilteredRankingRows(dataset, rows, filters = {}) {
  return sortRankingRows(dataset, filterRankingRows(rows, filters), filters.sort || "rank");
}

export function getRankingPage(rows, { page = 1, pageSize = DEFAULT_RANKING_PAGE_SIZE } = {}) {
  if (pageSize === "all") {
    return { rows, page: 1, totalPages: 1, start: rows.length ? 1 : 0, end: rows.length };
  }

  const numericPageSize = Number(pageSize);
  const usablePageSize = Number.isFinite(numericPageSize) && numericPageSize > 0 ? numericPageSize : 50;
  const totalPages = Math.max(1, Math.ceil(rows.length / usablePageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (currentPage - 1) * usablePageSize;
  return {
    rows: rows.slice(startIndex, startIndex + usablePageSize),
    page: currentPage,
    totalPages,
    start: rows.length ? startIndex + 1 : 0,
    end: Math.min(rows.length, startIndex + usablePageSize),
  };
}

export function getFilterOptions(dataset) {
  const countries = [...new Set(dataset.universities.map((university) => university.country).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const regions = [...new Set(dataset.universities.map((university) => university.region).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  return { countries, regions };
}

export function createSavedRankingSnapshot(dataset, entry) {
  return {
    datasetId: dataset.id,
    shortName: dataset.shortName,
    title: dataset.title,
    savedAt: new Date().toISOString(),
    weights: [...entry.weights],
    rows: entry.ranking.map((row) => ({
      customRank: row.customRank,
      customScore: row.customScore,
      university: {
        university: row.university.university,
        officialChineseName: row.university.officialChineseName,
        chineseNameSource: row.university.chineseNameSource,
        country: row.university.country,
        region: row.university.region,
        city: row.university.city,
      },
      avgRank: row.university.avgRank,
      referenceScore: row.university.referenceScore,
    })),
  };
}
