import assert from "node:assert/strict";
import { getRequestErrorMessage } from "../src/client/auth-client-errors.mjs";

assert.equal(
  getRequestErrorMessage(new TypeError("Failed to fetch")),
  "无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面重试。",
);

assert.equal(
  getRequestErrorMessage(new Error("Invalid email or password")),
  "Invalid email or password",
);
