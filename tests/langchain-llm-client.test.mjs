import assert from "node:assert/strict";
import {
  LangChainLlmError,
  createLangChainDeepSeekClient,
  extractLangChainMessageText,
  normalizeLangChainMessages,
} from "../src/server/langchain-llm-client.mjs";

const calls = [];
const client = createLangChainDeepSeekClient({
  chatModelFactory(options) {
    calls.push({ options });
    return {
      async invoke(messages, callOptions) {
        calls.at(-1).messages = messages;
        calls.at(-1).callOptions = callOptions;
        return {
          content: [
            { type: "text", text: "LangChain " },
            { type: "text", text: "DeepSeek response" },
          ],
          response_metadata: {
            tokenUsage: {
              promptTokens: 10,
              completionTokens: 4,
              totalTokens: 14,
            },
          },
        };
      },
    };
  },
});

const result = await client.invoke({
  env: {
    DEEPSEEK_API_KEY: "server-secret",
    DEEPSEEK_MODEL: "Deepseek V4 flash",
  },
  messages: [
    { role: "system", content: "System prompt" },
    { role: "user", content: "User question" },
  ],
  temperature: 0.3,
  maxTokens: 1200,
  signal: "mock-signal",
});

assert.equal(result.content, "LangChain DeepSeek response");
assert.equal(result.model, "deepseek-v4-flash");
assert.deepEqual(result.usage, {
  promptTokens: 10,
  completionTokens: 4,
  totalTokens: 14,
});
assert.equal(JSON.stringify(result).includes("server-secret"), false);

assert.equal(calls.length, 1);
assert.deepEqual(calls[0].options, {
  apiKey: "server-secret",
  model: "deepseek-v4-flash",
  temperature: 0.3,
  streaming: false,
  maxTokens: 1200,
});
assert.equal(calls[0].callOptions.signal, "mock-signal");
assert.equal(calls[0].messages[0]._getType(), "system");
assert.equal(calls[0].messages[1]._getType(), "human");
assert.equal(calls[0].messages[0].content, "System prompt");
assert.equal(calls[0].messages[1].content, "User question");

assert.equal(normalizeLangChainMessages([["human", "Hi"]])[0]._getType(), "human");
assert.equal(normalizeLangChainMessages([["ai", "Hello"]])[0]._getType(), "ai");
assert.equal(normalizeLangChainMessages([["developer", "Policy"]])[0]._getType(), "system");
assert.equal(extractLangChainMessageText({ content: "  plain text  " }), "plain text");

await assert.rejects(
  () => createLangChainDeepSeekClient().invoke({ messages: [["user", "Hello"]], env: {} }),
  (error) =>
    error instanceof LangChainLlmError
      && error.statusCode === 400
      && /DEEPSEEK_API_KEY/.test(error.message),
);

await assert.rejects(
  () =>
    createLangChainDeepSeekClient({
      chatModelFactory() {
        return {
          async invoke() {
            return { content: "" };
          },
        };
      },
    }).invoke({
      messages: [["user", "Hello"]],
      env: { DEEPSEEK_API_KEY: "server-secret" },
    }),
  (error) =>
    error instanceof LangChainLlmError
      && error.statusCode === 502
      && /未返回可解析/.test(error.message),
);

assert.throws(
  () => normalizeLangChainMessages([{ role: "tool", content: "Unsupported for now" }]),
  /不支持的 LangChain 消息角色/,
);
