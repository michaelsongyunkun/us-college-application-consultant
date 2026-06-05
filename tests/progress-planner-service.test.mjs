import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { createAuthService } from "../src/server/auth-service.mjs";
import {
  ProgressPlannerError,
  createProgressPlannerService,
} from "../src/server/progress-planner-service.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-progress-planner-service-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "progress.sqlite") });

try {
  let tick = 0;
  const auth = createAuthService({ authDb });
  const progressPlanner = createProgressPlannerService({
    authDb,
    now: () => new Date(`2026-06-05T08:00:0${tick++}.000Z`),
  });
  const firstUser = auth.register({
    name: "First Planner",
    email: "first-progress@example.com",
    password: "password123",
  }).user;
  const secondUser = auth.register({
    name: "Second Planner",
    email: "second-progress@example.com",
    password: "password123",
  }).user;

  assert.deepEqual(progressPlanner.getPlanner(firstUser), {
    tasks: [],
    checkIns: [],
    updatedAt: null,
  });

  const saved = progressPlanner.savePlanner(firstUser, {
    tasks: [
      {
        title: "完成本周 SAT 阅读错题复盘",
        periodType: "week",
        weekStart: "2026-06-01",
        category: "标化",
        priority: "高",
        status: "进行中",
        progress: 60,
        dueDate: "2026-06-07",
        estimateHours: "4",
        actualHours: "2",
        sourceType: "manual",
      },
      {
        title: "补充推荐信素材",
        periodType: "month",
        month: "2026-06",
        category: "推荐信",
        priority: "中",
        status: "待开始",
        progress: 0,
      },
    ],
    checkIns: [
      {
        date: "2026-06-05",
        periodType: "week",
        summary: "SAT 错题已完成一半",
        blocker: "周三时间被竞赛占用",
        nextFocus: "周末完成模考复盘",
      },
    ],
  });

  assert.equal(saved.tasks.length, 2);
  assert.ok(saved.tasks[0].id);
  assert.equal(saved.tasks[0].title, "完成本周 SAT 阅读错题复盘");
  assert.equal(saved.tasks[0].progress, 60);
  assert.equal(saved.checkIns.length, 1);
  assert.ok(saved.updatedAt);

  const reloaded = progressPlanner.getPlanner(firstUser);
  assert.deepEqual(reloaded.tasks, saved.tasks);
  assert.deepEqual(reloaded.checkIns, saved.checkIns);
  assert.equal(reloaded.updatedAt, saved.updatedAt);

  assert.deepEqual(progressPlanner.getPlanner(secondUser), {
    tasks: [],
    checkIns: [],
    updatedAt: null,
  });

  assert.throws(
    () => progressPlanner.getPlanner({}),
    (error) => error instanceof ProgressPlannerError && error.statusCode === 401,
  );
} finally {
  authDb.close();
  await rm(tempDir, { recursive: true, force: true });
}
