import {
  buildDashboardMetrics,
  identifyTaskState,
  normalizePlannerState,
  normalizeTask,
} from "../domain/progress-planner.mjs?v=20260605-planning-tracker";
import { csrfFetch } from "./csrf-token.mjs";

const PROGRESS_PLANNER_ENDPOINT = "/api/progress-planner";

const taskForm = document.querySelector("#planningTrackerForm");
const checkInForm = document.querySelector("#checkInForm");
const statusEl = document.querySelector("#planningTrackerStatus");
const saveStatusEl = document.querySelector("#progressSaveStatus");
const saveButton = document.querySelector("#saveProgressPlannerButton");
const taskList = document.querySelector("#progressTaskList");
const checkInList = document.querySelector("#checkInList");
const viewButtons = document.querySelectorAll("[data-progress-view]");
const nextFocusEl = document.querySelector("#progressNextFocus");
const todayRateEl = document.querySelector("#progressTodayRate");
const weekRateEl = document.querySelector("#progressWeekRate");
const riskCountEl = document.querySelector("#progressRiskCount");

let plannerState = { tasks: [], checkIns: [] };
let activeView = "all";
let isDirty = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function requestJson(url, options = {}) {
  const response = await csrfFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/?next=/planning-tracker.html";
    throw new Error("请先登录");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return todayString().slice(0, 7);
}

function currentWeekStart() {
  const date = new Date(`${todayString()}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function collectTaskInput() {
  const existingTask = plannerState.tasks.find((task) => task.id === fieldValue(taskForm, "taskId"));
  const status = fieldValue(taskForm, "status") || "待开始";
  const merged = {
    ...(existingTask || {}),
    title: fieldValue(taskForm, "title"),
    description: fieldValue(taskForm, "description"),
    periodType: fieldValue(taskForm, "periodType") || "day",
    targetDate: fieldValue(taskForm, "targetDate"),
    weekStart: fieldValue(taskForm, "weekStart"),
    month: fieldValue(taskForm, "month"),
    category: fieldValue(taskForm, "category") || "其他",
    priority: fieldValue(taskForm, "priority") || "中",
    status,
    progress: fieldValue(taskForm, "progress"),
    dueDate: fieldValue(taskForm, "dueDate"),
    estimateHours: fieldValue(taskForm, "estimateHours"),
    actualHours: fieldValue(taskForm, "actualHours"),
    sourceType: fieldValue(taskForm, "sourceType") || "manual",
    sourceText: fieldValue(taskForm, "sourceText"),
    notes: fieldValue(taskForm, "notes"),
    updatedAt: new Date().toISOString(),
    completedAt: status === "已完成" ? existingTask?.completedAt || new Date().toISOString() : "",
  };
  return normalizeTask(merged);
}

function collectCheckInInput() {
  return {
    date: fieldValue(checkInForm, "date") || todayString(),
    periodType: fieldValue(checkInForm, "periodType") || "week",
    summary: fieldValue(checkInForm, "summary"),
    blocker: fieldValue(checkInForm, "blocker"),
    nextFocus: fieldValue(checkInForm, "nextFocus"),
  };
}

function fieldValue(form, name) {
  return form?.elements[name]?.value?.trim() || "";
}

function setFieldValue(form, name, value) {
  if (!form?.elements[name]) return;
  form.elements[name].value = String(value || "");
}

function resetTaskForm() {
  taskForm?.reset();
  setFieldValue(taskForm, "taskId", "");
  setFieldValue(taskForm, "targetDate", todayString());
  setFieldValue(taskForm, "weekStart", currentWeekStart());
  setFieldValue(taskForm, "month", currentMonth());
  setFieldValue(taskForm, "progress", "0");
  updatePeriodFields();
}

function resetCheckInForm() {
  checkInForm?.reset();
  setFieldValue(checkInForm, "date", todayString());
}

function updatePeriodFields() {
  const periodType = fieldValue(taskForm, "periodType") || "day";
  document.querySelectorAll("[data-period-field]").forEach((field) => {
    field.classList.toggle("is-hidden", field.dataset.periodField !== periodType);
  });
}

function submitTask(event) {
  event.preventDefault();
  const task = collectTaskInput();
  if (!task.title) {
    setStatus("请先填写任务标题", true);
    return;
  }
  const existingIndex = plannerState.tasks.findIndex((item) => item.id === task.id);
  if (existingIndex >= 0) plannerState.tasks[existingIndex] = task;
  else plannerState.tasks = [task, ...plannerState.tasks];
  plannerState = normalizePlannerState(plannerState);
  isDirty = true;
  resetTaskForm();
  renderPlanner();
  setStatus("任务已加入计划，记得保存全部。");
}

function submitCheckIn(event) {
  event.preventDefault();
  const checkIn = collectCheckInInput();
  plannerState = normalizePlannerState({
    ...plannerState,
    checkIns: [checkIn, ...plannerState.checkIns],
  });
  isDirty = true;
  resetCheckInForm();
  renderPlanner();
  setStatus("复盘已加入，记得保存全部。");
}

function renderPlanner() {
  const metrics = buildDashboardMetrics(plannerState, { referenceDate: todayString() });
  if (todayRateEl) todayRateEl.textContent = `${metrics.today.completionRate}%`;
  if (weekRateEl) weekRateEl.textContent = `${metrics.week.completionRate}%`;
  if (riskCountEl) riskCountEl.textContent = String(metrics.overdueTasks + metrics.blockedTasks);
  if (nextFocusEl) nextFocusEl.textContent = `下一步重点：${metrics.nextFocus}`;
  renderTaskList(metrics);
  renderCheckIns();
  if (saveButton) saveButton.disabled = false;
}

function renderTaskList(metrics) {
  if (!taskList) return;
  const tasks = plannerState.tasks
    .filter((task) => activeView === "all" || task.periodType === activeView)
    .sort(sortTaskCards);
  if (!tasks.length) {
    taskList.innerHTML = '<p class="portfolio-empty">暂无任务。可以先添加一个本周计划。</p>';
    return;
  }
  taskList.innerHTML = `
    <div class="progress-metric-grid">
      <article><strong>${metrics.totalTasks}</strong><span>总任务</span></article>
      <article><strong>${metrics.completionRate}%</strong><span>总体完成</span></article>
      <article><strong>${metrics.estimatedHours}</strong><span>预计小时</span></article>
      <article><strong>${metrics.actualHours}</strong><span>实际小时</span></article>
    </div>
    ${tasks.map(renderTaskCard).join("")}
  `;
}

function renderTaskCard(task) {
  const state = identifyTaskState(task, todayString());
  return `
    <article class="progress-task-card is-${escapeHtml(state)}" data-task-id="${escapeHtml(task.id)}">
      <div class="progress-task-card__header">
        <div>
          <p class="case-index">${escapeHtml(periodLabel(task))} · ${escapeHtml(task.category)} · ${escapeHtml(task.priority)}优先级</p>
          <h3>${escapeHtml(task.title)}</h3>
        </div>
        <span class="progress-state-tag is-${escapeHtml(state)}">${escapeHtml(stateLabel(state))}</span>
      </div>
      <div class="progress-bar" aria-label="完成度 ${escapeHtml(task.progress)}%">
        <span style="width: ${Number(task.progress) || 0}%"></span>
      </div>
      <dl class="progress-task-meta">
        <div><dt>状态</dt><dd>${escapeHtml(task.status)}</dd></div>
        <div><dt>完成度</dt><dd>${escapeHtml(task.progress)}%</dd></div>
        <div><dt>截止</dt><dd>${escapeHtml(task.dueDate || "未设置")}</dd></div>
        <div><dt>工时</dt><dd>${escapeHtml(task.actualHours || "0")} / ${escapeHtml(task.estimateHours || "0")} 小时</dd></div>
      </dl>
      ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
      ${task.notes ? `<p class="progress-task-note">${escapeHtml(task.notes)}</p>` : ""}
      <div class="progress-task-actions">
        <button type="button" class="quiet neutral" data-edit-task="${escapeHtml(task.id)}">编辑</button>
        <button type="button" class="quiet neutral" data-complete-task="${escapeHtml(task.id)}">标记完成</button>
        <button type="button" class="danger" data-delete-task="${escapeHtml(task.id)}">删除</button>
      </div>
    </article>
  `;
}

function renderCheckIns() {
  if (!checkInList) return;
  const checkIns = [...plannerState.checkIns].slice(0, 8);
  if (!checkIns.length) {
    checkInList.innerHTML = '<p class="portfolio-empty">暂无复盘记录。</p>';
    return;
  }
  checkInList.innerHTML = checkIns.map((checkIn) => `
    <article class="checkin-card">
      <div>
        <span>${escapeHtml(checkIn.date)} · ${escapeHtml(periodTypeLabel(checkIn.periodType))}</span>
        <button type="button" class="danger" data-delete-checkin="${escapeHtml(checkIn.id)}">删除</button>
      </div>
      ${checkIn.summary ? `<p><strong>完成：</strong>${escapeHtml(checkIn.summary)}</p>` : ""}
      ${checkIn.blocker ? `<p><strong>阻塞：</strong>${escapeHtml(checkIn.blocker)}</p>` : ""}
      ${checkIn.nextFocus ? `<p><strong>下一步：</strong>${escapeHtml(checkIn.nextFocus)}</p>` : ""}
    </article>
  `).join("");
}

function editTask(taskId) {
  const task = plannerState.tasks.find((item) => item.id === taskId);
  if (!task) return;
  for (const [key, value] of Object.entries(task)) {
    setFieldValue(taskForm, key === "id" ? "taskId" : key, value);
  }
  updatePeriodFields();
  taskForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function completeTask(taskId) {
  plannerState.tasks = plannerState.tasks.map((task) =>
    task.id === taskId
      ? normalizeTask({ ...task, status: "已完成", progress: 100, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      : task,
  );
  isDirty = true;
  renderPlanner();
}

function deleteTask(taskId) {
  plannerState.tasks = plannerState.tasks.filter((task) => task.id !== taskId);
  isDirty = true;
  renderPlanner();
}

function deleteCheckIn(checkInId) {
  plannerState.checkIns = plannerState.checkIns.filter((checkIn) => checkIn.id !== checkInId);
  isDirty = true;
  renderPlanner();
}

async function savePlanner() {
  if (saveButton) saveButton.disabled = true;
  setSaveStatus("正在保存...");
  try {
    const saved = await requestJson(PROGRESS_PLANNER_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify(plannerState),
    });
    plannerState = normalizePlannerState(saved);
    isDirty = false;
    renderPlanner();
    setSaveStatus("已保存计划与进度");
    setStatus("已保存");
  } catch (error) {
    setSaveStatus(error.message, true);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function loadPlanner() {
  try {
    const planner = await requestJson(PROGRESS_PLANNER_ENDPOINT, { method: "GET" });
    plannerState = normalizePlannerState(planner);
    renderPlanner();
    setStatus(planner.updatedAt ? "已加载上次保存的计划" : "可以开始制定计划");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setSaveStatus(message, isError = false) {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = message;
  saveStatusEl.classList.toggle("error", isError);
}

function periodLabel(task) {
  if (task.periodType === "day") return `日计划 ${task.targetDate || "未定日期"}`;
  if (task.periodType === "month") return `月计划 ${task.month || "未定月份"}`;
  return `周计划 ${task.weekStart || "未定周"}`;
}

function periodTypeLabel(periodType) {
  return { day: "日复盘", week: "周复盘", month: "月复盘" }[periodType] || "复盘";
}

function stateLabel(state) {
  return {
    overdue: "逾期",
    blocked: "受阻",
    done: "已完成",
    "in-progress": "进行中",
    "not-started": "待开始",
  }[state] || "待开始";
}

function sortTaskCards(a, b) {
  const stateScore = { overdue: 0, blocked: 1, "in-progress": 2, "not-started": 3, done: 4 };
  const aState = identifyTaskState(a, todayString());
  const bState = identifyTaskState(b, todayString());
  if (stateScore[aState] !== stateScore[bState]) return stateScore[aState] - stateScore[bState];
  return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
}

taskForm?.addEventListener("submit", submitTask);
taskForm?.elements.periodType?.addEventListener("change", updatePeriodFields);
document.querySelector("#resetProgressTaskButton")?.addEventListener("click", resetTaskForm);
checkInForm?.addEventListener("submit", submitCheckIn);
saveButton?.addEventListener("click", savePlanner);
taskList?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-task]");
  const completeButton = event.target.closest("[data-complete-task]");
  const deleteButton = event.target.closest("[data-delete-task]");
  if (editButton) editTask(editButton.dataset.editTask);
  if (completeButton) completeTask(completeButton.dataset.completeTask);
  if (deleteButton) deleteTask(deleteButton.dataset.deleteTask);
});
checkInList?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-checkin]");
  if (deleteButton) deleteCheckIn(deleteButton.dataset.deleteCheckin);
});
viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.progressView || "all";
    viewButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    renderPlanner();
  });
});
window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

resetTaskForm();
resetCheckInForm();
loadPlanner();
