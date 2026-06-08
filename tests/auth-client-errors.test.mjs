import assert from "node:assert/strict";
import { getRequestErrorMessage } from "../src/client/auth-client-errors.mjs";

assert.equal(
  getRequestErrorMessage(new TypeError("Failed to fetch"), { hostname: "127.0.0.1", protocol: "http:" }),
  "无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面重试。",
);

assert.equal(
  getRequestErrorMessage(new TypeError("Failed to fetch"), {
    hostname: "us-application-consultant.com",
    protocol: "https:",
  }),
  "网络连接中断，可能是服务正在部署或生成耗时较长，请刷新页面后重试。",
);

assert.equal(
  getRequestErrorMessage(new Error("Invalid email or password")),
  "Invalid email or password",
);

assert.equal(
  getRequestErrorMessage(new Error("Request body too large")),
  "输入内容过长，请精简超长描述后再试。",
);
