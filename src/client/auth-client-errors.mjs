export function getRequestErrorMessage(error, context = getBrowserLocationContext()) {
  if (/request body too large|413/i.test(error?.message || "")) {
    return "输入内容过长，请精简超长描述后再试。";
  }
  if (error instanceof TypeError && /fetch/i.test(error.message || "")) {
    if (isLocalContext(context)) {
      return "无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面重试。";
    }
    return "网络连接中断，可能是服务正在部署或生成耗时较长，请刷新页面后重试。";
  }
  return error.message || "请求失败";
}

export function getAiGenerationErrorMessage(
  errorOrJob,
  { operation = "AI 生成", fallbackMessage = "AI 生成失败，请稍后重试。" } = {},
) {
  const message = String(errorOrJob?.error || errorOrJob?.message || "").trim();
  const statusCode = Number(errorOrJob?.statusCode || errorOrJob?.status || 0);
  if (statusCode === 504 || /ETIMEDOUT|timed out|timeout/i.test(message)) {
    return `${String(operation || "AI 生成").trim()}超时，本次任务已安全结束。请稍后重试；这不是您的网络中断。`;
  }
  return message || fallbackMessage;
}

function getBrowserLocationContext() {
  return {
    protocol: globalThis.location?.protocol || "",
    hostname: globalThis.location?.hostname || "",
  };
}

function isLocalContext({ protocol = "", hostname = "" } = {}) {
  return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
}
