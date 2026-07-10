import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatDeepSeek } from "@langchain/deepseek";
import { resolveApiKey } from "./api-key.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";

export class LangChainLlmError extends Error {
  constructor(message, statusCode = 400, options = {}) {
    super(message, options);
    this.name = "LangChainLlmError";
    this.statusCode = statusCode;
  }
}

export function createLangChainDeepSeekClient({
  chatModelFactory = createDefaultLangChainChatModel,
  apiKeyResolver = resolveApiKey,
} = {}) {
  async function invoke({
    messages = [],
    env = process.env,
    model = "",
    temperature = 0.25,
    maxTokens,
    signal,
  } = {}) {
    const apiKey = apiKeyResolver({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new LangChainLlmError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const selectedModel = normalizeDeepSeekModel(model || env.DEEPSEEK_MODEL, "deepseek-v4-pro");
    const chatModelOptions = {
      apiKey,
      model: selectedModel,
      temperature: normalizeTemperature(temperature),
      streaming: false,
      modelKwargs: {
        thinking: { type: "disabled" },
      },
    };
    const normalizedMaxTokens = normalizePositiveInteger(maxTokens);
    if (normalizedMaxTokens) chatModelOptions.maxTokens = normalizedMaxTokens;

    const chatModel = chatModelFactory(chatModelOptions);
    let response;
    try {
      response = await chatModel.invoke(
        normalizeLangChainMessages(messages),
        signal ? { signal } : undefined,
      );
    } catch (error) {
      throw new LangChainLlmError(error?.message || "DeepSeek LangChain 调用失败。", error?.statusCode || 502, {
        cause: error,
      });
    }

    const content = extractLangChainMessageText(response);
    if (!content) throw new LangChainLlmError("DeepSeek 未返回可解析的问答内容。", 502);

    return {
      content,
      model: selectedModel,
      responseMetadata: response?.response_metadata || response?.responseMetadata || {},
      usage: extractLangChainUsage(response),
    };
  }

  return { invoke };
}

export function createDefaultLangChainChatModel(options) {
  return new ChatDeepSeek(options);
}

export function normalizeLangChainMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LangChainLlmError("LangChain 调用需要至少一条消息。", 400);
  }
  return messages.map((message) => {
    if (message && typeof message._getType === "function") return message;
    const role = normalizeMessageRole(Array.isArray(message) ? message[0] : message?.role);
    const content = Array.isArray(message) ? message[1] : message?.content;
    const text = String(content ?? "");
    if (!text.trim()) throw new LangChainLlmError("LangChain 消息内容不能为空。", 400);
    if (role === "system") return new SystemMessage(text);
    if (role === "user") return new HumanMessage(text);
    if (role === "assistant") return new AIMessage(text);
    throw new LangChainLlmError(`不支持的 LangChain 消息角色：${role || "empty"}`, 400);
  });
}

export function extractLangChainMessageText(response) {
  const content = response?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function extractLangChainUsage(response) {
  const metadata = response?.response_metadata || response?.responseMetadata || {};
  return metadata.tokenUsage || metadata.token_usage || {};
}

function normalizeMessageRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "human") return "user";
  if (normalized === "ai") return "assistant";
  if (normalized === "developer") return "system";
  return normalized;
}

function normalizeTemperature(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.25;
  return Math.min(Math.max(parsed, 0), 2);
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
