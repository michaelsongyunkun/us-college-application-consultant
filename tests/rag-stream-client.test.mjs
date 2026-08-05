import assert from "node:assert/strict";
import { readRagEventStream, requestRagStream } from "../src/client/rag-stream.mjs";

const encoder = new TextEncoder();
const streamedDeltas = [];
const response = new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('event: status\ndata: {"stage":"retrieval_started"}\n\nevent: delta\ndata: {"text":"第一段"}\n\nevent: res'));
    controller.enqueue(encoder.encode('ult\ndata: {"answer":"第一段，第二段","sources":[]}\n\nevent: delta\ndata: {"text":"，第二段"}\n\nevent: done\ndata: {}\n\n'));
    controller.close();
  },
}), { status: 200, headers: { "content-type": "text/event-stream" } });
assert.deepEqual(
  await readRagEventStream(response, { onDelta: (text) => streamedDeltas.push(text) }),
  { answer: "第一段，第二段", sources: [] },
);
assert.deepEqual(streamedDeltas, ["第一段", "，第二段"]);

let request = null;
const result = await requestRagStream(
  { question: "major match", assistantProfile: "major-match" },
  {
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response('event: result\ndata: {"answer":"matched"}\n\nevent: done\ndata: {}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
  },
);
assert.equal(request.url, "/api/deepseek-rag/stream");
assert.equal(request.options.method, "POST");
assert.deepEqual(JSON.parse(request.options.body), { question: "major match", assistantProfile: "major-match" });
assert.equal(result.answer, "matched");

await assert.rejects(
  requestRagStream({ question: "offline" }, { fetcher: async () => new Response("Not found", { status: 404 }) }),
  (error) => error.fallbackAllowed === true,
);

await assert.rejects(
  requestRagStream({ question: "rate limited" }, { fetcher: async () => new Response("Too many requests", { status: 429 }) }),
  (error) => error.status === 429 && error.fallbackAllowed === true,
);
await assert.rejects(
  readRagEventStream(new Response('event: error\ndata: {"error":"generation failed"}\n\n', {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })),
  (error) => error.message === "generation failed" && error.fallbackAllowed === false,
);

await assert.rejects(
  readRagEventStream(new Response('event: error\ndata: {"error":"temporary upstream failure","fallbackAllowed":true,"retryable":true}\n\n', {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })),
  (error) => error.message === "temporary upstream failure"
    && error.fallbackAllowed === true
    && error.retryable === true,
);

await assert.rejects(
  requestRagStream(
    { question: "interrupted" },
    {
      fetcher: async () => new Response('event: status\ndata: {"stage":"retrieval_started"}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    },
  ),
  (error) => error.fallbackAllowed === true,
);
