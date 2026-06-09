import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLANNING_ACTIVITY_COUNT,
  markdownToPlainText,
  parseAgentOutput,
} from "./src/domain/agent-output-parser.mjs";
import { resolveApiKey } from "./src/server/api-key.mjs";
import { createAuthDatabase } from "./src/server/auth-db.mjs";
import { AuthError, createAuthService } from "./src/server/auth-service.mjs";
import {
  ActivityPortfolioError,
  createActivityPortfolioService,
} from "./src/server/activity-portfolio-service.mjs";
import {
  PortfolioCapabilityAgentError,
  createPortfolioCapabilityAgentService,
} from "./src/server/portfolio-capability-agent-service.mjs";
import {
  DeepSeekRagError,
  createDeepSeekRagService,
} from "./src/server/deepseek-rag-service.mjs";
import { createMailerFromEnv } from "./src/server/mailer.mjs";
import { PlanningError, createPlanningService } from "./src/server/planning-service.mjs";
import {
  ProgressPlannerError,
  createProgressPlannerService,
} from "./src/server/progress-planner-service.mjs";
import { loadEnvFile } from "./src/server/env-loader.mjs";
import { normalizeDeepSeekModel } from "./src/server/deepseek-model.mjs";
import {
  SchoolSelectionError,
  createSchoolSelectionService,
} from "./src/server/school-selection-service.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const envFileStatus = loadEnvFile(join(root, ".env"));
const promptPath = join(root, "prompts", "us-college-admissions-strategist-agent.md");
const defaultDatabasePath = join(root, "data", "auth.sqlite");
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "0.0.0.0";
const sessionCookieName = "consultant_session";
const passwordResetSafeMessage = "如果邮箱已注册，重置邮件会发送到该邮箱。";
const DEFAULT_MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_DEEPSEEK_PLAN_ATTEMPTS = 2;
const DEEPSEEK_PLAN_MAX_TOKENS = 6500;
const PLANNING_PROFILE_FIELD_LIMIT = 800;
const PLANNING_PROFILE_FIELD_COUNT_LIMIT = 24;
const PLANNING_ACTIVITY_SHORT_FIELD_LIMIT = 120;
const PLANNING_ACTIVITY_NAME_LIMIT = 240;
const PLANNING_ACTIVITY_DESCRIPTION_LIMIT = 1200;
const DEFAULT_RATE_LIMITS = {
  "/api/auth/register": { maxRequests: 5, windowMs: 60_000 },
  "/api/auth/login": { maxRequests: 10, windowMs: 60_000 },
  "/api/auth/request-password-reset": { maxRequests: 3, windowMs: 60_000 },
  "/api/auth/reset-password": { maxRequests: 5, windowMs: 60_000 },
  "/api/feedback": { maxRequests: 10, windowMs: 60_000 },
  "/api/deepseek-plan": { maxRequests: 10, windowMs: 60_000 },
  "/api/deepseek-rag": { maxRequests: 20, windowMs: 60_000 },
  "/api/portfolio-capability-assessment": { maxRequests: 10, windowMs: 60_000 },
  "/api/school-selection": { maxRequests: 10, windowMs: 60_000 },
  "/api/school-selection-jobs": { maxRequests: 10, windowMs: 60_000 },
  "/api/analytics/usage-event": { maxRequests: 120, windowMs: 60_000 },
};
const SCHOOL_SELECTION_JOB_TTL_MS = 30 * 60_000;
const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

class RequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "RequestError";
    this.statusCode = statusCode;
  }
}

const contentTypes = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".svg": "image/svg+xml;charset=utf-8",
  ".xml": "application/xml;charset=utf-8",
  ".txt": "text/plain;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".md": "text/markdown;charset=utf-8",
};

const staticCacheExtensions = new Set([".css", ".svg"]);
const revalidatedCacheExtensions = new Set([".js", ".mjs"]);

function cacheHeadersForPath(filePath) {
  const extension = extname(filePath);
  if (staticCacheExtensions.has(extension)) {
    return { "Cache-Control": "public, max-age=86400" };
  }
  if (revalidatedCacheExtensions.has(extension)) {
    return { "Cache-Control": "no-cache" };
  }
  if (extension === ".html") {
    return { "Cache-Control": "no-cache" };
  }
  return {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, withSecurityHeaders({ "Content-Type": "application/json;charset=utf-8" }));
  response.end(JSON.stringify(payload));
}

function sendAuthJson(response, statusCode, payload) {
  sendJson(response, statusCode, payload);
}

function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

async function readRequestText(request, maxBytes = DEFAULT_MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestError("Request body too large", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readRequestJson(request, maxBytes = DEFAULT_MAX_REQUEST_BODY_BYTES) {
  const raw = await readRequestText(request, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError("Invalid JSON body", 400);
  }
}

function getCookieValues(request, cookieName) {
  const values = [];
  const cookieHeader = request.headers.cookie || "";
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName !== cookieName) continue;
    values.push(decodeURIComponent(rawValue.join("=")));
  }
  return values;
}

function buildSessionCookie(sessionToken, { expiresAt } = {}) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (expiresAt) parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  if (shouldUseSecureCookies(process.env)) parts.push("Secure");
  return parts.join("; ");
}

function buildClearSessionCookie({ domain } = {}) {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (shouldUseSecureCookies(process.env)) parts.push("Secure");
  return parts.join("; ");
}

function buildClearSessionCookies(request) {
  const host = (request.headers.host || "").split(":")[0].toLowerCase();
  const cookies = [buildClearSessionCookie()];
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/u.test(host);
  if (host && host !== "localhost" && host.includes(".") && !isIpAddress) {
    cookies.push(buildClearSessionCookie({ domain: host }));
  }
  return cookies;
}

function wantsHtmlResponse(request) {
  const accept = request.headers.accept || "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

async function readAuthPayload(request, readJson) {
  const contentType = request.headers["content-type"] || "";
  if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await readRequestText(request)));
  }
  return readJson(request);
}

export function shouldUseSecureCookies(env = process.env) {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  return env.NODE_ENV === "production";
}

function getSessionTokens(request) {
  return getCookieValues(request, sessionCookieName).filter(Boolean);
}

function getUserForRequest(request, auth) {
  const sessionTokens = getSessionTokens(request);
  for (let index = sessionTokens.length - 1; index >= 0; index -= 1) {
    const user = auth.getUserForSession(sessionTokens[index]);
    if (user) return user;
  }
  return null;
}

function getRequestMetadata(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim() || request.socket.remoteAddress || "";
  return {
    userAgent: request.headers["user-agent"] || "",
    ipAddress,
  };
}

function buildUserMessage(payload, { repairMessage = "" } = {}) {
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

function compactDeepSeekPlanPayload(payload = {}) {
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

function validateParsedDeepSeekPlan(parsed) {
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

function extractDeepSeekResponseText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function handleDeepSeekPlan(
  request,
  response,
  { readJson = readRequestJson, env = process.env, deepSeekFetch = fetch } = {},
) {
  const payload = await readJson(request);
  const apiKey = resolveApiKey({
    environmentApiKey: env.DEEPSEEK_API_KEY,
    requestApiKey: "",
  });
  if (!apiKey) {
    sendJson(response, 400, {
      error: "DeepSeek API 尚未配置。请在服务端配置 DEEPSEEK_API_KEY。",
    });
    return;
  }

  const systemPrompt = await readFile(promptPath, "utf8");
  const model = normalizeDeepSeekModel(env.DEEPSEEK_PLAN_MODEL, "deepseek-v4-flash");
  const maxTokens = normalizePositiveInteger(env.DEEPSEEK_PLAN_MAX_TOKENS, DEEPSEEK_PLAN_MAX_TOKENS);
  let repairMessage = "";

  for (let attempt = 1; attempt <= MAX_DEEPSEEK_PLAN_ATTEMPTS; attempt += 1) {
    const apiResponse = await deepSeekFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserMessage(payload, { repairMessage }) },
        ],
        thinking: { type: "disabled" },
        stream: false,
        temperature: attempt === 1 ? 0.4 : 0.2,
        max_tokens: maxTokens,
      }),
    });

    const data = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      sendJson(response, apiResponse.status, {
        error: data.error?.message || "Agent调用失败。",
      });
      return;
    }

    const answer = extractDeepSeekResponseText(data);
    if (!answer) {
      repairMessage = "DeepSeek 未返回可解析的规划回答。";
    } else {
      const parsed = parseAgentOutput(answer);
      repairMessage = validateParsedDeepSeekPlan(parsed);
      if (!repairMessage) {
        sendJson(response, 200, {
          answer,
          parsed,
          attempts: attempt,
        });
        return;
      }
    }
  }

  sendJson(response, 502, {
    error: `${repairMessage || "DeepSeek 未返回完整规划回答。"} 请缩短超长输入后重试。`,
  });
}

function getAppBaseUrl(request, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
  return `${protocol}://${request.headers.host}`;
}

function createAuthHandler(auth, { mailer, appBaseUrl, readJson = readRequestJson } = {}) {
  return async function handleAuth(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/auth/me") {
      const user = getUserForRequest(request, auth);
      if (!user) {
        sendAuthJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      sendAuthJson(response, 200, { user });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/register") {
      const result = auth.register(await readAuthPayload(request, readJson), getRequestMetadata(request));
      const headers = {
        "Set-Cookie": buildSessionCookie(result.sessionToken, { expiresAt: result.expiresAt }),
      };
      if (wantsHtmlResponse(request)) {
        response.writeHead(303, withSecurityHeaders({
          ...headers,
          Location: "/",
        }));
        response.end();
        return true;
      }
      response.writeHead(200, withSecurityHeaders({
        ...headers,
        "Content-Type": "application/json;charset=utf-8",
      }));
      response.end(JSON.stringify({ user: result.user }));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const result = auth.login(await readAuthPayload(request, readJson), getRequestMetadata(request));
      const headers = {
        "Set-Cookie": buildSessionCookie(result.sessionToken, { expiresAt: result.expiresAt }),
      };
      if (wantsHtmlResponse(request)) {
        response.writeHead(303, withSecurityHeaders({
          ...headers,
          Location: "/",
        }));
        response.end();
        return true;
      }
      response.writeHead(200, withSecurityHeaders({
        ...headers,
        "Content-Type": "application/json;charset=utf-8",
      }));
      response.end(JSON.stringify({ user: result.user }));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      for (const sessionToken of getSessionTokens(request)) {
        auth.logout(sessionToken);
      }
      const logoutHeaders = {
        "Set-Cookie": buildClearSessionCookies(request),
        "Clear-Site-Data": '"cookies"',
      };
      if (wantsHtmlResponse(request)) {
        response.writeHead(303, withSecurityHeaders({
          ...logoutHeaders,
          Location: "/",
        }));
        response.end();
        return true;
      }
      response.writeHead(200, withSecurityHeaders({
        ...logoutHeaders,
        "Content-Type": "application/json;charset=utf-8",
      }));
      response.end(JSON.stringify({ ok: true }));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/request-password-reset") {
      const payload = await readJson(request);
      try {
        const result = auth.createPasswordReset(payload.email);
        if (result) {
          const resetUrl = `${getAppBaseUrl(request, appBaseUrl)}/?resetToken=${encodeURIComponent(
            result.resetToken,
          )}`;
          await mailer.sendPasswordResetEmail({
            to: result.user.email,
            name: result.user.name,
            resetUrl,
            expiresAt: result.expiresAt,
          });
        }
      } catch (error) {
        console.error("Password reset request failed:", error.message);
      }
      sendAuthJson(response, 200, { message: passwordResetSafeMessage });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/reset-password") {
      const payload = await readJson(request);
      const user = auth.resetPassword({
        resetToken: payload.token,
        password: payload.password,
      });
      sendAuthJson(response, 200, { user });
      return true;
    }

    return false;
  };
}

function requireUser(request, response, auth) {
  const user = getUserForRequest(request, auth);
  if (user) return user;
  sendAuthJson(response, 401, { error: "Not authenticated" });
  return null;
}

function requirePageUser(request, response, auth, requestPath) {
  const user = getUserForRequest(request, auth);
  if (user) return user;
  redirectToLogin(response, requestPath);
  return null;
}

function requireAdmin(request, response, auth, { redirect = false } = {}) {
  const user = getUserForRequest(request, auth);
  if (user?.role === "admin") return user;
  if (redirect) {
    response.writeHead(302, withSecurityHeaders({ Location: "/" }));
    response.end();
    return null;
  }
  sendAuthJson(response, user ? 403 : 401, {
    error: user ? "Admin access required" : "Not authenticated",
  });
  return null;
}

function redirectToLogin(response, requestPath = "/") {
  response.writeHead(302, withSecurityHeaders({
    Location: `/?next=${encodeURIComponent(requestPath)}`,
  }));
  response.end();
}

function renderIndexForAuthMode(html, authMode) {
  if (authMode !== "login") return html;
  return html
    .replace(
      '<form id="authForm" class="auth-form" method="post" action="/api/auth/register">',
      '<form id="authForm" class="auth-form" method="post" action="/api/auth/login">',
    )
    .replace('<h2 id="auth-title">领取你的申请行动地图</h2>', '<h2 id="auth-title">登录</h2>')
    .replace('<label id="authNameField">', '<label id="authNameField" class="is-hidden">')
    .replace(
      '<button id="authSubmitButton" type="submit">免费注册并生成规划</button>',
      '<button id="authSubmitButton" type="submit">登录</button>',
    )
    .replace(
      '<button id="forgotPasswordButton" type="button" class="quiet auth-mode-button is-hidden">忘记密码？</button>',
      '<button id="forgotPasswordButton" type="button" class="quiet auth-mode-button">忘记密码？</button>',
    )
    .replace(
      '<a id="authModeButton" href="/?auth=login" class="quiet auth-mode-button">已有账号？登录</a>',
      '<a id="authModeButton" href="/?auth=register" class="quiet auth-mode-button">没有账号？注册</a>',
    );
}

function renderIndexForSession(html, user, authMode = "register") {
  const renderedHtml = renderIndexForAuthMode(html, authMode);
  if (!user) return renderedHtml;
  return renderedHtml
    .replace(
      '<section id="authShell" class="landing-shell" aria-labelledby="landing-title">',
      '<section id="authShell" class="landing-shell is-hidden" aria-labelledby="landing-title">',
    )
    .replace(
      '<main id="appShell" class="app-shell command-shell is-hidden">',
      '<main id="appShell" class="app-shell command-shell">',
    );
}

function createRateLimiter(rateLimits) {
  const entries = new Map();

  return function getRateLimit(request, pathname) {
    const limit = rateLimits[pathname];
    if (!limit) return null;

    const now = Date.now();
    const key = `${pathname}:${getRequestMetadata(request).ipAddress}`;
    const requests = (entries.get(key) || []).filter(
      (timestamp) => timestamp > now - limit.windowMs,
    );
    if (requests.length >= limit.maxRequests) {
      entries.set(key, requests);
      return Math.max(1, Math.ceil((requests[0] + limit.windowMs - now) / 1000));
    }

    requests.push(now);
    entries.set(key, requests);
    return null;
  };
}

function serializeSchoolSelectionJob(job) {
  const payload = {
    jobId: job.id,
    status: job.status,
  };
  if (job.status === "completed") {
    payload.result = job.result;
  }
  if (job.status === "failed") {
    payload.error = job.error || "School selection generation failed.";
    payload.statusCode = job.statusCode || 500;
  }
  return payload;
}

function getSchoolSelectionJobError(error) {
  if (error instanceof SchoolSelectionError || error instanceof RequestError) {
    return {
      error: error.message,
      statusCode: error.statusCode,
    };
  }
  console.error("Unexpected school selection job error:", error);
  return {
    error: "Server error",
    statusCode: 500,
  };
}

function startSchoolSelectionJob(job, { schoolSelection, user, payload, env, deepSeekFetch }) {
  Promise.resolve()
    .then(async () => {
      job.status = "running";
      job.updatedAt = Date.now();
      job.result = await schoolSelection.generateSelection({
        user,
        payload,
        env,
        deepSeekFetch,
      });
      job.status = "completed";
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
    })
    .catch((error) => {
      const normalizedError = getSchoolSelectionJobError(error);
      job.status = "failed";
      job.error = normalizedError.error;
      job.statusCode = normalizedError.statusCode;
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
    });
}

export function resolveDatabasePath(env = process.env) {
  return env.AUTH_DATABASE_PATH || env.DATABASE_PATH || defaultDatabasePath;
}

export function createAppServer({
  env = process.env,
  databasePath = resolveDatabasePath(env),
  authDb = createAuthDatabase({ databasePath }),
  auth = createAuthService({ authDb }),
  planning = createPlanningService({ authDb }),
  progressPlanner = createProgressPlannerService({ authDb }),
  activityPortfolio = createActivityPortfolioService({ authDb }),
  portfolioCapabilityAgent = createPortfolioCapabilityAgentService({ activityPortfolio }),
  deepSeekRag = createDeepSeekRagService({ root, planning, activityPortfolio }),
  schoolSelection = createSchoolSelectionService({ activityPortfolio, root }),
  mailer = createMailerFromEnv(env),
  appBaseUrl = env.APP_BASE_URL || "",
  deepSeekFetch = fetch,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  rateLimits = DEFAULT_RATE_LIMITS,
} = {}) {
  const readJson = (request) => readRequestJson(request, maxRequestBodyBytes);
  const handleAuth = createAuthHandler(auth, { mailer, appBaseUrl, readJson });
  const getRateLimit = createRateLimiter(rateLimits);
  const schoolSelectionJobs = new Map();

  function pruneSchoolSelectionJobs() {
    const expiredBefore = Date.now() - SCHOOL_SELECTION_JOB_TTL_MS;
    for (const [jobId, job] of schoolSelectionJobs) {
      if (job.updatedAt < expiredBefore) schoolSelectionJobs.delete(jobId);
    }
  }

  function createSchoolSelectionJob(user, payload) {
    pruneSchoolSelectionJobs();
    const now = Date.now();
    const job = {
      id: randomUUID(),
      userId: user.id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    schoolSelectionJobs.set(job.id, job);
    startSchoolSelectionJob(job, { schoolSelection, user, payload, env, deepSeekFetch });
    return job;
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${host}:${port}`);

      if (request.method === "POST") {
        const retryAfterSeconds = getRateLimit(request, url.pathname);
        if (retryAfterSeconds) {
          response.setHeader("Retry-After", String(retryAfterSeconds));
          sendJson(response, 429, { error: "Too many requests. Please try again later." });
          return;
        }
      }

      if (await handleAuth(request, response, url.pathname)) return;

      if (request.method === "POST" && url.pathname === "/api/feedback") {
        const feedback = auth.recordFeedback({
          user: getUserForRequest(request, auth),
          payload: await readJson(request),
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 201, { ok: true, feedback });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/prompt") {
        if (!requireUser(request, response, auth)) return;
        const prompt = await readFile(promptPath, "utf8");
        sendJson(response, 200, { prompt, hasDeepSeekApiKey: Boolean(env.DEEPSEEK_API_KEY) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-plan") {
        if (!requireUser(request, response, auth)) return;
        await handleDeepSeekPlan(request, response, { readJson, env, deepSeekFetch });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-rag") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        sendJson(response, 200, await deepSeekRag.answerQuestion({
          user,
          question: payload.question,
          historySummary: payload.historySummary,
          assistantProfile: payload.assistantProfile,
          env,
          deepSeekFetch,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/school-selection") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, await schoolSelection.generateSelection({
          user,
          payload: await readJson(request),
          env,
          deepSeekFetch,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/school-selection-jobs") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const job = createSchoolSelectionJob(user, await readJson(request));
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const schoolSelectionJobMatch = url.pathname.match(/^\/api\/school-selection-jobs\/([a-f0-9-]{36})$/);
      if (request.method === "GET" && schoolSelectionJobMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        pruneSchoolSelectionJobs();
        const job = schoolSelectionJobs.get(schoolSelectionJobMatch[1]);
        if (!job || job.userId !== user.id) {
          sendJson(response, 404, { error: "School selection job not found." });
          return;
        }
        sendJson(response, 200, serializeSchoolSelectionJob(job));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/student-profile") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, planning.getProfile(user));
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/student-profile") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        sendJson(response, 200, planning.saveProfile(user, payload.profile || {}));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/my-activities") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, activityPortfolio.getPortfolio(user));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/portfolio-capability-assessment") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, await portfolioCapabilityAgent.generateAssessment({
          user,
          payload: await readJson(request),
          env,
          deepSeekFetch,
        }));
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/my-activities") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, activityPortfolio.savePortfolio(user, await readJson(request)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/my-activities/import-sources") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, { sources: planning.listActivityImportSources(user) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/progress-planner") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, progressPlanner.getPlanner(user));
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/progress-planner") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, progressPlanner.savePlanner(user, await readJson(request)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/plans") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, { plans: planning.listPlans(user) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/plans") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 201, { plan: planning.createPlan(user, await readJson(request)) });
        return;
      }

      const snapshotMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/snapshots\/(\d+)$/);
      if (request.method === "DELETE" && snapshotMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, planning.deleteSnapshot(user, snapshotMatch[1], snapshotMatch[2]));
        return;
      }

      const restoreMatch = url.pathname.match(
        /^\/api\/plans\/(\d+)\/snapshots\/(\d+)\/restore$/,
      );
      if (request.method === "POST" && restoreMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        await readJson(request);
        sendJson(response, 200, planning.restoreSnapshot(user, restoreMatch[1], restoreMatch[2]));
        return;
      }

      const snapshotsMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/snapshots$/);
      if (request.method === "GET" && snapshotsMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, { snapshots: planning.listSnapshots(user, snapshotsMatch[1]) });
        return;
      }

      if (request.method === "POST" && snapshotsMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        sendJson(response, 201, {
          snapshot: planning.createSnapshot(user, snapshotsMatch[1], payload),
        });
        return;
      }

      const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
      if (request.method === "GET" && planMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, { plan: planning.getPlan(user, planMatch[1]) });
        return;
      }

      if (request.method === "PUT" && planMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, {
          plan: planning.savePlan(user, planMatch[1], await readJson(request)),
        });
        return;
      }

      if (request.method === "DELETE" && planMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, planning.deletePlan(user, planMatch[1]));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/analytics/usage-event") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        auth.recordUsageEvent({
          user,
          eventType: payload.eventType,
          profile: payload.profile || {},
          metrics: payload.metrics || {},
          details: payload.details || {},
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/login-dashboard") {
        const admin = requireAdmin(request, response, auth);
        if (!admin) return;
        const dashboard = auth.getLoginDashboard({
          requester: admin,
          filters: {
            query: url.searchParams.get("query") || "",
            status: url.searchParams.get("status") || "",
            fromDate: url.searchParams.get("fromDate") || "",
            toDate: url.searchParams.get("toDate") || "",
            eventType: url.searchParams.get("eventType") || "",
          },
        });
        sendJson(response, 200, dashboard);
        return;
      }

      const adminFeedbackMatch = url.pathname.match(/^\/api\/admin\/feedback\/(\d+)$/);
      if (request.method === "PUT" && adminFeedbackMatch) {
        const admin = requireAdmin(request, response, auth);
        if (!admin) return;
        const feedback = auth.updateFeedbackEntry({
          requester: admin,
          feedbackId: adminFeedbackMatch[1],
          payload: await readJson(request),
        });
        sendJson(response, 200, { feedback });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Method Not Allowed");
        return;
      }

      const requestPath =
        url.pathname === "/"
          ? "/index.html"
          : url.pathname === "/favicon.ico"
            ? "/favicon.svg"
            : decodeURIComponent(url.pathname);
      if (requestPath === "/admin.html" && !requireAdmin(request, response, auth, { redirect: true })) {
        return;
      }
      if (
        (requestPath === "/course-helper.html" ||
          requestPath === "/gpa-calculator.html" ||
          requestPath === "/my-activities.html" ||
          requestPath === "/planning-tracker.html" ||
          requestPath === "/school-selection.html" ||
          requestPath === "/ask-deepseek.html" ||
          requestPath === "/resource-library.html" ||
          requestPath === "/school-encyclopedia.html" ||
          requestPath === "/major-encyclopedia.html") &&
        !requirePageUser(request, response, auth, requestPath)
      ) {
        return;
      }
      if (requestPath.startsWith("/data/") && !requireUser(request, response, auth)) {
        return;
      }

      const filePath = normalize(join(root, requestPath));
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        response.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Not Found");
        return;
      }

      response.writeHead(200, withSecurityHeaders({
        "Content-Type": contentTypes[extname(filePath)] || "text/plain;charset=utf-8",
        ...cacheHeadersForPath(filePath),
        ...(requestPath === "/index.html" ? { Vary: "Cookie" } : {}),
      }));
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      if (requestPath === "/index.html") {
        const user = getUserForRequest(request, auth);
        response.end(renderIndexForSession(await readFile(filePath, "utf8"), user, url.searchParams.get("auth")));
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof ActivityPortfolioError ||
        error instanceof PortfolioCapabilityAgentError ||
        error instanceof DeepSeekRagError ||
        error instanceof SchoolSelectionError ||
        error instanceof PlanningError ||
        error instanceof ProgressPlannerError ||
        error instanceof RequestError
      ) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error("Unexpected server error:", error);
      sendJson(response, 500, { error: "Server error" });
    }
  });

  server.on("close", () => authDb.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAppServer().listen(port, host, () => {
    console.log(`US college consultant running at http://${host}:${port}`);
    if (envFileStatus.loaded) {
      console.log(`Loaded .env with ${envFileStatus.keys.length} setting(s).`);
    }
    const hasDeepSeekApiKey = Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
    console.log(`DeepSeek API key: ${hasDeepSeekApiKey ? "configured" : "missing"}`);
    if (!hasDeepSeekApiKey) {
      console.log("Set DEEPSEEK_API_KEY in the system environment or project .env file to enable generation.");
    }
  });
}
