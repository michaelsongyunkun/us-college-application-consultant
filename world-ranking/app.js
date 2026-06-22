(function () {
  const data = window.UNIVERSITY_RANKING_DATA;

  if (!data?.datasets?.length) {
    document.body.innerHTML =
      '<main class="app-shell"><section class="result-panel"><h1>数据加载失败</h1></section></main>';
    return;
  }

  const datasets = data.datasets;
  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const HOME_ID = "home";
  const STORAGE_KEY = "myWorldUniversityRanking.savedRankings.v1";
  const params = new URLSearchParams(window.location.search);
  const initialDatasetId =
    params.get("dataset") === HOME_ID || datasetById.has(params.get("dataset")) ? params.get("dataset") : HOME_ID;

  const state = {
    activeDatasetId: initialDatasetId,
    savedRankings: loadSavedRankings(),
    byDataset: new Map(
      [
        [
          HOME_ID,
          {
            weights: datasets.map(() => 25),
            ranking: null,
            generatedWeightsKey: "",
            search: "",
            country: "all",
            region: "all",
            sort: "rank",
            page: 1,
            pageSize: "50",
          },
        ],
        ...datasets.map((dataset) => [
          dataset.id,
          {
            weights: dataset.indicators.map((indicator) => indicator.defaultWeight),
            ranking: null,
            generatedWeightsKey: "",
            search: "",
            country: "all",
            region: "all",
            sort: "rank",
            page: 1,
            pageSize: "50",
          },
        ]),
      ],
    ),
  };

  const elements = {
    datasetEyebrow: document.getElementById("datasetEyebrow"),
    rankerTabs: document.getElementById("rankerTabs"),
    weightForm: document.getElementById("weightForm"),
    weightTotalBadge: document.getElementById("weightTotalBadge"),
    weightStatus: document.getElementById("weightStatus"),
    resetWeightsButton: document.getElementById("resetWeightsButton"),
    generateRankingButton: document.getElementById("generateRankingButton"),
    saveHomeButton: document.getElementById("saveHomeButton"),
    exportSvgButton: document.getElementById("exportSvgButton"),
    homeSaveStatus: document.getElementById("homeSaveStatus"),
    rankingWorkspace: document.getElementById("rankingWorkspace"),
    rankingMeta: document.getElementById("rankingMeta"),
    rankingBody: document.getElementById("rankingBody"),
    searchInput: document.getElementById("searchInput"),
    countryFilter: document.getElementById("countryFilter"),
    regionFilter: document.getElementById("regionFilter"),
    sortSelect: document.getElementById("sortSelect"),
    avgRankSortOption: document.getElementById("avgRankSortOption"),
    referenceSortOption: document.getElementById("referenceSortOption"),
    avgRankHeader: document.getElementById("avgRankHeader"),
    referenceScoreHeader: document.getElementById("referenceScoreHeader"),
    pageSizeSelect: document.getElementById("pageSizeSelect"),
    prevPageButton: document.getElementById("prevPageButton"),
    nextPageButton: document.getElementById("nextPageButton"),
    paginationInfo: document.getElementById("paginationInfo"),
    generatedAt: document.getElementById("generatedAt"),
    sourceLabel: document.getElementById("sourceLabel"),
    summaryUniversityCount: document.getElementById("summaryUniversityCount"),
    summaryIndicatorCount: document.getElementById("summaryIndicatorCount"),
    summaryWeightTotal: document.getElementById("summaryWeightTotal"),
    resultTitle: document.getElementById("resultTitle"),
  };

  function loadSavedRankings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  }

  function persistSavedRankings() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.savedRankings));
  }

  function savedDatasetIds() {
    return datasets.filter((dataset) => state.savedRankings[dataset.id]).map((dataset) => dataset.id);
  }

  function missingSavedDatasets() {
    return datasets.filter((dataset) => !state.savedRankings[dataset.id]);
  }

  function homeIsReady() {
    return missingSavedDatasets().length === 0;
  }

  function normalizeUniversityKey(university) {
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

  function buildHomeDataset() {
    const indicators = datasets.map((dataset) => ({
      slug: dataset.id,
      labelZh: dataset.shortName,
      labelEn: dataset.title,
      defaultWeight: 25,
    }));
    const byUniversity = new Map();

    for (const dataset of datasets) {
      const saved = state.savedRankings[dataset.id];
      if (!saved) continue;

      const savedTotal = saved.rows.length;
      for (const row of saved.rows) {
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
        const rankIndex = Number.isFinite(row.rankIndex) ? row.rankIndex : rankToIndex(row.customRank, savedTotal);
        record.indicatorScores[dataset.id] = rankIndex;
        record.sourceRanks[dataset.shortName] =
          `#${row.customRank} / ${formatNumber(row.customScore)} / 指数 ${formatNumber(rankIndex)}`;
        record.savedRecords[dataset.id] = {
          shortName: dataset.shortName,
          customRank: row.customRank,
          customScore: row.customScore,
          rankIndex,
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
          university.sourceRanks[dataset.shortName] = state.savedRankings[dataset.id] ? "未收录" : "未保存";
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
      id: HOME_ID,
      shortName: "我的主页",
      title: "我的主页自定义榜单",
      eyebrow: "我的主页 · 四大榜单合成",
      sourceLabel: "本地保存的四大榜单自定义结果",
      sourceUrl: "",
      detailsSummary: "各榜单保存分数和名次",
      avgRankLabel: "覆盖榜单",
      referenceScoreLabel: "最佳单榜分",
      resetLabel: "恢复四榜均衡",
      weightStep: 1,
      isHome: true,
      indicators,
      universities,
    };
  }

  function activeDataset() {
    if (state.activeDatasetId === HOME_ID) return buildHomeDataset();
    return datasetById.get(state.activeDatasetId);
  }

  function activeState() {
    return state.byDataset.get(state.activeDatasetId);
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatRank(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    }).format(value);
  }

  function formatWeight(value) {
    if (!Number.isFinite(value)) return "0";
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  }

  function rankToIndex(rank, total) {
    if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) return 0;
    if (total <= 1) return 100;
    const index = 100 * (1 - (rank - 1) / (total - 1));
    return Math.round(Math.max(0, Math.min(100, index)) * 100) / 100;
  }

  function weightsKey(weights) {
    return weights.map((weight) => formatWeight(weight)).join(",");
  }

  function getNumberInputs() {
    return [...elements.weightForm.querySelectorAll(".weight-number")];
  }

  function getRangeInputs() {
    return [...elements.weightForm.querySelectorAll(".weight-slider")];
  }

  function collectWeights() {
    const dataset = activeDataset();
    const inputs = getNumberInputs();
    if (inputs.length !== dataset.indicators.length) {
      return { valid: false, weights: [], total: 0, message: "权重控件未完整加载。" };
    }

    const weights = inputs.map((input) => {
      const raw = input.value.trim();
      if (raw === "") return NaN;
      return Number(raw);
    });
    const usable = weights.filter((weight) => Number.isFinite(weight));
    const total = Math.round(usable.reduce((sum, weight) => sum + weight, 0) * 100) / 100;

    if (!weights.every((weight) => Number.isFinite(weight))) {
      return { valid: false, weights, total, message: "所有权重都必须填写为数字。" };
    }

    if (!weights.every((weight) => weight >= 0 && weight <= 100)) {
      return { valid: false, weights, total, message: "单项权重必须在 0% 到 100% 之间。" };
    }

    if (Math.abs(total - 100) > 0.01) {
      const diff = Math.round((100 - total) * 100) / 100;
      const message =
        diff > 0
          ? `权重合计 ${formatWeight(total)}%，还差 ${formatWeight(diff)}%。`
          : `权重合计 ${formatWeight(total)}%，超出 ${formatWeight(Math.abs(diff))}%。`;
      return { valid: false, weights, total, message };
    }

    return { valid: true, weights, total: 100, message: "权重有效，可以生成完整排名。" };
  }

  function parseUrlWeights(dataset) {
    const raw = params.get("w");
    if (!raw) return { status: "missing", weights: null };

    const weights = raw.split(",").map((part) => Number(part));
    if (weights.length !== dataset.indicators.length) return { status: "invalid", weights: null };
    if (!weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 100)) {
      return { status: "invalid", weights: null };
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 100) > 0.01) return { status: "invalid", weights: null };
    return { status: "valid", weights };
  }

  function setWeights(weights) {
    const entry = activeState();
    entry.weights = [...weights];
    getNumberInputs().forEach((input, index) => {
      input.value = formatWeight(weights[index]);
    });
    getRangeInputs().forEach((input, index) => {
      input.value = formatWeight(weights[index]);
    });
    updateWeightState({ preserveStatus: false });
  }

  function setRankingVisibility(isVisible) {
    elements.rankingWorkspace.hidden = !isVisible;
    elements.exportSvgButton.disabled = !isVisible;
    updateSaveButtonState();
  }

  function updateSaveButtonState() {
    const dataset = activeDataset();
    const entry = activeState();
    elements.saveHomeButton.hidden = Boolean(dataset.isHome);
    elements.saveHomeButton.disabled = Boolean(dataset.isHome || !entry.ranking);
  }

  function clearRanking() {
    const entry = activeState();
    entry.ranking = null;
    entry.generatedWeightsKey = "";
    entry.page = 1;
    elements.rankingBody.innerHTML = "";
    elements.rankingMeta.textContent = "";
    elements.paginationInfo.textContent = "";
    setRankingVisibility(false);
  }

  function updateWeightState(options = {}) {
    const dataset = activeDataset();
    const entry = activeState();
    const result = collectWeights();
    elements.weightTotalBadge.textContent = `合计 ${formatWeight(result.total)}%`;
    elements.summaryWeightTotal.textContent = `${formatWeight(result.total)}%`;
    elements.generateRankingButton.disabled = !result.valid;

    if (!result.valid) {
      elements.weightTotalBadge.dataset.state = "invalid";
      elements.weightStatus.dataset.state = "invalid";
      elements.weightStatus.textContent = result.message;
      clearRanking();
      return result;
    }

    if (dataset.isHome && !homeIsReady()) {
      const missing = missingSavedDatasets().map((item) => item.shortName).join("、");
      elements.weightTotalBadge.dataset.state = "invalid";
      elements.weightStatus.dataset.state = "invalid";
      elements.weightStatus.textContent = `还需要保存：${missing}。`;
      elements.generateRankingButton.disabled = true;
      clearRanking();
      return { ...result, valid: false };
    }

    elements.weightTotalBadge.dataset.state = "valid";
    const currentKey = weightsKey(result.weights);
    const isStale = entry.ranking && currentKey !== entry.generatedWeightsKey;

    if (isStale && !options.preserveStatus) {
      elements.weightStatus.dataset.state = "changed";
      elements.weightStatus.textContent = "权重已修改，需要重新生成完整排名。";
      clearRanking();
    } else {
      elements.weightStatus.dataset.state = "valid";
      elements.weightStatus.textContent = result.message;
    }

    return result;
  }

  function computeScore(dataset, university, weights) {
    return dataset.indicators.reduce((sum, indicator, index) => {
      return sum + university.indicatorScores[indicator.slug] * (weights[index] / 100);
    }, 0);
  }

  function compareRankedRows(dataset, a, b) {
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
    return a.university.university.localeCompare(b.university.university);
  }

  function buildRanking(weights) {
    const dataset = activeDataset();
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

  function updateUrl() {
    const entry = activeState();
    const url = new URL(window.location.href);
    url.searchParams.set("dataset", state.activeDatasetId);
    if (entry.ranking) {
      url.searchParams.set("w", entry.generatedWeightsKey);
    } else {
      url.searchParams.delete("w");
    }
    window.history.replaceState({}, "", url);
  }

  function getFilteredRows() {
    const dataset = activeDataset();
    const entry = activeState();
    if (!entry.ranking) return [];

    const query = entry.search.trim().toLowerCase();
    let rows = entry.ranking.filter((row) => {
      const university = row.university;
      const text =
        `${university.officialChineseName} ${university.university} ${university.country} ${university.region} ${university.city}`.toLowerCase();
      const matchesQuery = !query || text.includes(query);
      const matchesCountry = entry.country === "all" || university.country === entry.country;
      const matchesRegion = entry.region === "all" || university.region === entry.region;
      return matchesQuery && matchesCountry && matchesRegion;
    });

    rows = [...rows].sort((a, b) => {
      if (entry.sort === "score") return b.customScore - a.customScore || a.customRank - b.customRank;
      if (entry.sort === "avgRank") {
        if (dataset.isHome) return b.university.coverage - a.university.coverage || a.customRank - b.customRank;
        return a.university.avgRank - b.university.avgRank || a.customRank - b.customRank;
      }
      if (entry.sort === "official") {
        return b.university.referenceScore - a.university.referenceScore || a.customRank - b.customRank;
      }
      if (entry.sort === "country") {
        return (
          a.university.country.localeCompare(b.university.country) ||
          a.university.university.localeCompare(b.university.university)
        );
      }
      return a.customRank - b.customRank;
    });

    return rows;
  }

  function getPageRows(rows) {
    const entry = activeState();
    if (entry.pageSize === "all") {
      entry.page = 1;
      return { rows, totalPages: 1, start: rows.length ? 1 : 0, end: rows.length };
    }

    const pageSize = Number(entry.pageSize);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    entry.page = Math.min(Math.max(1, entry.page), totalPages);
    const startIndex = (entry.page - 1) * pageSize;
    return {
      rows: rows.slice(startIndex, startIndex + pageSize),
      totalPages,
      start: rows.length ? startIndex + 1 : 0,
      end: Math.min(rows.length, startIndex + pageSize),
    };
  }

  function renderIndicatorDetails(university) {
    const dataset = activeDataset();
    const indicators = dataset.indicators
      .map((indicator) => {
        const value = university.indicatorScores[indicator.slug];
        return `<div class="indicator-score">
          <span>
            <strong>${escapeHtml(indicator.labelZh)}</strong>
            <em>${escapeHtml(indicator.labelEn)}</em>
          </span>
          <b>${formatNumber(value)}</b>
        </div>`;
      })
      .join("");

    const ranks = Object.entries(university.sourceRanks ?? {})
      .map(
        ([year, rank]) => `<div class="source-rank">
          <span>${escapeHtml(year)}</span>
          <b>${escapeHtml(rank || "—")}</b>
        </div>`,
      )
      .join("");

    return `${indicators}<div class="source-ranks" aria-label="原榜年度名次">${ranks}</div>`;
  }

  function renderRanking() {
    const dataset = activeDataset();
    const entry = activeState();
    if (!entry.ranking) return;

    const rows = getFilteredRows();
    const page = getPageRows(rows);
    elements.rankingMeta.textContent = `完整排名 ${entry.ranking.length} 所；当前筛选 ${rows.length} 所。`;

    elements.prevPageButton.disabled = entry.page <= 1 || entry.pageSize === "all";
    elements.nextPageButton.disabled = entry.page >= page.totalPages || entry.pageSize === "all";
    elements.paginationInfo.textContent =
      entry.pageSize === "all"
        ? `显示全部 ${rows.length} 所`
        : `第 ${entry.page} / ${page.totalPages} 页 · 显示 ${page.start}-${page.end} / ${rows.length} 所`;

    if (rows.length === 0) {
      elements.rankingBody.innerHTML = '<tr class="empty-row"><td colspan="7">没有匹配结果。</td></tr>';
      return;
    }

    const html = page.rows
      .map((row) => {
        const university = row.university;
        const location = [university.city, university.region].filter(Boolean).join(" · ");
        const externalUrl = university.externalUrl || dataset.sourceUrl;
        const avgRankValue = dataset.isHome ? `${university.coverage}/4` : formatRank(university.avgRank);
        const sourceCell = dataset.isHome
          ? '<span class="muted-link">本地</span>'
          : `<a href="${escapeAttribute(externalUrl)}" target="_blank" rel="noreferrer">${escapeHtml(dataset.shortName)}</a>`;
        return `<tr>
          <td class="rank-cell">#${row.customRank}</td>
          <td class="school-cell">
            <span class="school-name">${escapeHtml(university.officialChineseName)}</span>
            <span class="school-name-en">${escapeHtml(university.university)}</span>
            <span class="school-location">${escapeHtml(location)}</span>
            <details class="indicator-details">
              <summary>${escapeHtml(dataset.detailsSummary)}</summary>
              <div class="indicator-grid">
                ${renderIndicatorDetails(university)}
              </div>
            </details>
          </td>
          <td>${escapeHtml(university.country)}</td>
          <td class="numeric-cell">${formatNumber(row.customScore)}</td>
          <td class="numeric-cell">${escapeHtml(avgRankValue)}</td>
          <td class="numeric-cell">${formatNumber(university.referenceScore)}</td>
          <td>${sourceCell}</td>
        </tr>`;
      })
      .join("");

    elements.rankingBody.innerHTML = html;
  }

  function generateRanking() {
    const dataset = activeDataset();
    const entry = activeState();
    const result = collectWeights();
    if (!result.valid) {
      updateWeightState();
      return;
    }
    if (dataset.isHome && !homeIsReady()) {
      updateWeightState();
      return;
    }

    entry.weights = [...result.weights];
    entry.ranking = buildRanking(entry.weights);
    entry.generatedWeightsKey = weightsKey(entry.weights);
    entry.search = "";
    entry.country = "all";
    entry.region = "all";
    entry.sort = "rank";
    entry.page = 1;

    elements.searchInput.value = "";
    elements.countryFilter.value = "all";
    elements.regionFilter.value = "all";
    elements.sortSelect.value = "rank";
    elements.weightStatus.dataset.state = "valid";
    elements.weightStatus.textContent = "完整排名已生成。";
    setRankingVisibility(true);
    updateUrl();
    renderRanking();
  }

  function saveActiveRankingToHome() {
    const dataset = activeDataset();
    const entry = activeState();
    if (dataset.isHome || !entry.ranking) return;

    state.savedRankings[dataset.id] = {
      datasetId: dataset.id,
      shortName: dataset.shortName,
      title: dataset.title,
      savedAt: new Date().toISOString(),
      weights: [...entry.weights],
      rows: entry.ranking.map((row) => ({
        customRank: row.customRank,
        customScore: row.customScore,
        rankIndex: rankToIndex(row.customRank, entry.ranking.length),
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

    const homeState = state.byDataset.get(HOME_ID);
    homeState.ranking = null;
    homeState.generatedWeightsKey = "";
    homeState.page = 1;
    persistSavedRankings();
    renderTabs();
    updateSaveButtonState();
    elements.weightStatus.dataset.state = "valid";
    elements.weightStatus.textContent = `${dataset.shortName}已保存到我的主页。`;
    elements.saveHomeButton.textContent = "已保存到我的主页";
    window.setTimeout(() => {
      elements.saveHomeButton.textContent = "更新并保存到我的主页";
    }, 1400);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function truncateText(value, maxLength) {
    const text = String(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function buildRankingSvg(rows) {
    const dataset = activeDataset();
    const entry = activeState();
    const width = 1500;
    const margin = 40;
    const titleHeight = 132;
    const tableHeaderHeight = 44;
    const rowHeight = 58;
    const height = titleHeight + tableHeaderHeight + rows.length * rowHeight + 44;
    const columns = {
      rank: margin,
      school: 122,
      country: 690,
      score: 910,
      avgRank: 1060,
      reference: 1240,
    };
    const weights = dataset.indicators
      .map((indicator, index) => `${indicator.labelZh} ${formatWeight(entry.weights[index])}%`)
      .join(" · ");
    const generated = new Date().toLocaleString("zh-CN");

    const rowMarkup = rows
      .map((row, index) => {
        const y = titleHeight + tableHeaderHeight + index * rowHeight;
        const university = row.university;
        const fill = index % 2 === 0 ? "#ffffff" : "#f8fbf9";
        const avgRankValue = dataset.isHome ? `${university.coverage}/4` : formatRank(university.avgRank);
        return `<g>
  <rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${rowHeight}" fill="${fill}" />
  <text x="${columns.rank}" y="${y + 35}" class="rank">#${row.customRank}</text>
  <text x="${columns.school}" y="${y + 24}" class="school">${escapeXml(truncateText(university.officialChineseName, 28))}</text>
  <text x="${columns.school}" y="${y + 44}" class="muted">${escapeXml(truncateText(university.university, 54))}</text>
  <text x="${columns.country}" y="${y + 35}" class="body">${escapeXml(truncateText(university.country, 24))}</text>
  <text x="${columns.score}" y="${y + 35}" class="number">${escapeXml(formatNumber(row.customScore))}</text>
  <text x="${columns.avgRank}" y="${y + 35}" class="number">${escapeXml(avgRankValue)}</text>
  <text x="${columns.reference}" y="${y + 35}" class="number">${escapeXml(formatNumber(university.referenceScore))}</text>
</g>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font: 800 34px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #202421; }
    .subtitle { font: 500 16px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #66706a; }
    .head { font: 800 15px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #ffffff; }
    .rank { font: 900 18px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #202421; }
    .school { font: 800 17px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #202421; }
    .body { font: 500 16px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #202421; }
    .muted { font: 500 13px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #66706a; }
    .number { font: 700 16px "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; fill: #202421; }
  </style>
  <rect width="${width}" height="${height}" fill="#f6f7f4" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="12" fill="#ffffff" stroke="#d7ddd8" />
  <text x="${margin}" y="70" class="title">我的世界大学排名 · ${escapeXml(dataset.shortName)}</text>
  <text x="${margin}" y="102" class="subtitle">当前导出 ${rows.length} 所 · ${escapeXml(generated)}</text>
  <text x="${margin}" y="126" class="subtitle">${escapeXml(truncateText(weights, 132))}</text>
  <rect x="${margin}" y="${titleHeight}" width="${width - margin * 2}" height="${tableHeaderHeight}" fill="#26312c" />
  <text x="${columns.rank}" y="${titleHeight + 28}" class="head">名次</text>
  <text x="${columns.school}" y="${titleHeight + 28}" class="head">大学</text>
  <text x="${columns.country}" y="${titleHeight + 28}" class="head">国家/地区</text>
  <text x="${columns.score}" y="${titleHeight + 28}" class="head">自定义分数</text>
  <text x="${columns.avgRank}" y="${titleHeight + 28}" class="head">${escapeXml(dataset.avgRankLabel)}</text>
  <text x="${columns.reference}" y="${titleHeight + 28}" class="head">${escapeXml(dataset.referenceScoreLabel)}</text>
${rowMarkup}
</svg>`;
  }

  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportRankingSvg() {
    const entry = activeState();
    if (!entry.ranking) return;
    const rows = getFilteredRows();
    if (rows.length === 0) {
      elements.weightStatus.dataset.state = "changed";
      elements.weightStatus.textContent = "当前筛选没有可导出的排名。";
      return;
    }

    const dataset = activeDataset();
    const svg = buildRankingSvg(rows);
    downloadTextFile(`my-world-university-ranking-${dataset.id}.svg`, svg, "image/svg+xml;charset=utf-8");
    elements.exportSvgButton.textContent = "已导出SVG";
    window.setTimeout(() => {
      elements.exportSvgButton.textContent = "导出筛选SVG";
    }, 1400);
  }

  function populateFilters() {
    const dataset = activeDataset();
    const countries = [...new Set(dataset.universities.map((university) => university.country))].sort((a, b) =>
      a.localeCompare(b),
    );
    const regions = [...new Set(dataset.universities.map((university) => university.region))].sort((a, b) =>
      a.localeCompare(b),
    );

    elements.countryFilter.innerHTML =
      '<option value="all">全部国家/地区</option>' +
      countries.map((country) => `<option value="${escapeAttribute(country)}">${escapeHtml(country)}</option>`).join("");
    elements.regionFilter.innerHTML =
      '<option value="all">全部区域</option>' +
      regions.map((region) => `<option value="${escapeAttribute(region)}">${escapeHtml(region)}</option>`).join("");
  }

  function renderWeightControls() {
    const dataset = activeDataset();
    const entry = activeState();
    const step = dataset.weightStep ?? 1;
    elements.weightForm.innerHTML = dataset.indicators
      .map((indicator, index) => {
        const id = `weight-${dataset.id}-${indicator.slug}`;
        const rangeId = `${id}-range`;
        return `<div class="weight-row">
          <label class="weight-name" for="${rangeId}">
            <strong>${escapeHtml(indicator.labelZh)}</strong>
            <span>${escapeHtml(indicator.labelEn)}</span>
          </label>
          <input
            class="weight-slider"
            id="${rangeId}"
            type="range"
            min="0"
            max="100"
            step="${step}"
            value="${formatWeight(entry.weights[index])}"
            data-index="${index}"
            aria-label="${escapeAttribute(`${indicator.labelZh}权重滑条`)}"
          />
          <label class="number-wrap" for="${id}">
            <input
              class="weight-number"
              id="${id}"
              type="number"
              inputmode="decimal"
              min="0"
              max="100"
              step="${step}"
              value="${formatWeight(entry.weights[index])}"
              data-index="${index}"
              aria-label="${escapeAttribute(`${indicator.labelZh}权重百分比`)}"
            />
            <span class="percent-sign">%</span>
          </label>
        </div>`;
      })
      .join("");
  }

  function renderTabs() {
    const savedCount = savedDatasetIds().length;
    const homeTab = {
      id: HOME_ID,
      shortName: "我的主页",
      universities: [],
      indicators: datasets,
      sublabel: `已保存 ${savedCount}/4`,
    };
    elements.rankerTabs.innerHTML = [homeTab, ...datasets]
      .map((dataset) => {
        const selected = dataset.id === state.activeDatasetId;
        const sublabel = dataset.sublabel ?? `${dataset.universities.length}所 · ${dataset.indicators.length}指标`;
        return `<button
          type="button"
          class="ranker-tab"
          data-dataset="${escapeAttribute(dataset.id)}"
          aria-current="${selected ? "page" : "false"}"
        >
          <strong>${escapeHtml(dataset.shortName)}</strong>
          <span>${escapeHtml(sublabel)}</span>
        </button>`;
      })
      .join("");
  }

  function renderHomeSaveStatus() {
    const dataset = activeDataset();
    if (!dataset.isHome) {
      elements.homeSaveStatus.hidden = true;
      elements.homeSaveStatus.innerHTML = "";
      return;
    }

    elements.homeSaveStatus.hidden = false;
    elements.homeSaveStatus.innerHTML = datasets
      .map((item) => {
        const saved = state.savedRankings[item.id];
        const status = saved ? `已保存 ${new Date(saved.savedAt).toLocaleString("zh-CN")}` : "未保存";
        return `<div class="save-status-row" data-state="${saved ? "saved" : "missing"}">
          <strong>${escapeHtml(item.shortName)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>`;
      })
      .join("");
  }

  function updateDatasetChrome() {
    const dataset = activeDataset();
    const entry = activeState();
    elements.datasetEyebrow.textContent = dataset.eyebrow;
    elements.summaryUniversityCount.textContent = String(dataset.universities.length);
    elements.summaryIndicatorCount.textContent = String(dataset.indicators.length);
    elements.summaryWeightTotal.textContent = `${formatWeight(entry.weights.reduce((sum, weight) => sum + weight, 0))}%`;
    elements.resetWeightsButton.textContent = dataset.resetLabel;
    elements.resultTitle.textContent = `${dataset.shortName}完整排名`;
    elements.avgRankHeader.textContent = dataset.avgRankLabel;
    elements.referenceScoreHeader.textContent = dataset.referenceScoreLabel;
    elements.avgRankSortOption.textContent = dataset.avgRankLabel;
    elements.referenceSortOption.textContent = dataset.referenceScoreLabel;
    elements.sourceLabel.textContent = `Source: ${dataset.sourceLabel}`;
    elements.generatedAt.textContent = `Generated: ${new Date(data.generatedAt).toLocaleString("zh-CN")}`;
    renderHomeSaveStatus();
    updateSaveButtonState();
  }

  function restoreControlValues() {
    const entry = activeState();
    elements.searchInput.value = entry.search;
    elements.countryFilter.value = entry.country;
    elements.regionFilter.value = entry.region;
    elements.sortSelect.value = entry.sort;
    elements.pageSizeSelect.value = entry.pageSize;
  }

  function renderActiveDataset() {
    const entry = activeState();
    renderTabs();
    updateDatasetChrome();
    renderWeightControls();
    populateFilters();
    restoreControlValues();
    updateWeightState({ preserveStatus: true });
    setRankingVisibility(Boolean(entry.ranking));
    if (entry.ranking) renderRanking();
    updateUrl();
  }

  function switchDataset(datasetId) {
    if ((datasetId !== HOME_ID && !datasetById.has(datasetId)) || datasetId === state.activeDatasetId) return;
    state.activeDatasetId = datasetId;
    renderActiveDataset();
  }

  function bindEvents() {
    elements.rankerTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dataset]");
      if (!button) return;
      switchDataset(button.dataset.dataset);
    });

    elements.weightForm.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const index = Number(target.dataset.index);
      if (!Number.isInteger(index)) return;

      const nextValue = target.value;
      if (target.classList.contains("weight-slider")) {
        getNumberInputs()[index].value = nextValue;
      } else if (target.classList.contains("weight-number") && nextValue !== "") {
        const numeric = Number(nextValue);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
          getRangeInputs()[index].value = formatWeight(numeric);
        }
      }
      updateWeightState();
    });

    elements.resetWeightsButton.addEventListener("click", () => {
      const dataset = activeDataset();
      setWeights(dataset.indicators.map((indicator) => indicator.defaultWeight));
      clearRanking();
      updateUrl();
    });

    elements.generateRankingButton.addEventListener("click", generateRanking);
    elements.saveHomeButton.addEventListener("click", saveActiveRankingToHome);
    elements.exportSvgButton.addEventListener("click", exportRankingSvg);

    elements.searchInput.addEventListener("input", () => {
      const entry = activeState();
      entry.search = elements.searchInput.value;
      entry.page = 1;
      renderRanking();
    });

    elements.countryFilter.addEventListener("change", () => {
      const entry = activeState();
      entry.country = elements.countryFilter.value;
      entry.page = 1;
      renderRanking();
    });

    elements.regionFilter.addEventListener("change", () => {
      const entry = activeState();
      entry.region = elements.regionFilter.value;
      entry.page = 1;
      renderRanking();
    });

    elements.sortSelect.addEventListener("change", () => {
      const entry = activeState();
      entry.sort = elements.sortSelect.value;
      entry.page = 1;
      renderRanking();
    });

    elements.pageSizeSelect.addEventListener("change", () => {
      const entry = activeState();
      entry.pageSize = elements.pageSizeSelect.value;
      entry.page = 1;
      renderRanking();
    });

    elements.prevPageButton.addEventListener("click", () => {
      const entry = activeState();
      entry.page = Math.max(1, entry.page - 1);
      renderRanking();
    });

    elements.nextPageButton.addEventListener("click", () => {
      const entry = activeState();
      entry.page += 1;
      renderRanking();
    });
  }

  function init() {
    renderTabs();
    updateDatasetChrome();
    renderWeightControls();
    populateFilters();
    bindEvents();

    const dataset = activeDataset();
    const urlWeights = parseUrlWeights(dataset);
    if (urlWeights.status === "valid") {
      setWeights(urlWeights.weights);
      generateRanking();
    } else {
      updateWeightState();
      if (urlWeights.status === "invalid") {
        elements.weightStatus.dataset.state = "invalid";
        elements.weightStatus.textContent = "URL 权重无效，已回到当前榜单默认权重。";
        clearRanking();
      }
      updateUrl();
    }
  }

  init();
})();
