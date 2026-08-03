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
    apiKey: explicitApiKey = "",
    baseURL = "",
    model = "",
    temperature = 0.25,
    maxTokens,
    disableThinking = true,
    fallbackModels,
    timeoutMs,
    signal,
    onToken,
  } = {}) {
    const apiKey = apiKeyResolver({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: explicitApiKey,
    });
    if (!apiKey) {
      throw new LangChainLlmError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const selectedModel = normalizeDeepSeekModel(model || env.DEEPSEEK_MODEL, "deepseek-v4-pro");
    const normalizedMaxTokens = normalizePositiveInteger(maxTokens);
    const invokeModel = async (activeModel, activeSignal) => {
      const isStreaming = typeof onToken === "function";
      const chatModelOptions = {
        apiKey,
        model: activeModel,
        temperature: normalizeTemperature(temperature),
        streaming: isStreaming,
      };
      if (disableThinking) {
        chatModelOptions.modelKwargs = {
          thinking: { type: "disabled" },
        };
      }
      if (String(baseURL || "").trim()) {
        chatModelOptions.configuration = {
          baseURL: String(baseURL).trim().replace(/\/$/u, ""),
        };
      }
      if (normalizedMaxTokens) chatModelOptions.maxTokens = normalizedMaxTokens;
      const chatModel = chatModelFactory(chatModelOptions);
      const normalizedMessages = normalizeLangChainMessages(messages);
      const callOptions = activeSignal ? { signal: activeSignal } : undefined;
      if (isStreaming) {
        let content = "";
        let responseMetadata = {};
        let usage = {};
        let emittedContent = false;
        try {
          const responseStream = await chatModel.stream(normalizedMessages, callOptions);
          for await (const chunk of responseStream) {
            responseMetadata = chunk?.response_metadata || chunk?.responseMetadata || responseMetadata;
            const chunkUsage = extractLangChainUsage(chunk);
            if (Object.keys(chunkUsage).length) usage = chunkUsage;
            const text = extractLangChainChunkText(chunk);
            if (!text) continue;
            content += text;
            emittedContent = true;
            await onToken(text);
          }
        } catch (error) {
          if (emittedContent && error && typeof error === "object") error.retryable = false;
          throw error;
        }
        const normalizedContent = content.trim();
        if (!normalizedContent) throw new LangChainLlmError("DeepSeek 未返回可解析的问答内容。", 502);
        return { content: normalizedContent, responseMetadata, usage };
      }
      const response = await withSpan("langchain.chat.invoke", {
        "gen_ai.system": "deepseek",
        "gen_ai.request.model": activeModel,
      }, () => chatModel.invoke(
        normalizedMessages,
        callOptions,
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
          fallbackModels: parseFallbackModels(
            fallbackModels === undefined ? env.DEEPSEEK_FALLBACK_MODEL : fallbackModels,
            selectedModel,
          ),
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
  return extractLangChainChunkText(response).trim();
}

export function extractLangChainChunkText(response) {
  const content = response?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

function extractLangChainUsage(response) {
  const metadata = response?.response_metadata || response?.responseMetadata || {};
  const candidates = [
    metadata.tokenUsage,
    metadata.token_usage,
    response?.usage_metadata,
    response?.usageMetadata,
  ];
  return candidates.find(isNonEmptyUsage) || {};
}

function isNonEmptyUsage(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length,
  );
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
