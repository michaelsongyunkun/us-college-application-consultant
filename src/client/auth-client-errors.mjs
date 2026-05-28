export function getRequestErrorMessage(error) {
  if (error instanceof TypeError && /fetch/i.test(error.message || "")) {
    return "无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面重试。";
  }
  return error.message || "请求失败";
}
