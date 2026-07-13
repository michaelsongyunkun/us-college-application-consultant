import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatDeepSeek } from "@langchain/deepseek";
import { resolveApiKey } from "./api-key.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";
import { createAiCallPolicy } from "./ai-call-policy.ts";
import { withSpan } from "./production-observability.ts";

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
  callPolicy = createAiCallPolicy({
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 30_000,
    maxAttempts: Number(process.env.AI_MAX_ATTEMPTS) || 3,
    failureThreshold: Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD) || 5,
    resetTimeoutMs: Number(process.env.AI_CIRCUIT_RESET_MS) || 30_000,
  }),
} = {}) {
  async function invoke({
    messages = [],
    env = process.env,
    feature = "langchain-deepseek",
    model = "",
    temperature = 0.25,
    maxTokens,
    timeoutMs,
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
    const normalizedMaxTokens = normalizePositiveInteger(maxTokens);
    const invokeModel = async (activeModel, activeSignal) => {
      const chatModelOptions = {
        apiKey,
        model: activeModel,
        temperature: normalizeTemperature(temperature),
        streaming: false,
        modelKwargs: {
          thinking: { type: "disabled" },
        },
      };
      if (normalizedMaxTokens) chatModelOptions.maxTokens = normalizedMaxTokens;
      const chatModel = chatModelFactory(chatModelOptions);
      const response = await withSpan("langchain.chat.invoke", {
        "gen_ai.system": "deepseek",
        "gen_ai.request.model": activeModel,
      }, () => chatModel.invoke(
        normalizeLangChainMessages(messages),
        activeSignal ? { signal: activeSignal } : undefined,
      ));
      const content = extractLangChainMessageText(response);
      if (!content) throw new LangChainLlmError("DeepSeek 未返回可解析的问答内容。", 502);
      return {
        content,
        responseMetadata: response?.response_metadata || response?.responseMetadata || {},
        usage: extractLangChainUsage(response),
      };
    };

    try {
      const result = signal && typeof signal.addEventListener !== "function"
        ? await invokeModel(selectedModel, signal)
        : await callPolicy.execute({
          feature: String(feature || "langchain-deepseek"),
          primaryModel: selectedModel,
          fallbackModels: parseFallbackModels(env.DEEPSEEK_FALLBACK_MODEL, selectedModel),
          timeoutMs,
          signal,
          operation: ({ model: activeModel, signal: activeSignal }) => invokeModel(activeModel, activeSignal),
        });
      return {
        content: result.content,
        model: result.selectedModel || selectedModel,
        responseMetadata: result.responseMetadata,
        usage: result.usage,
      };
    } catch (error) {
      throw new LangChainLlmError(error?.message || "DeepSeek LangChain 调用失败。", error?.statusCode || 502, {
        cause: error,
      });
    }
  }

  return { invoke };
}

function parseFallbackModels(value, primaryModel) {
  return String(value || "")
    .split(",")
    .map((model) => normalizeDeepSeekModel(model.trim(), ""))
    .filter((model) => model && model !== primaryModel);
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
