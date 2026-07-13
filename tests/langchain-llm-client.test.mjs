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
  modelKwargs: {
    thinking: { type: "disabled" },
  },
  maxTokens: 1200,
});
assert.equal(calls[0].callOptions.signal, "mock-signal");
assert.equal(calls[0].messages[0]._getType(), "system");
assert.equal(calls[0].messages[1]._getType(), "human");
assert.equal(calls[0].messages[0].content, "System prompt");
assert.equal(calls[0].messages[1].content, "User question");

const policyCalls = [];
const policySignals = [];
const timeoutClient = createLangChainDeepSeekClient({
  callPolicy: {
    async execute(options) {
      policyCalls.push(options);
      const value = await options.operation({
        model: options.primaryModel,
        attempt: 1,
        signal: "policy-timeout-signal",
      });
      return { ...value, selectedModel: options.primaryModel };
    },
  },
  chatModelFactory() {
    return {
      async invoke(_messages, callOptions) {
        policySignals.push(callOptions?.signal);
        return { content: "timeout override response" };
      },
    };
  },
});
await timeoutClient.invoke({
  env: { DEEPSEEK_API_KEY: "server-secret" },
  feature: "deepseek-plan",
  model: "deepseek-v4-flash",
  messages: [["user", "Test timeout"]],
  timeoutMs: 75_000,
});
assert.equal(policyCalls.length, 1);
assert.equal(policyCalls[0].feature, "deepseek-plan");
assert.equal(policyCalls[0].timeoutMs, 75_000);
assert.deepEqual(policySignals, ["policy-timeout-signal"]);

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

const originalFetch = globalThis.fetch;
let sdkRequestBody = null;
try {
  globalThis.fetch = async (_url, options = {}) => {
    sdkRequestBody = JSON.parse(String(options.body || "{}"));
    return new Response(
      JSON.stringify({
        id: "mock-deepseek-response",
        object: "chat.completion",
        created: 1,
        model: sdkRequestBody.model,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "{\"ok\":true}" },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const sdkClient = createLangChainDeepSeekClient();
  await sdkClient.invoke({
    env: { DEEPSEEK_API_KEY: "sdk-boundary-secret" },
    model: "deepseek-v4-flash",
    messages: [["user", "Return JSON"]],
    temperature: 0.2,
    maxTokens: 9000,
  });

  assert.equal(sdkRequestBody.temperature, 0.2);
  assert.deepEqual(
    sdkRequestBody.thinking,
    { type: "disabled" },
    "DeepSeek V4 requests with temperature must explicitly disable thinking mode.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
