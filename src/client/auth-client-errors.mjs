export function getRequestErrorMessage(error, context = getBrowserLocationContext()) {
  if (error instanceof TypeError && /fetch/i.test(error.message || "")) {
    if (isLocalContext(context)) {
      return "无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面重试。";
    }
    return "网络连接中断，可能是服务正在部署或生成耗时较长，请刷新页面后重试。";
  }
  return error.message || "请求失败";
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
