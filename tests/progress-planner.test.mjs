import assert from "node:assert/strict";
import {
  buildDashboardMetrics,
  calculatePeriodProgress,
  groupTasksByPeriod,
  identifyTaskState,
  normalizePlannerState,
  normalizeTask,
} from "../src/domain/progress-planner.mjs";

const referenceDate = "2026-06-05";

const normalized = normalizeTask(
  {
    id: "",
    title: "  完成 MIT 活动列表复盘  ",
    description: "整理活动证据",
    periodType: "week",
    targetDate: "bad-date",
    weekStart: "2026-06-01",
    month: "2026-06",
    category: "活动",
    priority: "高",
    status: "进行中",
    progress: "45",
    dueDate: "2026-06-04",
    estimateHours: "3.5",
    actualHours: "1.5",
    sourceType: "deepseek",
    sourceText: "DeepSeek 行动建议",
    notes: "家长周日复盘",
  },
  { now: () => new Date("2026-06-05T08:00:00.000Z") },
);
assert.ok(normalized.id);
assert.equal(normalized.title, "完成 MIT 活动列表复盘");
assert.equal(normalized.periodType, "week");
assert.equal(normalized.targetDate, "");
assert.equal(normalized.weekStart, "2026-06-01");
assert.equal(normalized.status, "进行中");
assert.equal(normalized.progress, 45);
assert.equal(normalized.createdAt, "2026-06-05T08:00:00.000Z");
assert.equal(normalized.updatedAt, "2026-06-05T08:00:00.000Z");

const completed = normalizeTask(
  {
    title: "提交 TOEFL 报名",
    periodType: "day",
    targetDate: "2026-06-05",
    category: "标化",
    status: "已完成",
    progress: "20",
  },
  { now: () => new Date("2026-06-05T08:00:00.000Z") },
);
assert.equal(completed.progress, 100);
assert.ok(completed.completedAt);

assert.equal(identifyTaskState(normalized, referenceDate), "overdue");
assert.equal(identifyTaskState({ ...normalized, dueDate: "2026-06-10", status: "受阻" }, referenceDate), "blocked");
assert.equal(identifyTaskState(completed, referenceDate), "done");
assert.equal(identifyTaskState({ ...normalized, dueDate: "2026-06-10", progress: 20 }, referenceDate), "in-progress");
assert.equal(identifyTaskState({ ...normalized, dueDate: "2026-06-10", status: "待开始", progress: 0 }, referenceDate), "not-started");

const state = normalizePlannerState(
  {
    tasks: [
      normalized,
      completed,
      {
        title: "文书素材访谈",
        periodType: "month",
        month: "2026-06",
        category: "文书",
        priority: "中",
        status: "待开始",
        progress: 0,
        estimateHours: "2",
      },
      {
        title: "",
        periodType: "day",
      },
    ],
    checkIns: [
      {
        id: "",
        date: "2026-06-05",
        periodType: "week",
        summary: "本周已完成报名",
        blocker: "活动材料缺证明",
        nextFocus: "补充推荐信素材",
      },
    ],
  },
  { now: () => new Date("2026-06-05T08:00:00.000Z") },
);
assert.equal(state.tasks.length, 3);
assert.equal(state.checkIns.length, 1);
assert.equal(state.checkIns[0].periodType, "week");

const groups = groupTasksByPeriod(state.tasks);
assert.equal(groups.day["2026-06-05"].length, 1);
assert.equal(groups.week["2026-06-01"].length, 1);
assert.equal(groups.month["2026-06"].length, 1);

const weekProgress = calculatePeriodProgress(state.tasks, "week", "2026-06-01");
assert.equal(weekProgress.totalTasks, 1);
assert.equal(weekProgress.completionRate, 45);
assert.equal(weekProgress.doneTasks, 0);

const metrics = buildDashboardMetrics(state, { referenceDate });
assert.equal(metrics.totalTasks, 3);
assert.equal(metrics.doneTasks, 1);
assert.equal(metrics.overdueTasks, 1);
assert.equal(metrics.blockedTasks, 0);
assert.equal(metrics.today.totalTasks, 1);
assert.equal(metrics.week.totalTasks, 1);
assert.equal(metrics.month.totalTasks, 3);
assert.equal(metrics.estimatedHours, 5.5);
assert.equal(metrics.actualHours, 1.5);
assert.ok(metrics.nextFocus.includes("完成 MIT 活动列表复盘"));
