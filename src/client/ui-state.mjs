export function getAgentAvailability({ protocol, promptLoaded, hasApiKey }) {
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

  if (!hasApiKey) {
    return {
      canGenerate: false,
      message: "缺少 API Key。请在中间 Agent 层临时输入 OpenAI API Key，或用 OPENAI_API_KEY 启动服务。",
    };
  }

  return {
    canGenerate: true,
    message: "已由后端加载，将自动注入 Agent。",
  };
}
