import assert from "node:assert/strict";
import {
  getAiGenerationErrorMessage,
  getRequestErrorMessage,
} from "../src/client/auth-client-errors.mjs";

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

assert.equal(
  getAiGenerationErrorMessage(
    { error: "AI call timed out after 120000ms", statusCode: 504 },
    { operation: "选校方案 AI 生成" },
  ),
  "选校方案 AI 生成超时，本次任务已安全结束。请稍后重试；这不是您的网络中断。",
);

assert.equal(
  getAiGenerationErrorMessage(
    Object.assign(new Error("Job timed out after 120000ms"), { status: 504 }),
    { operation: "DeepSeek 规划生成" },
  ),
  "DeepSeek 规划生成超时，本次任务已安全结束。请稍后重试；这不是您的网络中断。",
);

assert.equal(
  getAiGenerationErrorMessage(
    { error: "Provider rejected the request", statusCode: 400 },
    { fallbackMessage: "AI 生成失败" },
  ),
  "Provider rejected the request",
);
