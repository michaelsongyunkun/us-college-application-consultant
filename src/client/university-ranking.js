import {
  DEFAULT_RANKING_PAGE_SIZE,
  HOME_DATASET_ID,
  buildHomeDataset,
  buildRanking,
  createSavedRankingSnapshot,
  defaultStateForDataset,
  defaultStateForHome,
  filterRankingRows,
  formatNumber,
  formatRank,
  formatWeight,
  getFilterOptions,
  getFilteredRankingRows,
  getRankingPage,
  homeIsReady,
  missingSavedDatasets,
  parseUrlWeights,
  savedDatasetIds,
  validateWeights,
  weightsKey,
} from "../domain/university-ranking.mjs?v=20260622-university-ranking";

const data = window.UNIVERSITY_RANKING_DATA;

const elements = {
  tabList: document.querySelector("#rankingDatasetTabs"),
  weightForm: document.querySelector("#rankingWeightForm"),
  weightTotal: document.querySelector("#rankingWeightTotal"),
  weightStatus: document.querySelector("#rankingWeightStatus"),
  resetButton: document.querySelector("#resetRankingWeightsButton"),
  generateButton: document.querySelector("#generateRankingButton"),
  saveHomeButton: document.querySelector("#saveRankingHomeButton"),
  exportSvgButton: document.querySelector("#exportRankingSvgButton"),
  homeSaveStatus: document.querySelector("#rankingHomeSaveStatus"),
  workspace: document.querySelector("#rankingWorkspace"),
  meta: document.querySelector("#rankingMeta"),
  searchInput: document.querySelector("#rankingSearchInput"),
  countryFilter: document.querySelector("#rankingCountryFilter"),
  regionFilter: document.querySelector("#rankingRegionFilter"),
  sortSelect: document.querySelector("#rankingSortSelect"),
  avgRankSortOption: document.querySelector("#avgRankSortOption"),
  referenceSortOption: document.querySelector("#referenceSortOption"),
  avgRankHeader: document.querySelector("#avgRankHeader"),
  referenceScoreHeader: document.querySelector("#referenceScoreHeader"),
  tableBody: document.querySelector("#rankingTableBody"),
  pageSizeSelect: document.querySelector("#rankingPageSizeSelect"),
  prevPageButton: document.querySelector("#rankingPrevPageButton"),
  nextPageButton: document.querySelector("#rankingNextPageButton"),
  paginationInfo: document.querySelector("#rankingPaginationInfo"),
  summaryUniversityCount: document.querySelector("#summaryUniversityCount"),
  summaryIndicatorCount: document.querySelector("#summaryIndicatorCount"),
  summaryDatasetCount: document.querySelector("#summaryDatasetCount"),
  resultTitle: document.querySelector("#rankingResultTitle"),
};

if (!data?.datasets?.length) {
  elements.weightStatus.textContent = "大学排名数据暂不可用。";
  elements.weightStatus.classList.add("error");
  elements.generateButton.disabled = true;
} else {
  init();
}

function init() {
  const datasets = data.datasets;
  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const params = new URLSearchParams(window.location.search);
  const initialDatasetId =
    params.get("dataset") === HOME_DATASET_ID || datasetById.has(params.get("dataset"))
      ? params.get("dataset")
      : HOME_DATASET_ID;
  const state = {
    activeDatasetId: initialDatasetId,
    savedRankings: loadSavedRankings(),
    byDataset: new Map([
      [HOME_DATASET_ID, defaultStateForHome(datasets)],
      ...datasets.map((dataset) => [dataset.id, defaultStateForDataset(dataset)]),
    ]),
  };

  function activeDataset() {
    if (state.activeDatasetId === HOME_DATASET_ID) return buildHomeDataset(datasets, state.savedRankings);
    return datasetById.get(state.activeDatasetId);
  }

  function activeState() {
    return state.byDataset.get(state.activeDatasetId);
  }

  function loadSavedRankings() {
    try {
      const raw = window.localStorage.getItem("collegeCompass.universityRanking.savedRankings.v1");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function persistSavedRankings() {
    window.localStorage.setItem(
      "collegeCompass.universityRanking.savedRankings.v1",
      JSON.stringify(state.savedRankings),
    );
  }

  function getNumberInputs() {
    return [...elements.weightForm.querySelectorAll(".ranking-weight-number")];
  }

  function getRangeInputs() {
    return [...elements.weightForm.querySelectorAll(".ranking-weight-slider")];
  }

  function collectWeights() {
    const weights = getNumberInputs().map((input) => {
      const value = input.value.trim();
      return value === "" ? NaN : Number(value);
    });
    const validation = validateWeights(weights, activeDataset().indicators.length);
    return { ...validation, weights };
  }

  function validationMessage(result) {
    if (result.reason === "length") return "权重控件尚未完整加载。";
    if (result.reason === "number") return "所有权重都需要填写为数字。";
    if (result.reason === "range") return "单项权重需要在 0% 到 100% 之间。";
    if (result.reason === "total") {
      const diff = Math.round((100 - result.total) * 100) / 100;
      return diff > 0
        ? `权重合计 ${formatWeight(result.total)}%，还差 ${formatWeight(diff)}%。`
        : `权重合计 ${formatWeight(result.total)}%，超出 ${formatWeight(Math.abs(diff))}%。`;
    }
    return "权重有效，可以生成完整排名。";
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
    elements.workspace.hidden = !isVisible;
    elements.exportSvgButton.disabled = !isVisible;
    updateSaveButtonState();
  }

  function clearRanking() {
    const entry = activeState();
    entry.ranking = null;
    entry.generatedWeightsKey = "";
    entry.page = 1;
    elements.tableBody.innerHTML = "";
    elements.meta.textContent = "";
    elements.paginationInfo.textContent = "";
    setRankingVisibility(false);
  }

  function updateSaveButtonState() {
    const dataset = activeDataset();
    const entry = activeState();
    elements.saveHomeButton.hidden = Boolean(dataset.isHome);
    elements.saveHomeButton.disabled = Boolean(dataset.isHome || !entry.ranking);
  }

  function updateWeightState({ preserveStatus = false } = {}) {
    const dataset = activeDataset();
    const entry = activeState();
    const result = collectWeights();
    elements.weightTotal.textContent = `合计 ${formatWeight(result.total)}%`;
    elements.summaryDatasetCount.textContent = String(datasets.length);
    elements.generateButton.disabled = !result.valid;

    if (!result.valid) {
      elements.weightTotal.dataset.state = "invalid";
      elements.weightStatus.textContent = validationMessage(result);
      elements.weightStatus.classList.add("error");
      clearRanking();
      return result;
    }

    if (dataset.isHome && !homeIsReady(datasets, state.savedRankings)) {
      const missing = missingSavedDatasets(datasets, state.savedRankings).map((item) => item.shortName).join("、");
      elements.weightTotal.dataset.state = "invalid";
      elements.weightStatus.textContent = `还需要先保存：${missing}`;
      elements.weightStatus.classList.add("error");
      elements.generateButton.disabled = true;
      clearRanking();
      return { ...result, valid: false };
    }

    elements.weightTotal.dataset.state = "valid";
    elements.weightStatus.classList.remove("error");
    const currentKey = weightsKey(result.weights);
    const isStale = entry.ranking && currentKey !== entry.generatedWeightsKey;
    if (isStale && !preserveStatus) {
      elements.weightStatus.textContent = "权重已修改，需要重新生成完整排名。";
      clearRanking();
    } else {
      elements.weightStatus.textContent = validationMessage(result);
    }
    return result;
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

  function filtersForEntry() {
    const entry = activeState();
    return {
      query: entry.search,
      country: entry.country,
      region: entry.region,
      sort: entry.sort,
    };
  }

  function visibleRows() {
    const dataset = activeDataset();
    const entry = activeState();
    if (!entry.ranking) return [];
    return getFilteredRankingRows(dataset, entry.ranking, filtersForEntry());
  }

  function renderIndicatorDetails(university) {
    const dataset = activeDataset();
    const scores = dataset.indicators
      .map((indicator) => {
        const value = university.indicatorScores[indicator.slug];
        return `<div class="ranking-indicator-score">
          <span><strong>${escapeHtml(indicator.labelZh)}</strong><em>${escapeHtml(indicator.labelEn)}</em></span>
          <b>${formatNumber(value)}</b>
        </div>`;
      })
      .join("");
    const ranks = Object.entries(university.sourceRanks || {})
      .map(
        ([year, rank]) => `<div class="ranking-source-rank">
          <span>${escapeHtml(year)}</span>
          <b>${escapeHtml(rank || "--")}</b>
        </div>`,
      )
      .join("");
    return `${scores}<div class="ranking-source-ranks" aria-label="来源榜单名次">${ranks}</div>`;
  }

  function renderRanking() {
    const dataset = activeDataset();
    const entry = activeState();
    if (!entry.ranking) return;

    const rows = visibleRows();
    const page = getRankingPage(rows, { page: entry.page, pageSize: entry.pageSize });
    entry.page = page.page;
    elements.meta.textContent = `完整排名 ${entry.ranking.length} 所，当前筛选 ${rows.length} 所。`;
    elements.prevPageButton.disabled = entry.page <= 1 || entry.pageSize === "all";
    elements.nextPageButton.disabled = entry.page >= page.totalPages || entry.pageSize === "all";
    elements.paginationInfo.textContent =
      entry.pageSize === "all"
        ? `显示全部 ${rows.length} 所`
        : `第 ${entry.page} / ${page.totalPages} 页，显示 ${page.start}-${page.end} / ${rows.length} 所`;

    if (!rows.length) {
      elements.tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">没有匹配结果。</td></tr>';
      return;
    }

    elements.tableBody.innerHTML = page.rows.map((row) => renderRankingRow(dataset, row)).join("");
  }

  function renderRankingRow(dataset, row) {
    const university = row.university;
    const location = [university.city, university.region].filter(Boolean).join(" / ");
    const externalUrl = university.externalUrl || dataset.sourceUrl;
    const avgRankValue = dataset.isHome ? `${university.coverage}/${datasets.length}` : formatRank(university.avgRank);
    const sourceCell = dataset.isHome
      ? '<span class="muted-link">本地</span>'
      : `<a href="${escapeAttribute(externalUrl)}" target="_blank" rel="noreferrer">${escapeHtml(dataset.shortName)}</a>`;
    return `<tr>
      <td class="rank-cell">#${row.customRank}</td>
      <td class="school-cell">
        <span class="school-name">${escapeHtml(university.officialChineseName || university.university)}</span>
        <span class="school-name-en">${escapeHtml(university.university)}</span>
        <span class="school-location">${escapeHtml(location)}</span>
        <details class="ranking-indicator-details">
          <summary>${escapeHtml(dataset.detailsSummary)}</summary>
          <div class="ranking-indicator-grid">${renderIndicatorDetails(university)}</div>
        </details>
      </td>
      <td>${escapeHtml(university.country)}</td>
      <td class="numeric-cell">${formatNumber(row.customScore)}</td>
      <td class="numeric-cell">${escapeHtml(avgRankValue)}</td>
      <td class="numeric-cell">${formatNumber(university.referenceScore)}</td>
      <td>${sourceCell}</td>
    </tr>`;
  }

  function generateRanking() {
    const dataset = activeDataset();
    const entry = activeState();
    const result = updateWeightState();
    if (!result.valid) return;

    entry.weights = [...result.weights];
    entry.ranking = buildRanking(dataset, entry.weights);
    entry.generatedWeightsKey = weightsKey(entry.weights);
    entry.search = "";
    entry.country = "all";
    entry.region = "all";
    entry.sort = "rank";
    entry.page = 1;
    restoreFilterValues();
    elements.weightStatus.textContent = "完整排名已生成。";
    setRankingVisibility(true);
    updateUrl();
    renderRanking();
  }

  function saveActiveRankingToHome() {
    const dataset = activeDataset();
    const entry = activeState();
    if (dataset.isHome || !entry.ranking) return;

    state.savedRankings[dataset.id] = createSavedRankingSnapshot(dataset, entry);
    const homeState = state.byDataset.get(HOME_DATASET_ID);
    homeState.ranking = null;
    homeState.generatedWeightsKey = "";
    homeState.page = 1;
    persistSavedRankings();
    renderTabs();
    renderHomeSaveStatus();
    updateSaveButtonState();
    elements.weightStatus.textContent = `${dataset.shortName} 已保存到我的主页。`;
    elements.saveHomeButton.textContent = "已保存";
    window.setTimeout(() => {
      elements.saveHomeButton.textContent = "保存到我的主页";
    }, 1400);
  }

  function populateFilters() {
    const { countries, regions } = getFilterOptions(activeDataset());
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
        const id = `ranking-weight-${dataset.id}-${indicator.slug}`;
        const rangeId = `${id}-range`;
        return `<div class="ranking-weight-row">
          <label class="ranking-weight-name" for="${rangeId}">
            <strong>${escapeHtml(indicator.labelZh)}</strong>
            <span>${escapeHtml(indicator.labelEn)}</span>
          </label>
          <input
            class="ranking-weight-slider"
            id="${rangeId}"
            type="range"
            min="0"
            max="100"
            step="${step}"
            value="${formatWeight(entry.weights[index])}"
            data-index="${index}"
            aria-label="${escapeAttribute(`${indicator.labelZh}权重滑杆`)}"
          />
          <label class="ranking-number-wrap" for="${id}">
            <input
              class="ranking-weight-number"
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
            <span>%</span>
          </label>
        </div>`;
      })
      .join("");
  }

  function renderTabs() {
    const savedCount = savedDatasetIds(datasets, state.savedRankings).length;
    const homeTab = {
      id: HOME_DATASET_ID,
      shortName: "我的主页",
      sublabel: `已保存 ${savedCount}/${datasets.length}`,
    };
    elements.tabList.innerHTML = [homeTab, ...datasets]
      .map((dataset) => {
        const selected = dataset.id === state.activeDatasetId;
        const sublabel = dataset.sublabel ?? `${dataset.universities?.length || 0} 所 / ${dataset.indicators?.length || datasets.length} 指标`;
        return `<button
          type="button"
          class="resource-tab ranking-tab${selected ? " is-active" : ""}"
          data-ranking-dataset="${escapeAttribute(dataset.id)}"
          role="tab"
          aria-selected="${selected ? "true" : "false"}"
          aria-current="${selected ? "page" : "false"}"
        ><strong>${escapeHtml(dataset.shortName)}</strong><span>${escapeHtml(sublabel)}</span></button>`;
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
        return `<div class="ranking-save-status-row" data-state="${saved ? "saved" : "missing"}">
          <strong>${escapeHtml(item.shortName)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>`;
      })
      .join("");
  }

  function updateDatasetChrome() {
    const dataset = activeDataset();
    const entry = activeState();
    elements.summaryUniversityCount.textContent = String(dataset.universities.length);
    elements.summaryIndicatorCount.textContent = String(dataset.indicators.length);
    elements.summaryDatasetCount.textContent = String(datasets.length);
    elements.resetButton.textContent = dataset.resetLabel;
    elements.resultTitle.textContent = `${dataset.shortName}完整排名`;
    elements.avgRankHeader.textContent = dataset.avgRankLabel;
    elements.referenceScoreHeader.textContent = dataset.referenceScoreLabel;
    elements.avgRankSortOption.textContent = dataset.avgRankLabel;
    elements.referenceSortOption.textContent = dataset.referenceScoreLabel;
    elements.weightTotal.textContent = `合计 ${formatWeight(entry.weights.reduce((sum, weight) => sum + weight, 0))}%`;
    renderHomeSaveStatus();
    updateSaveButtonState();
  }

  function restoreFilterValues() {
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
    restoreFilterValues();
    updateWeightState({ preserveStatus: true });
    setRankingVisibility(Boolean(entry.ranking));
    if (entry.ranking) renderRanking();
    updateUrl();
  }

  function switchDataset(datasetId) {
    if ((datasetId !== HOME_DATASET_ID && !datasetById.has(datasetId)) || datasetId === state.activeDatasetId) {
      return;
    }
    state.activeDatasetId = datasetId;
    renderActiveDataset();
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
      .join(" / ");
    const generated = new Date().toLocaleString("zh-CN");
    const rowMarkup = rows
      .map((row, index) => {
        const y = titleHeight + tableHeaderHeight + index * rowHeight;
        const university = row.university;
        const fill = index % 2 === 0 ? "#ffffff" : "#fbfaf5";
        const avgRankValue = dataset.isHome ? `${university.coverage}/${datasets.length}` : formatRank(university.avgRank);
        return `<g>
  <rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${rowHeight}" fill="${fill}" />
  <text x="${columns.rank}" y="${y + 35}" class="rank">#${row.customRank}</text>
  <text x="${columns.school}" y="${y + 24}" class="school">${escapeXml(truncateText(university.officialChineseName || university.university, 28))}</text>
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
    .title { font: 800 34px "Microsoft YaHei", Arial, sans-serif; fill: #1e241f; }
    .subtitle { font: 500 16px "Microsoft YaHei", Arial, sans-serif; fill: #5f6b63; }
    .head { font: 800 15px "Microsoft YaHei", Arial, sans-serif; fill: #ffffff; }
    .rank { font: 900 18px "Microsoft YaHei", Arial, sans-serif; fill: #1e241f; }
    .school { font: 800 17px "Microsoft YaHei", Arial, sans-serif; fill: #1e241f; }
    .body { font: 500 16px "Microsoft YaHei", Arial, sans-serif; fill: #1e241f; }
    .muted { font: 500 13px "Microsoft YaHei", Arial, sans-serif; fill: #5f6b63; }
    .number { font: 700 16px "Microsoft YaHei", Arial, sans-serif; fill: #1e241f; }
  </style>
  <rect width="${width}" height="${height}" fill="#fbfaf5" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="8" fill="#ffffff" stroke="#e1ddd4" />
  <text x="${margin}" y="70" class="title">大学排名 / ${escapeXml(dataset.shortName)}</text>
  <text x="${margin}" y="102" class="subtitle">当前导出 ${rows.length} 所 / ${escapeXml(generated)}</text>
  <text x="${margin}" y="126" class="subtitle">${escapeXml(truncateText(weights, 132))}</text>
  <rect x="${margin}" y="${titleHeight}" width="${width - margin * 2}" height="${tableHeaderHeight}" fill="#20493b" />
  <text x="${columns.rank}" y="${titleHeight + 28}" class="head">名次</text>
  <text x="${columns.school}" y="${titleHeight + 28}" class="head">大学</text>
  <text x="${columns.country}" y="${titleHeight + 28}" class="head">国家/地区</text>
  <text x="${columns.score}" y="${titleHeight + 28}" class="head">自定义分</text>
  <text x="${columns.avgRank}" y="${titleHeight + 28}" class="head">${escapeXml(dataset.avgRankLabel)}</text>
  <text x="${columns.reference}" y="${titleHeight + 28}" class="head">${escapeXml(dataset.referenceScoreLabel)}</text>
${rowMarkup}
</svg>`;
  }

  function exportRankingSvg() {
    const entry = activeState();
    if (!entry.ranking) return;
    const rows = visibleRows();
    if (!rows.length) {
      elements.weightStatus.textContent = "当前筛选没有可导出的排名。";
      elements.weightStatus.classList.add("error");
      return;
    }
    const svg = buildRankingSvg(rows);
    downloadTextFile(`college-compass-university-ranking-${activeDataset().id}.svg`, svg, "image/svg+xml;charset=utf-8");
    elements.exportSvgButton.textContent = "已导出 SVG";
    window.setTimeout(() => {
      elements.exportSvgButton.textContent = "导出筛选 SVG";
    }, 1400);
  }

  function bindEvents() {
    elements.tabList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ranking-dataset]");
      if (button) switchDataset(button.dataset.rankingDataset);
    });

    elements.weightForm.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const index = Number(target.dataset.index);
      if (!Number.isInteger(index)) return;
      const value = target.value;
      if (target.classList.contains("ranking-weight-slider")) {
        getNumberInputs()[index].value = value;
      } else if (target.classList.contains("ranking-weight-number") && value !== "") {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
          getRangeInputs()[index].value = formatWeight(numeric);
        }
      }
      updateWeightState();
    });

    elements.resetButton.addEventListener("click", () => {
      const dataset = activeDataset();
      setWeights(dataset.indicators.map((indicator) => indicator.defaultWeight));
      clearRanking();
      updateUrl();
    });
    elements.generateButton.addEventListener("click", generateRanking);
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
      entry.pageSize = elements.pageSizeSelect.value || DEFAULT_RANKING_PAGE_SIZE;
      entry.page = 1;
      renderRanking();
    });
    elements.prevPageButton.addEventListener("click", () => {
      activeState().page = Math.max(1, activeState().page - 1);
      renderRanking();
    });
    elements.nextPageButton.addEventListener("click", () => {
      activeState().page += 1;
      renderRanking();
    });
  }

  renderTabs();
  updateDatasetChrome();
  renderWeightControls();
  populateFilters();
  bindEvents();

  const dataset = activeDataset();
  const entry = activeState();
  const urlWeights = parseUrlWeights(params.get("w"), dataset.indicators.length);
  if (urlWeights.status === "valid") {
    entry.weights = urlWeights.weights;
    renderWeightControls();
    setWeights(urlWeights.weights);
    generateRanking();
  } else {
    updateWeightState();
    if (urlWeights.status === "invalid") {
      elements.weightStatus.textContent = "URL 权重无效，已回到当前榜单默认权重。";
      elements.weightStatus.classList.add("error");
      clearRanking();
    }
    updateUrl();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
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
