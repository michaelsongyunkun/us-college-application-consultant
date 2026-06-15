const backendDisconnectedMessage =
  "未连接后端服务。不要直接双击 HTML；请用 npm start 打开 http://127.0.0.1:4177，或用 start-consultant.cmd 打开 http://127.0.0.1:4179。";

export function getAgentAvailability({ protocol, promptLoaded }) {
  if (protocol === "file:") {
    return {
      canGenerate: false,
      message: backendDisconnectedMessage,
    };
  }

  if (!promptLoaded) {
    return {
      canGenerate: false,
      message: "后端服务未就绪，无法加载固定提示词。",
    };
  }

  return {
    canGenerate: true,
    message: "固定提示词已加载，可使用 DeepSeek 自动生成规划。",
  };
}

export function getDeepSeekGenerationAvailability({ protocol, promptLoaded, hasServerApiKey }) {
  if (protocol === "file:") {
    return {
      canGenerate: false,
      message: backendDisconnectedMessage,
    };
  }

  if (!promptLoaded) {
    return {
      canGenerate: false,
      message: "后端服务未就绪，无法加载固定提示词。",
    };
  }

  if (!hasServerApiKey) {
    return {
      canGenerate: false,
      message: "站点 DeepSeek API 尚未配置，请联系管理员配置 DEEPSEEK_API_KEY。",
    };
  }

  return {
    canGenerate: true,
    message: "DeepSeek 已就绪，可自动生成并填入表格。",
  };
}
