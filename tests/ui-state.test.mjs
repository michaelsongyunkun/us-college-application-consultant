import assert from "node:assert/strict";
import { getAgentAvailability } from "../src/client/ui-state.mjs";

assert.deepEqual(
  getAgentAvailability({ protocol: "file:", promptLoaded: false, hasApiKey: false }),
  {
    canGenerate: false,
    message: "未连接后端服务。请通过 http://127.0.0.1:4177 打开页面。",
  },
);

assert.deepEqual(
  getAgentAvailability({ protocol: "http:", promptLoaded: true, hasApiKey: false }),
  {
    canGenerate: false,
    message: "缺少 API Key。请在中间 Agent 层临时输入 OpenAI API Key，或用 OPENAI_API_KEY 启动服务。",
  },
);

assert.deepEqual(
  getAgentAvailability({ protocol: "http:", promptLoaded: true, hasApiKey: true }),
  {
    canGenerate: true,
    message: "已由后端加载，将自动注入 Agent。",
  },
);

assert.deepEqual(
  getAgentAvailability({ protocol: "http:", promptLoaded: true, hasApiKey: true }),
  {
    canGenerate: true,
    message: "已由后端加载，将自动注入 Agent。",
  },
);
