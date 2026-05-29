const adminUserBadge = document.querySelector("#adminUserBadge");
const adminLogoutButton = document.querySelector("#adminLogoutButton");
const downloadExcelButton = document.querySelector("#downloadExcelButton");
const dashboardFilters = document.querySelector("#dashboardFilters");
const behaviorFilters = document.querySelector("#behaviorFilters");
const securityFilters = document.querySelector("#securityFilters");
const dashboardStatus = document.querySelector("#dashboardStatus");
const userSummaryBody = document.querySelector("#userSummaryBody");
const loginEventsBody = document.querySelector("#loginEventsBody");
const dailyActivityList = document.querySelector("#dailyActivityList");
const weeklyActivityList = document.querySelector("#weeklyActivityList");
const usageSummaryList = document.querySelector("#usageSummaryList");
const usageEventsBody = document.querySelector("#usageEventsBody");
const feedbackEntriesBody = document.querySelector("#feedbackEntriesBody");
const metricActiveUsers = document.querySelector("#metricActiveUsers");
const metricPlanGenerations = document.querySelector("#metricPlanGenerations");
const metricWordExports = document.querySelector("#metricWordExports");
const metricRecommendationRefreshes = document.querySelector("#metricRecommendationRefreshes");
const metricFailedLogins = document.querySelector("#metricFailedLogins");
const adminTabs = [...document.querySelectorAll("[data-admin-tab]")];
const adminPanels = [...document.querySelectorAll("[data-admin-panel]")];
let latestDashboard = null;
let activeTab = "behavior";

const usageEventLabels = {
  parse_codex_answer: "解析 Codex 回答进表格",
  parse_codex_failure: "解析 Codex 失败",
  export_json: "导出 JSON",
  export_word: "导出 Word",
  save_draft: "保存草稿",
  clear_draft: "清空草稿",
  generate_plan_success: "解析 Codex 回答进表格成功",
  generate_plan_failure: "解析 Codex 回答进表格失败",
  build_codex_task: "生成 Codex 任务包",
  copy_codex_task: "复制 Codex 任务包",
  refresh_competitions: "竞赛换一批",
  refresh_summer_schools: "夏校换一批",
  refresh_case_matches: "案例换一批",
  course_helper_visit: "访问选课辅助器",
  refresh_ap_recommendations: "重新生成 AP 推荐",
  data_load_failure: "数据加载失败",
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value) {
  if (!value) return "从未登录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function compactDevice(userAgent, ipAddress) {
  const ua = userAgent ? userAgent.split(" ").slice(0, 4).join(" ") : "-";
  return `${ua} / ${ipAddress || "-"}`;
}

function technicalDetails(event) {
  return `
    <details class="technical-details">
      <summary>查看</summary>
      <p>浏览器 / IP：${escapeHtml(compactDevice(event.userAgent, event.ipAddress))}</p>
      ${event.userEmail ? `<p>邮箱：${escapeHtml(event.userEmail)}</p>` : ""}
    </details>
  `;
}

function renderUsers(users) {
  if (!users.length) {
    userSummaryBody.innerHTML = '<tr><td colspan="4">暂无匹配用户</td></tr>';
    return;
  }
  userSummaryBody.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${user.loginCount || 0}</td>
          <td>${formatDateTime(user.lastLoginAt)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderEvents(events) {
  if (!events.length) {
    loginEventsBody.innerHTML = '<tr><td colspan="5">暂无登录记录</td></tr>';
    return;
  }
  loginEventsBody.innerHTML = events
    .map(
      (event) => `
        <tr>
          <td>${formatDateTime(event.occurredAt)}</td>
          <td><span class="status-pill ${event.status}">${event.status === "success" ? "成功" : "失败"}</span></td>
          <td>${escapeHtml(event.userName || "-")}</td>
          <td>${escapeHtml(event.failureReason || "-")}</td>
          <td>${technicalDetails(event)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderActivity(container, items, keyName) {
  if (!items.length) {
    container.innerHTML = '<p class="case-notice">暂无数据</p>';
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="metric-row">
          <span>${escapeHtml(item[keyName])}</span>
          <strong>${item.status === "success" ? "成功" : "失败"} ${item.count}</strong>
        </div>
      `,
    )
    .join("");
}

function renderUsageSummary(items) {
  if (!items.length) {
    usageSummaryList.innerHTML = '<p class="case-notice">当前范围暂无行为记录</p>';
    return;
  }
  usageSummaryList.innerHTML = items
    .map(
      (item) => `
        <div class="metric-row">
          <span>${usageEventLabels[item.eventType] || escapeHtml(item.eventType)}</span>
          <strong>${item.count}</strong>
        </div>
      `,
    )
    .join("");
}

function usageOutcome(event) {
  return event.generatedActivityCount || event.filledActivityCount || event.completionFields || "-";
}

function renderUsageEvents(events) {
  if (!events.length) {
    usageEventsBody.innerHTML = '<tr><td colspan="6">暂无关键操作记录</td></tr>';
    return;
  }
  usageEventsBody.innerHTML = events
    .map(
      (event) => `
        <tr>
          <td>${formatDateTime(event.occurredAt)}</td>
          <td>${usageEventLabels[event.eventType] || escapeHtml(event.eventType)}</td>
          <td>${escapeHtml(event.userName || "-")}</td>
          <td>${escapeHtml([event.grade, event.majorDirection].filter(Boolean).join(" / ") || "-")}</td>
          <td>${usageOutcome(event)}</td>
          <td>${technicalDetails(event)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderFeedbackEntries(entries) {
  if (!entries.length) {
    feedbackEntriesBody.innerHTML = '<tr><td colspan="7">暂无建议反馈</td></tr>';
    return;
  }
  feedbackEntriesBody.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${formatDateTime(entry.createdAt)}</td>
          <td>${escapeHtml(entry.issueType)}</td>
          <td>${escapeHtml(entry.pageName)}</td>
          <td>
            <strong>${escapeHtml(entry.userName || "未登录用户")}</strong>
            <p class="admin-table-note">${escapeHtml(entry.contact || entry.userEmail || "-")}</p>
          </td>
          <td>${escapeHtml(entry.description)}</td>
          <td>${escapeHtml(entry.steps || "-")}</td>
          <td>${technicalDetails(entry)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderOverview(dashboard) {
  const overview = dashboard.overview || {};
  metricActiveUsers.textContent = overview.activeUsers || 0;
  metricPlanGenerations.textContent = overview.planGenerations || 0;
  metricWordExports.textContent = overview.wordExports || 0;
  metricRecommendationRefreshes.textContent = overview.recommendationRefreshes || 0;
  metricFailedLogins.textContent = overview.failedLogins || 0;
}

function buildDashboardUrl() {
  const params = new URLSearchParams(new FormData(dashboardFilters));
  for (const form of [behaviorFilters, securityFilters]) {
    for (const [key, value] of new FormData(form).entries()) {
      if (value) params.set(key, value);
    }
  }
  for (const [key, value] of [...params.entries()]) {
    if (!value) params.delete(key);
  }
  return `/api/admin/login-dashboard?${params.toString()}`;
}

async function loadDashboard() {
  dashboardStatus.textContent = "加载中";
  try {
    const dashboard = await requestJson(buildDashboardUrl());
    latestDashboard = dashboard;
    renderOverview(dashboard);
    renderUsers(dashboard.users || []);
    renderEvents(dashboard.events || []);
    renderActivity(dailyActivityList, dashboard.dailyActivity || [], "date");
    renderActivity(weeklyActivityList, dashboard.weeklyActivity || [], "week");
    renderUsageSummary(dashboard.usageSummary || []);
    renderUsageEvents(dashboard.usageEvents || []);
    renderFeedbackEntries(dashboard.feedbackEntries || []);
    dashboardStatus.textContent = "已更新";
    dashboardStatus.classList.remove("error");
  } catch (error) {
    dashboardStatus.textContent = error.message;
    dashboardStatus.classList.add("error");
    if (/admin|authenticated|权限|登录/i.test(error.message)) {
      window.location.href = "/";
    }
  }
}

function activateTab(tabName) {
  activeTab = tabName;
  for (const tab of adminTabs) {
    const selected = tab.dataset.adminTab === tabName;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  for (const panel of adminPanels) {
    const selected = panel.dataset.adminPanel === tabName;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  }
}

function makeExcelTable(title, headers, rows) {
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowsHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function activeExportTable() {
  if (activeTab === "users") {
    return makeExcelTable(
      "用户分析",
      ["名称", "邮箱", "累计登录", "最近登录"],
      (latestDashboard.users || []).map((user) => [
        user.name,
        user.email,
        user.loginCount || 0,
        formatDateTime(user.lastLoginAt),
      ]),
    );
  }
  if (activeTab === "security") {
    return makeExcelTable(
      "安全日志",
      ["时间", "状态", "用户", "邮箱", "浏览器/IP", "失败原因"],
      (latestDashboard.events || []).map((event) => [
        formatDateTime(event.occurredAt),
        event.status === "success" ? "成功" : "失败",
        event.userName || "-",
        event.userEmail || "-",
        compactDevice(event.userAgent, event.ipAddress),
        event.failureReason || "-",
      ]),
    );
  }
  if (activeTab === "feedback") {
    return makeExcelTable(
      "建议反馈",
      ["时间", "类型", "页面/功能", "用户", "邮箱", "联系方式", "问题描述", "复现步骤", "浏览器/IP"],
      (latestDashboard.feedbackEntries || []).map((entry) => [
        formatDateTime(entry.createdAt),
        entry.issueType,
        entry.pageName,
        entry.userName || "未登录用户",
        entry.userEmail || "-",
        entry.contact || "-",
        entry.description,
        entry.steps || "-",
        compactDevice(entry.userAgent, entry.ipAddress),
      ]),
    );
  }
  return makeExcelTable(
    "行为趋势",
    ["时间", "操作", "用户", "邮箱", "年级", "专业方向", "数量/完成度"],
    (latestDashboard.usageEvents || []).map((event) => [
      formatDateTime(event.occurredAt),
      usageEventLabels[event.eventType] || event.eventType,
      event.userName || "-",
      event.userEmail || "-",
      event.grade || "-",
      event.majorDirection || "-",
      usageOutcome(event),
    ]),
  );
}

function downloadDashboardExcel() {
  if (!latestDashboard) return;
  const html = `<html><head><meta charset="UTF-8" /></head><body>${activeExportTable()}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `数据看板-${activeTab}-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadCurrentAdmin() {
  try {
    const data = await requestJson("/api/auth/me");
    if (data.user?.role !== "admin") {
      window.location.href = "/";
      return;
    }
    adminUserBadge.textContent = `${data.user.name} (${data.user.role})`;
    await loadDashboard();
  } catch {
    window.location.href = "/";
  }
}

dashboardFilters.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard();
});
behaviorFilters.addEventListener("change", loadDashboard);
securityFilters.addEventListener("change", loadDashboard);
for (const tab of adminTabs) {
  tab.addEventListener("click", () => activateTab(tab.dataset.adminTab));
}
adminLogoutButton.addEventListener("click", async () => {
  await requestJson("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => ({}));
  window.location.href = "/";
});
downloadExcelButton.addEventListener("click", downloadDashboardExcel);

activateTab(activeTab);
loadCurrentAdmin();
