export function getAgentAvailability({ protocol, promptLoaded }) {
  if (protocol === "file:") {
    return {
      canGenerate: false,
      message: "未连接后端服务。请通过 http://127.0.0.1:4177 打开页面。",
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
    message: "固定提示词已加载，可生成任务包。",
  };
}

export function getDeepSeekGenerationAvailability({ protocol, promptLoaded, hasServerApiKey }) {
  if (protocol === "file:") {
    return {
      canGenerate: false,
      message: "未连接后端服务。请通过 http://127.0.0.1:4177 打开页面。",
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
