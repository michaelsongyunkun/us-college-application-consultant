import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentOutput } from "./agent-output-parser.mjs";
import { resolveApiKey } from "./api-key.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const promptPath = join(root, "prompts", "us-college-admissions-strategist-agent.md");
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".md": "text/markdown;charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json;charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildUserMessage(payload) {
  return [
    "以下是用户提供的国际生背景信息。请基于固定Agent提示词完成规划，并严格按照提示词中的Expected Output Format输出。",
    "",
    "重要要求：",
    "- 输出列表必须恰好10项。",
    "- 最终回答中的表格将被系统解析并填入页面表格。",
    "- 不要省略【活动叙事逻辑解读】。",
    "",
    "用户基础输入：",
    JSON.stringify(payload.profile || {}, null, 2),
    "",
    "用户当前已有课外活动表格草稿：",
    JSON.stringify(payload.activities || [], null, 2),
  ].join("\n");
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function handlePlan(request, response) {
  const payload = await readRequestJson(request);
  const apiKey = resolveApiKey({
    environmentApiKey: process.env.OPENAI_API_KEY,
    requestApiKey: payload.apiKey,
  });
  if (!apiKey) {
    sendJson(response, 500, {
      error: "缺少 OPENAI_API_KEY。请在启动服务前设置环境变量，或在页面中间 Agent 层临时输入 API Key 后再生成规划回答。",
    });
    return;
  }

  const systemPrompt = await readFile(promptPath, "utf8");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserMessage(payload) },
      ],
      temperature: 0.4,
    }),
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    sendJson(response, apiResponse.status, {
      error: data.error?.message || "Agent调用失败。",
    });
    return;
  }

  const answer = extractResponseText(data);
  sendJson(response, 200, {
    answer,
    parsed: parseAgentOutput(answer),
  });
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/api/prompt") {
      const prompt = await readFile(promptPath, "utf8");
      sendJson(response, 200, { prompt, hasApiKey: Boolean(process.env.OPENAI_API_KEY) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/plan") {
      await handlePlan(request, response);
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405);
      response.end("Method Not Allowed");
      return;
    }

    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(root, requestPath));
    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "text/plain;charset=utf-8",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
}

createServer(handleRequest).listen(port, host, () => {
  console.log(`US college consultant running at http://${host}:${port}`);
});
