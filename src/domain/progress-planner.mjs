const CATEGORY_OPTIONS = new Set(["学术", "标化", "活动", "竞赛", "夏校", "文书", "推荐信", "选校", "其他"]);
const PRIORITY_OPTIONS = new Set(["高", "中", "低"]);
const STATUS_OPTIONS = new Set(["待开始", "进行中", "已完成", "受阻"]);
const PERIOD_OPTIONS = new Set(["day", "week", "month"]);
const SOURCE_OPTIONS = new Set(["manual", "portfolio", "deepseek", "school-selection"]);
const TASK_LIMIT = 240;
const CHECK_IN_LIMIT = 120;

export function normalizeTask(task = {}, { now = () => new Date() } = {}) {
  const timestamp = toIso(now());
  const periodType = PERIOD_OPTIONS.has(task.periodType) ? task.periodType : "week";
  const status = STATUS_OPTIONS.has(task.status) ? task.status : "待开始";
  const progress = normalizeProgress(task.progress, status);
  const completedAt = status === "已完成"
    ? cleanString(task.completedAt) || timestamp
    : "";
  return {
    id: cleanString(task.id) || createTaskId(timestamp, task.title),
    title: cleanString(task.title).slice(0, 120),
    description: cleanString(task.description).slice(0, 1200),
    periodType,
    targetDate: isDate(task.targetDate) ? task.targetDate : "",
    weekStart: isDate(task.weekStart) ? task.weekStart : "",
    month: isMonth(task.month) ? task.month : "",
    category: CATEGORY_OPTIONS.has(task.category) ? task.category : "其他",
    priority: PRIORITY_OPTIONS.has(task.priority) ? task.priority : "中",
    status,
    progress,
    dueDate: isDate(task.dueDate) ? task.dueDate : "",
    estimateHours: normalizeHours(task.estimateHours),
    actualHours: normalizeHours(task.actualHours),
    sourceType: SOURCE_OPTIONS.has(task.sourceType) ? task.sourceType : "manual",
    sourceText: cleanString(task.sourceText).slice(0, 800),
    notes: cleanString(task.notes).slice(0, 1600),
    createdAt: cleanString(task.createdAt) || timestamp,
    updatedAt: cleanString(task.updatedAt) || timestamp,
    completedAt,
  };
}

export function normalizePlannerState(state = {}, options = {}) {
  const tasks = asArray(state.tasks)
    .map((task) => normalizeTask(task, options))
    .filter((task) => task.title)
    .slice(0, TASK_LIMIT);
  const checkIns = asArray(state.checkIns)
    .map((checkIn) => normalizeCheckIn(checkIn, options))
    .filter((checkIn) => checkIn.summary || checkIn.blocker || checkIn.nextFocus)
    .slice(0, CHECK_IN_LIMIT);
  return { tasks, checkIns };
}

export function identifyTaskState(task, referenceDate = todayString()) {
  if (task?.status === "已完成" || Number(task?.progress) >= 100) return "done";
  if (task?.status === "受阻") return "blocked";
  if (task?.dueDate && task.dueDate < referenceDate) return "overdue";
  if (task?.status === "进行中" || Number(task?.progress) > 0) return "in-progress";
  return "not-started";
}

export function groupTasksByPeriod(tasks = []) {
  const groups = { day: {}, week: {}, month: {} };
  for (const task of asArray(tasks)) {
    const periodType = PERIOD_OPTIONS.has(task.periodType) ? task.periodType : "week";
    const key = periodKey(task, periodType);
    if (!groups[periodType][key]) groups[periodType][key] = [];
    groups[periodType][key].push(task);
  }
  return groups;
}

export function calculatePeriodProgress(tasks = [], periodType = "week", periodKeyValue = "") {
  const matchingTasks = asArray(tasks).filter((task) =>
    task.periodType === periodType && periodKey(task, periodType) === periodKeyValue,
  );
  return summarizeProgress(matchingTasks);
}

export function buildDashboardMetrics(state = {}, { referenceDate = todayString() } = {}) {
  const planner = normalizePlannerState(state, { now: () => new Date(`${referenceDate}T00:00:00.000Z`) });
  const tasks = planner.tasks;
  const currentWeek = startOfWeek(referenceDate);
  const currentMonth = referenceDate.slice(0, 7);
  const stateCounts = tasks.reduce((counts, task) => {
    const stateKey = identifyTaskState(task, referenceDate);
    counts[stateKey] = (counts[stateKey] || 0) + 1;
    return counts;
  }, {});
  const activeTasks = tasks
    .filter((task) => identifyTaskState(task, referenceDate) !== "done")
    .sort(sortByUrgency);
  return {
    totalTasks: tasks.length,
    doneTasks: stateCounts.done || 0,
    inProgressTasks: stateCounts["in-progress"] || 0,
    blockedTasks: stateCounts.blocked || 0,
    overdueTasks: stateCounts.overdue || 0,
    notStartedTasks: stateCounts["not-started"] || 0,
    completionRate: summarizeProgress(tasks).completionRate,
    today: summarizeProgress(tasks.filter((task) => task.periodType === "day" && task.targetDate === referenceDate)),
    week: summarizeProgress(tasks.filter((task) => task.periodType === "week" && periodKey(task, "week") === currentWeek)),
    month: summarizeProgress(tasks.filter((task) => periodKey(task, "month") === currentMonth || task.month === currentMonth)),
    estimatedHours: sumHours(tasks, "estimateHours"),
    actualHours: sumHours(tasks, "actualHours"),
    nextFocus: activeTasks[0]?.title || "当前没有未完成任务，可以安排下一轮复盘。",
  };
}

function normalizeCheckIn(checkIn = {}, { now = () => new Date() } = {}) {
  const timestamp = toIso(now());
  return {
    id: cleanString(checkIn.id) || createTaskId(timestamp, checkIn.summary || checkIn.nextFocus),
    date: isDate(checkIn.date) ? checkIn.date : todayString(now()),
    periodType: PERIOD_OPTIONS.has(checkIn.periodType) ? checkIn.periodType : "week",
    summary: cleanString(checkIn.summary).slice(0, 1200),
    blocker: cleanString(checkIn.blocker).slice(0, 1200),
    nextFocus: cleanString(checkIn.nextFocus).slice(0, 1200),
    createdAt: cleanString(checkIn.createdAt) || timestamp,
  };
}

function summarizeProgress(tasks) {
  const values = asArray(tasks);
  const totalTasks = values.length;
  const doneTasks = values.filter((task) => task.status === "已完成" || Number(task.progress) >= 100).length;
  const averageProgress = totalTasks
    ? Math.round(values.reduce((sum, task) => sum + Number(task.progress || 0), 0) / totalTasks)
    : 0;
  return {
    totalTasks,
    doneTasks,
    completionRate: averageProgress,
  };
}

function periodKey(task, periodType) {
  if (periodType === "day") return task.targetDate || task.dueDate || "";
  if (periodType === "month") return task.month || (task.dueDate || task.targetDate || "").slice(0, 7);
  return task.weekStart || startOfWeek(task.dueDate || task.targetDate || todayString());
}

function startOfWeek(dateString) {
  if (!isDate(dateString)) return "";
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function sortByUrgency(a, b) {
  const priorityScore = { 高: 0, 中: 1, 低: 2 };
  const aDue = a.dueDate || "9999-12-31";
  const bDue = b.dueDate || "9999-12-31";
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return (priorityScore[a.priority] ?? 1) - (priorityScore[b.priority] ?? 1);
}

function normalizeProgress(value, status) {
  if (status === "已完成") return 100;
  const number = Number(value);
  if (!Number.isFinite(number)) return status === "进行中" ? 25 : 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeHours(value) {
  const text = cleanString(value);
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return "";
  return String(Number(number.toFixed(2)));
}

function sumHours(tasks, field) {
  return Number(
    asArray(tasks)
      .reduce((sum, task) => sum + (Number(task[field]) || 0), 0)
      .toFixed(2),
  );
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(cleanString(value));
}

function isMonth(value) {
  return /^\d{4}-\d{2}$/u.test(cleanString(value));
}

function todayString(now = () => new Date()) {
  const value = typeof now === "function" ? now() : now;
  return toIso(value).slice(0, 10);
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function createTaskId(timestamp, seed = "") {
  const suffix = cleanString(seed).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);
  return `task-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}-${suffix || Math.random().toString(36).slice(2, 8)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? "").trim();
}
