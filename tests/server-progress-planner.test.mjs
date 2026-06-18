import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { buildCookieHeader, jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-server-progress-planner-"));
const server = createAppServer({ databasePath: join(tempDir, "progress-api.sqlite") });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const blockedGet = await fetch(`${serverUrl()}/api/progress-planner`);
  assert.equal(blockedGet.status, 401);

  const blockedPut = await fetch(`${serverUrl()}/api/progress-planner`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: [] }),
  });
  assert.equal(blockedPut.status, 401);

  const firstRegistration = await post("/api/auth/register", {
    email: "progress-a@example.com",
    name: "Progress A",
    password: "password123",
  });
  const firstCookie = firstRegistration.headers.get("set-cookie");

  const secondRegistration = await post("/api/auth/register", {
    email: "progress-b@example.com",
    name: "Progress B",
    password: "password123",
  });
  const secondCookie = secondRegistration.headers.get("set-cookie");

  const emptyPlanner = await get("/api/progress-planner", firstCookie);
  assert.equal(emptyPlanner.status, 200);
  assert.deepEqual(await emptyPlanner.json(), {
    tasks: [],
    checkIns: [],
    updatedAt: null,
  });

  const savedResponse = await put(
    "/api/progress-planner",
    {
      tasks: [
        {
          title: "完成 UC 学校清单复盘",
          periodType: "day",
          targetDate: "2026-06-05",
          category: "选校",
          priority: "高",
          status: "进行中",
          progress: 30,
          dueDate: "2026-06-06",
          estimateHours: "2",
          sourceType: "school-selection",
          sourceText: "美本选校系统",
        },
      ],
      checkIns: [
        {
          date: "2026-06-05",
          periodType: "day",
          summary: "今天先复盘 UC",
          blocker: "",
          nextFocus: "确认 UCLA 和 UCSD 专业口径",
        },
      ],
    },
    firstCookie,
  );
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.tasks[0].title, "完成 UC 学校清单复盘");
  assert.equal(saved.tasks[0].progress, 30);
  assert.equal(saved.tasks[0].sourceType, "school-selection");
  assert.equal(saved.checkIns[0].nextFocus, "确认 UCLA 和 UCSD 专业口径");
  assert.ok(saved.updatedAt);

  const reloaded = await get("/api/progress-planner", firstCookie);
  assert.deepEqual(await reloaded.json(), saved);

  const secondPlanner = await get("/api/progress-planner", secondCookie);
  assert.deepEqual(await secondPlanner.json(), {
    tasks: [],
    checkIns: [],
    updatedAt: null,
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function post(path, payload, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function put(path, payload, cookie) {
  return fetch(`${serverUrl()}${path}`, {
    method: "PUT",
    headers: jsonHeaders(cookie),
    body: JSON.stringify(payload),
  });
}

function get(path, cookie) {
  return fetch(`${serverUrl()}${path}`, { headers: { Cookie: buildCookieHeader(cookie) } });
}

function serverUrl() {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
