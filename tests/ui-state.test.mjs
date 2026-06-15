import assert from "node:assert/strict";
import {
  getAgentAvailability,
  getDeepSeekGenerationAvailability,
} from "../src/client/ui-state.mjs";

assert.deepEqual(
  getAgentAvailability({ protocol: "file:", promptLoaded: false }),
  {
    canGenerate: false,
    message:
      "未连接后端服务。不要直接双击 HTML；请用 npm start 打开 http://127.0.0.1:4177，或用 start-consultant.cmd 打开 http://127.0.0.1:4179。",
  },
);

assert.deepEqual(
  getAgentAvailability({ protocol: "http:", promptLoaded: true }),
  {
    canGenerate: true,
    message: "固定提示词已加载，可使用 DeepSeek 自动生成规划。",
  },
);

assert.deepEqual(
  getAgentAvailability({ protocol: "http:", promptLoaded: false }),
  {
    canGenerate: false,
    message: "后端服务未就绪，无法加载固定提示词。",
  },
);

assert.deepEqual(
  getDeepSeekGenerationAvailability({ protocol: "file:", promptLoaded: false, hasServerApiKey: false }),
  {
    canGenerate: false,
    message:
      "未连接后端服务。不要直接双击 HTML；请用 npm start 打开 http://127.0.0.1:4177，或用 start-consultant.cmd 打开 http://127.0.0.1:4179。",
  },
);

assert.deepEqual(
  getDeepSeekGenerationAvailability({ protocol: "http:", promptLoaded: false, hasServerApiKey: true }),
  {
    canGenerate: false,
    message: "后端服务未就绪，无法加载固定提示词。",
  },
);

assert.deepEqual(
  getDeepSeekGenerationAvailability({ protocol: "http:", promptLoaded: true, hasServerApiKey: false }),
  {
    canGenerate: false,
    message: "站点 DeepSeek API 尚未配置，请联系管理员配置 DEEPSEEK_API_KEY。",
  },
);

assert.deepEqual(
  getDeepSeekGenerationAvailability({ protocol: "http:", promptLoaded: true, hasServerApiKey: true }),
  {
    canGenerate: true,
    message: "DeepSeek 已就绪，可自动生成并填入表格。",
  },
);
