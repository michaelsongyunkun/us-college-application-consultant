import { csrfFetch } from "./csrf-token.mjs";

export const RAG_STREAM_ENDPOINT = "/api/deepseek-rag/stream";

export async function requestRagStream(payload, { fetcher = csrfFetch } = {}) {
  let response;
  try {
    response = await fetcher(RAG_STREAM_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw createStreamError("RAG 快速通道暂时不可用。", { fallbackAllowed: true, cause });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const fallbackAllowed = [404, 405, 501, 502, 503, 504].includes(response.status);
    throw createStreamError(payload.error || `RAG 快速通道请求失败（${response.status}）。`, {
      fallbackAllowed,
      status: response.status,
    });
  }
  try {
    return await readRagEventStream(response);
  } catch (error) {
    if (typeof error?.fallbackAllowed === "boolean") throw error;
    throw createStreamError("RAG 快速通道连接中断。", { fallbackAllowed: true, cause: error });
  }
}

export async function readRagEventStream(response) {
  if (!response.body) throw createStreamError("RAG 快速通道没有返回数据流。", { fallbackAllowed: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/u);
    buffer = done ? "" : blocks.pop() || "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (!event) continue;
      if (event.type === "result") result = event.data;
      if (event.type === "error") {
        throw createStreamError(event.data?.error || "RAG 生成失败。", { fallbackAllowed: false });
      }
      if (event.type === "done") {
        if (result !== undefined) return result;
        throw createStreamError("RAG 快速通道提前结束。", { fallbackAllowed: true });
      }
    }
    if (done) break;
  }

  if (result !== undefined) return result;
  throw createStreamError("RAG 快速通道未返回结果。", { fallbackAllowed: true });
}

function parseSseBlock(block) {
  let type = "message";
  const dataLines = [];
  for (const line of String(block || "").split(/\r?\n/u)) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  const rawData = dataLines.join("\n");
  let data;
  try {
    data = JSON.parse(rawData);
  } catch {
    data = rawData;
  }
  return { type, data };
}

function createStreamError(message, { fallbackAllowed, ...details }) {
  const error = new Error(message);
  error.fallbackAllowed = Boolean(fallbackAllowed);
  Object.assign(error, details);
  return error;
}
