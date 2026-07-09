import { readFile } from "node:fs/promises";
import {
  PLANNING_ACTIVITY_COUNT,
  markdownToPlainText,
  parseAgentOutput,
} from "../domain/agent-output-parser.mjs";
import { resolveApiKey } from "./api-key.mjs";
import { AI_QUALITY_VERSIONS, buildAiRequestQuality } from "./ai-quality.mjs";
import { normalizeDeepSeekModel } from "./deepseek-model.mjs";
import {
  LangChainLlmError,
  createLangChainDeepSeekClient,
} from "./langchain-llm-client.mjs";
import { monotonicNowMs } from "./observability.mjs";

const MAX_DEEPSEEK_PLAN_ATTEMPTS = 2;
const DEEPSEEK_PLAN_MAX_TOKENS = 6500;
const PLANNING_PROFILE_FIELD_LIMIT = 800;
const PLANNING_PROFILE_FIELD_COUNT_LIMIT = 24;
const PLANNING_ACTIVITY_SHORT_FIELD_LIMIT = 120;
const PLANNING_ACTIVITY_NAME_LIMIT = 240;
const PLANNING_ACTIVITY_DESCRIPTION_LIMIT = 1200;

export class DeepSeekPlanError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "DeepSeekPlanError";
    this.statusCode = statusCode;
  }
}

export function createDeepSeekPlanService({
  promptPath,
  readPrompt = readFile,
  llmClient = createLangChainDeepSeekClient(),
  metrics = null,
} = {}) {
  async function generatePlan({ payload = {}, env = process.env, signal } = {}) {
    const apiKey = resolveApiKey({
      environmentApiKey: env.DEEPSEEK_API_KEY,
      requestApiKey: "",
    });
    if (!apiKey) {
      throw new DeepSeekPlanError("DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。", 400);
    }

    const systemPrompt = await readPrompt(promptPath, "utf8");
    const model = normalizeDeepSeekModel(env.DEEPSEEK_PLAN_MODEL, "deepseek-v4-flash");
    const maxTokens = normalizePositiveInteger(env.DEEPSEEK_PLAN_MAX_TOKENS, DEEPSEEK_PLAN_MAX_TOKENS);
    let repairMessage = "";

    for (let attempt = 1; attempt <= MAX_DEEPSEEK_PLAN_ATTEMPTS; attempt += 1) {
      const llmResult = await invokePlanLlm({
        llmClient,
        metrics,
        env,
        model,
        maxTokens,
        signal,
        temperature: attempt === 1 ? 0.4 : 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildDeepSeekPlanUserMessage(payload, { repairMessage }) },
        ],
      });
      const answer = String(llmResult?.content || "").trim();
      if (!answer) {
        repairMessage = "DeepSeek 未返回可解析的规划回答。";
      } else {
        const parsed = parseAgentOutput(answer);
        repairMessage = validateParsedDeepSeekPlan(parsed);
        if (!repairMessage) {
          return {
            answer,
            parsed,
            attempts: attempt,
            quality: buildDeepSeekPlanQuality(model),
          };
        }
      }
    }

    throw new DeepSeekPlanError(
      `${repairMessage || "DeepSeek 未返回完整规划回答。"} 请缩短超长输入后重试。`,
      502,
    );
  }

  return { generatePlan };
}

async function invokePlanLlm({
  llmClient,
  metrics,
  env,
  model,
  maxTokens,
  temperature,
  messages,
  signal,
}) {
  const startedAt = monotonicNowMs();
  try {
    const result = await llmClient.invoke({
      env,
      model,
      temperature,
      maxTokens,
      messages,
      signal,
    });
    metrics?.recordAiCall?.({
      feature: "deepseek-plan",
      ok: true,
      statusCode: 200,
      durationMs: monotonicNowMs() - startedAt,
    });
    return result;
  } catch (error) {
    const mappedError = mapPlanLlmError(error);
    metrics?.recordAiCall?.({
      feature: "deepseek-plan",
      ok: false,
      statusCode: mappedError.statusCode || 0,
      durationMs: monotonicNowMs() - startedAt,
    });
    throw mappedError;
  }
}

function mapPlanLlmError(error) {
  if (error instanceof DeepSeekPlanError) return error;
  if (error instanceof LangChainLlmError) {
    return new DeepSeekPlanError(error.message, error.statusCode || 502);
  }
  return new DeepSeekPlanError(error?.message || "Agent调用失败。", error?.statusCode || 502);
}

export function buildDeepSeekPlanUserMessage(payload, { repairMessage = "" } = {}) {
  const compactedPayload = compactDeepSeekPlanPayload(payload);
  return [
    "以下是用户提供的国际生背景信息。请基于固定Agent提示词完成规划，并严格按照提示词中的Expected Output Format输出。",
    "",
    "重要要求：",
    `- 输出列表必须恰好${PLANNING_ACTIVITY_COUNT}项。`,
    "- 最终回答中的表格将被系统解析并填入页面表格。",
    "- 不要省略【活动叙事逻辑解读】。",
    repairMessage
      ? `- 上一次回答未通过解析校验：${repairMessage}。请补齐完整${PLANNING_ACTIVITY_COUNT}项表格和【活动叙事逻辑解读】。`
      : "",
    "",
    "用户基础输入：",
    JSON.stringify(compactedPayload.profile, null, 2),
    "",
    "用户当前已有课外活动表格草稿：",
    JSON.stringify(compactedPayload.activities, null, 2),
  ].join("\n");
}

export function compactDeepSeekPlanPayload(payload = {}) {
  return {
    profile: compactDeepSeekPlanProfile(payload.profile),
    activities: compactDeepSeekPlanActivities(payload.activities),
  };
}

function compactDeepSeekPlanProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  return Object.fromEntries(
    Object.entries(profile)
      .slice(0, PLANNING_PROFILE_FIELD_COUNT_LIMIT)
      .map(([key, value]) => [key, truncateDeepSeekPlanText(value, PLANNING_PROFILE_FIELD_LIMIT)])
      .filter(([, value]) => value),
  );
}

function compactDeepSeekPlanActivities(activities) {
  if (!Array.isArray(activities)) return [];
  return activities
    .slice(0, PLANNING_ACTIVITY_COUNT)
    .map((activity, index) => ({
      id: Number(activity?.id) || index + 1,
      type: truncateDeepSeekPlanText(activity?.type, PLANNING_ACTIVITY_SHORT_FIELD_LIMIT),
      activityName: truncateDeepSeekPlanText(activity?.activityName, PLANNING_ACTIVITY_NAME_LIMIT),
      executionDescription: truncateDeepSeekPlanText(
        activity?.executionDescription,
        PLANNING_ACTIVITY_DESCRIPTION_LIMIT,
      ),
      suggestedGrade: truncateDeepSeekPlanText(activity?.suggestedGrade, PLANNING_ACTIVITY_SHORT_FIELD_LIMIT),
    }))
    .filter((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].some(Boolean),
    );
}

function truncateDeepSeekPlanText(value, maxLength) {
  const text = markdownToPlainText(formatDeepSeekPlanValue(value));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatDeepSeekPlanValue(value) {
  if (Array.isArray(value)) return value.map(formatDeepSeekPlanValue).filter(Boolean).join("；");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function validateParsedDeepSeekPlan(parsed) {
  const activityCount = parsed?.activities?.length || 0;
  if (activityCount < PLANNING_ACTIVITY_COUNT) {
    return `只识别到 ${activityCount} 项活动，少于要求的 ${PLANNING_ACTIVITY_COUNT} 项。`;
  }
  if (!parsed?.narrative) {
    return "缺少【活动叙事逻辑解读】。";
  }
  return "";
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDeepSeekPlanQuality(model) {
  return buildAiRequestQuality({
    feature: "deepseek-plan",
    promptVersion: AI_QUALITY_VERSIONS.deepseekPlanPrompt,
    model,
    sourceSetVersion: AI_QUALITY_VERSIONS.noSourceSet,
    parserVersion: AI_QUALITY_VERSIONS.deepseekPlanParser,
  });
}
