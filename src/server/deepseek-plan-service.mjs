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
import {
  PlanningResultJsonSchema,
  PlanningResultSchema,
} from "../contracts/schemas.ts";
import {
  buildStructuredOutputRepairMessage,
  parseStructuredAiOutput,
} from "./structured-ai-output.ts";

const MAX_DEEPSEEK_PLAN_ATTEMPTS = 2;
const DEEPSEEK_PLAN_MAX_TOKENS = 6500;
const DEEPSEEK_PLAN_TIMEOUT_MS = 120_000;
const DEEPSEEK_PLAN_CALL_MAX_ATTEMPTS = 1;
const PLANNING_PROFILE_FIELD_LIMIT = 800;
const PLANNING_PROFILE_FIELD_COUNT_LIMIT = 24;
const PLANNING_ACTIVITY_SHORT_FIELD_LIMIT = 120;
const PLANNING_ACTIVITY_NAME_LIMIT = 240;
const PLANNING_ACTIVITY_DESCRIPTION_LIMIT = 1200;
const PLANNING_NARRATIVE_STARTER_LIMIT = 4;
const EXTERNAL_RESOURCE_VERIFICATION_MARKER = "待核验：名称、资格、截止日期、成本";
const GENERIC_EXTERNAL_ACRONYMS = new Set(["AI", "AP", "GIS", "IB", "NGO", "STEM"]);

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
    const timeoutMs = normalizePositiveInteger(env.DEEPSEEK_PLAN_TIMEOUT_MS, DEEPSEEK_PLAN_TIMEOUT_MS);
    const maxAttempts = normalizePositiveInteger(
      env.DEEPSEEK_PLAN_CALL_MAX_ATTEMPTS,
      DEEPSEEK_PLAN_CALL_MAX_ATTEMPTS,
    );
    let repairMessage = "";

    for (let attempt = 1; attempt <= MAX_DEEPSEEK_PLAN_ATTEMPTS; attempt += 1) {
      const llmResult = await invokePlanLlm({
        llmClient,
        metrics,
        env,
        model,
        maxTokens,
        timeoutMs,
        maxAttempts,
        signal,
        temperature: attempt === 1 ? 0.4 : 0.2,
        messages: [
          { role: "system", content: `${systemPrompt}\n\n${buildPlanningOutputContractInstruction()}` },
          { role: "user", content: buildDeepSeekPlanUserMessage(payload, { repairMessage }) },
        ],
      });
      const answer = String(llmResult?.content || "").trim();
      if (!answer) {
        repairMessage = "DeepSeek 未返回可解析的规划回答。";
      } else {
        const structured = parsePlanningOutput(answer);
        repairMessage = structured.error || "";
        if (structured.ok) {
          const quality = buildDeepSeekPlanQuality(model, structured.mode);
          if (structured.mode === "legacy_markdown") {
            quality.review = {
              required: true,
              reasons: ["legacy_markdown_fallback"],
              fallback: {
                triggered: true,
                message: "模型未返回 JSON，已使用兼容解析；用于申请决策前请人工复核。",
              },
            };
          }
          return {
            answer,
            parsed: structured.value,
            attempts: attempt,
            quality,
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
  timeoutMs,
  maxAttempts,
  temperature,
  messages,
  signal,
}) {
  const startedAt = monotonicNowMs();
  try {
    const result = await llmClient.invoke({
      env,
      feature: "deepseek-plan",
      model,
      temperature,
      maxTokens,
      timeoutMs,
      maxAttempts,
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
    "以下是用户提供的国际生背景信息。请基于固定Agent提示词完成规划，并按运行时 JSON Schema 输出。",
    "",
    "重要要求：",
    `- 输出列表必须恰好${PLANNING_ACTIVITY_COUNT}项。`,
    "- 只返回 JSON，不要 Markdown、表格、代码块或解释性前后缀。",
    "- narrative 字段必须包含完整的活动叙事逻辑解读。",
    "- narrative 中起步组合最多4项，输出前逐项计数；其余候选必须明确延后。",
    "- 若出现“如/例如+具体外部名称”，同一项必须逐字写“待核验：名称、资格、截止日期、成本”；否则改用通用类别。",
    repairMessage
      ? `- ${repairMessage}`
      : "",
    `- JSON Schema：${JSON.stringify(PlanningResultJsonSchema)}`,
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

function parsePlanningOutput(answer) {
  const structured = parseStructuredAiOutput(answer, PlanningResultSchema);
  if (structured.ok) {
    return validatePlanningOutputValue(structured.value, "json");
  }

  const legacy = parseAgentOutput(answer);
  const legacyValidation = PlanningResultSchema.safeParse(legacy);
  if (legacyValidation.success) {
    return validatePlanningOutputValue(legacyValidation.data, "legacy_markdown");
  }
  return {
    ok: false,
    error: buildStructuredOutputRepairMessage(structured.error, PlanningResultJsonSchema),
  };
}

function validatePlanningOutputValue(result, mode) {
  const value = ensureExternalResourceVerification(result);
  const narrativeError = findPlanningNarrativeConstraintError(value.narrative);
  if (narrativeError) return { ok: false, error: narrativeError };
  return { ok: true, value, mode };
}

export function findPlanningNarrativeConstraintError(narrative) {
  const text = String(narrative || "");
  const starterLabel = "起步组合";
  const starterIndex = text.indexOf(starterLabel);
  if (starterIndex < 0) return "";

  const remainder = text.slice(starterIndex + starterLabel.length);
  const boundaryIndexes = ["。", "其余", "后续"]
    .map((marker) => remainder.indexOf(marker))
    .filter((index) => index >= 0);
  const starterSegment = boundaryIndexes.length > 0
    ? remainder.slice(0, Math.min(...boundaryIndexes))
    : remainder;
  const activityIds = new Set();

  for (const match of starterSegment.matchAll(/活动\s*([1-9]\d*)/gu)) {
    addPlanningActivityId(activityIds, match[1]);
  }
  for (const match of starterSegment.matchAll(/(?:^|[\s：:，,、；;（(])([1-9]\d*)[.．]\s*/gu)) {
    addPlanningActivityId(activityIds, match[1]);
  }
  for (const match of starterSegment.matchAll(/[①-⑮]/gu)) {
    addPlanningActivityId(activityIds, match[0].codePointAt(0) - 0x245f);
  }

  const declaredCount = Number(starterSegment.match(/(?:共\s*)?([1-9]\d*)\s*项/u)?.[1] || 0);
  const starterCount = Math.max(activityIds.size, declaredCount);
  if (starterCount <= PLANNING_NARRATIVE_STARTER_LIMIT) return "";
  return `起步组合识别到 ${starterCount} 项，超过4项；请仅保留最多4项，并把其余候选明确延后。`;
}

function addPlanningActivityId(activityIds, rawId) {
  const activityId = Number(rawId);
  if (Number.isInteger(activityId) && activityId >= 1 && activityId <= PLANNING_ACTIVITY_COUNT) {
    activityIds.add(activityId);
  }
}

export function ensureExternalResourceVerification(result) {
  return {
    ...result,
    activities: (result?.activities || []).map((activity) => {
      const text = `${activity.activityName || ""}\n${activity.executionDescription || ""}`;
      if (text.includes(EXTERNAL_RESOURCE_VERIFICATION_MARKER)) return activity;
      if (!hasExampleSpecificExternalName(text) && !hasNamedExternalAcronym(text)) return activity;
      const description = String(activity.executionDescription || "").trim();
      return {
        ...activity,
        executionDescription: `${description}${description ? "；" : ""}${EXTERNAL_RESOURCE_VERIFICATION_MARKER}`,
      };
    }),
  };
}

function hasExampleSpecificExternalName(text) {
  return /(?:如|例如)[：:\s（(]*[^。；;\n]{0,120}[A-Za-z][A-Za-z0-9]/u.test(text);
}

function hasNamedExternalAcronym(text) {
  const opportunityContext = /竞赛|赛事|考试|夏校|课程|工作坊|组织|协会|期刊|投稿|项目/u.test(text);
  if (!opportunityContext) return false;
  const acronyms = String(text).match(/\b[A-Z]{2,}[A-Z0-9/-]*\b/gu) || [];
  return acronyms.some((token) => !GENERIC_EXTERNAL_ACRONYMS.has(token));
}

function buildPlanningOutputContractInstruction() {
  return [
    "运行时输出契约覆盖原提示词中的 Markdown 展示格式，但不改变其顾问规则和业务要求。",
    "只返回严格 JSON；不得输出 Markdown 或代码块。",
    `JSON Schema：${JSON.stringify(PlanningResultJsonSchema)}`,
  ].join("\n");
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDeepSeekPlanQuality(model, validationMode = "json") {
  return buildAiRequestQuality({
    feature: "deepseek-plan",
    promptVersion: AI_QUALITY_VERSIONS.deepseekPlanPrompt,
    model,
    sourceSetVersion: AI_QUALITY_VERSIONS.noSourceSet,
    parserVersion: AI_QUALITY_VERSIONS.deepseekPlanParser,
    extraMetadata: {
      outputSchema: "PlanningResult",
      validationMode,
    },
  });
}
