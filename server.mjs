import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_DATABASE_MIGRATIONS, createAuthDatabase } from "./src/server/auth-db.mjs";
import { AuthError, createAuthService } from "./src/server/auth-service.mjs";
import { createAccountDataRightsService } from "./src/server/account-data-rights-service.mjs";
import { createAdminOperationsService } from "./src/server/admin-operations-service.mjs";
import {
  createAuthHttpService,
  getRequestMetadata,
  getUserForRequest,
  shouldUseSecureCookies,
} from "./src/server/auth-http-service.mjs";
import {
  ActivityPortfolioError,
  createActivityPortfolioService,
} from "./src/server/activity-portfolio-service.mjs";
import {
  DeepSeekPlanError,
  createDeepSeekPlanService,
} from "./src/server/deepseek-plan-service.mjs";
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
  createGenerationJobService,
  serializeGenerationJob,
} from "./src/server/generation-job-service.mjs";
import {
  buildDeniedAuditEvent,
  evaluateRouteAccess,
  getStaticRouteAccessPolicy,
  isKnownStaticRequestPath,
  normalizeStaticRequestPath,
} from "./src/server/route-access-policy.mjs";
import {
  buildStaticResponseHeaders,
  renderIndexForSession,
  resolveStaticFilePath,
} from "./src/server/static-file-service.mjs";
import {
  ProgressPlannerError,
  createProgressPlannerService,
} from "./src/server/progress-planner-service.mjs";
import { loadEnvFile } from "./src/server/env-loader.mjs";
import {
  RESPONSE_REQUEST_ID_HEADER,
  buildStructuredEvent,
  createMetricsStore,
  getLatestBackupStatus,
  getOrCreateRequestId,
  monotonicNowMs,
} from "./src/server/observability.mjs";
import { getMigrationStatus } from "./src/server/sqlite-migrations.mjs";
import {
  SchoolSelectionError,
  createSchoolSelectionService,
} from "./src/server/school-selection-service.mjs";
import { ZodError } from "zod";
import { createSqliteStudentWorkspaceRepositories } from "./src/repositories/sqlite-student-workspace-repositories.ts";
import {
  createStudentWorkspaceService,
  isStudentWorkspaceRoute,
} from "./src/server/student-workspace-service.ts";
import {
  captureSanitizedException,
  createPinoLogger,
  initializeProductionObservability,
  startSpan,
} from "./src/server/production-observability.ts";
import {
  createBullMqGenerationJobAdapter,
  createBullMqJobService,
  createRedisConnection,
} from "./src/infrastructure/bullmq-job-service.ts";
import { checkPostgresReadiness, createPostgresPool, migratePostgres } from "./src/infrastructure/postgres.ts";
import { createPostgresAuthService } from "./src/server/postgres-auth-service.ts";
import { createPostgresWorkspaceRuntime } from "./src/repositories/postgres-student-workspace-repositories.ts";
import { createEmbeddingClientFromEnv } from "./src/infrastructure/embedding-client.ts";
import { createRerankerClientFromEnv } from "./src/infrastructure/reranker-client.ts";
import { createRetrievalCacheFromEnv } from "./src/infrastructure/retrieval-cache.ts";
import { createPostgresRagRetriever } from "./src/infrastructure/postgres-rag-retriever.ts";
import { createPostgresAdmissionsKnowledgeGraphAdapter } from "./src/infrastructure/postgres-knowledge-graph.ts";
import { createStaticAdmissionsKnowledgeGraphAdapter } from "./src/server/admissions-knowledge-graph-adapter.mjs";
import { createObjectStoreFromEnv } from "./src/infrastructure/object-store.ts";
import {
  createFastifyHttpLayer,
  isFastifyMigratedRoute,
} from "./src/server/fastify-http-layer.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const worldRankingRoot = join(root, "world-ranking");
const worldRankingHostname = "rankings.us-application-consultant.com";
const envFileStatus = loadEnvFile(join(root, ".env"));
const promptPath = join(root, "prompts", "us-college-admissions-strategist-agent.md");
const defaultDatabasePath = join(root, "data", "auth.sqlite");
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "0.0.0.0";
const DEFAULT_MAX_REQUEST_BODY_BYTES = 256 * 1024;
const DEFAULT_RATE_LIMITS = {
  "/api/auth/register": { maxRequests: 5, windowMs: 60_000 },
  "/api/auth/login": { maxRequests: 10, windowMs: 60_000 },
  "/api/auth/request-password-reset": { maxRequests: 3, windowMs: 60_000 },
  "/api/auth/reset-password": { maxRequests: 5, windowMs: 60_000 },
  "/api/feedback": { maxRequests: 10, windowMs: 60_000 },
  "/api/deepseek-plan": { maxRequests: 10, windowMs: 60_000 },
  "/api/deepseek-plan-jobs": { maxRequests: 10, windowMs: 60_000 },
  "/api/deepseek-rag": { maxRequests: 20, windowMs: 60_000 },
  "/api/deepseek-rag-jobs": { maxRequests: 20, windowMs: 60_000 },
  "/api/portfolio-capability-assessment": { maxRequests: 10, windowMs: 60_000 },
  "/api/portfolio-capability-assessment-jobs": { maxRequests: 10, windowMs: 60_000 },
  "/api/school-selection": { maxRequests: 10, windowMs: 60_000 },
  "/api/school-selection-jobs": { maxRequests: 10, windowMs: 60_000 },
  "/api/export-word-jobs": { maxRequests: 20, windowMs: 60_000 },
  "/api/analytics/usage-event": { maxRequests: 120, windowMs: 60_000 },
};
const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

export { shouldUseSecureCookies };

class RequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "RequestError";
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, withSecurityHeaders({ "Content-Type": "application/json;charset=utf-8" }));
  response.end(JSON.stringify(payload));
}

function buildErrorResponse(error, requestId, statusCode) {
  const resolvedStatusCode = Number(statusCode || error?.statusCode || 500);
  const code = error instanceof ZodError
    ? "CONTRACT_VALIDATION_FAILED"
    : String(error?.name || "SERVER_ERROR").replace(/Error$/u, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  return {
    error: getPublicErrorMessage(error, resolvedStatusCode),
    code: code || "SERVER_ERROR",
    requestId: requestId || undefined,
    retryable: resolvedStatusCode === 429 || resolvedStatusCode >= 500,
    ...(error instanceof ZodError ? { details: { issues: error.issues } } : {}),
  };
}

function getPublicErrorMessage(error, statusCode) {
  const message = String(error?.message || "").trim();
  if (error instanceof ZodError) return "Invalid request.";
  if (statusCode >= 500 || !message || containsSensitiveErrorDetail(message)) {
    if (statusCode === 408 || statusCode === 504) return "Request timed out.";
    if (statusCode === 429) return "Too many requests.";
    if (statusCode === 503) return "Service temporarily unavailable.";
    return statusCode >= 500 ? "Server error." : "Request could not be processed.";
  }
  return message.slice(0, 1_000);
}

function containsSensitiveErrorDetail(message) {
  return /(?:postgres(?:ql)?|sqlite|mysql|mongodb|redis):\/\/|(?:api[_ -]?key|secret|password|token|credential|connection string|database path|private key)\s*[:=]/iu.test(message)
    || /(?:at|near)\s+[^\s]+(?:\.m?js|\.ts):\d+/iu.test(message);
}

function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

function getHeaderValue(headers, name) {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function getRequestHostname(request) {
  const forwardedHost = getHeaderValue(request.headers, "x-forwarded-host");
  const hostHeader = forwardedHost || getHeaderValue(request.headers, "host");
  return hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();
}

function isWorldRankingHost(request) {
  return getRequestHostname(request) === worldRankingHostname;
}

function attachRequestObservability(request, response, { logger, metrics, httpLayer = "native" }) {
  const requestId = getOrCreateRequestId(request);
  request.requestId = requestId;
  response.setHeader(RESPONSE_REQUEST_ID_HEADER, requestId);
  const startedAt = monotonicNowMs();
  const path = safeRequestPath(request);
  const span = startSpan("http.server.request", {
    "http.request.method": request.method || "UNKNOWN",
    "url.path": path,
    "consultant.http.layer": httpLayer,
  });

  response.on("finish", () => {
    const durationMs = Math.round(monotonicNowMs() - startedAt);
    const level = response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info";
    metrics.recordHttpRequest({
      method: request.method,
      route: path,
      statusCode: response.statusCode,
      durationMs,
    });
    logger?.[level]?.(buildStructuredEvent({
      level,
      event: "http_request",
      requestId,
      details: {
        method: request.method,
        path,
        statusCode: response.statusCode,
        durationMs,
        httpLayer,
      },
    }));
    span.setAttribute("http.response.status_code", response.statusCode);
    span.end();
  });

  return { requestId, path };
}

function logRequestError(logger, request, error, statusCode, path = safeRequestPath(request)) {
  logger?.error?.(buildStructuredEvent({
    level: "error",
    event: "server_error",
    requestId: request.requestId || "",
    details: {
      method: request.method,
      path,
      statusCode,
      errorName: error?.name || "Error",
      errorCategory: classifyErrorForLogging(error, statusCode),
    },
  }));
}

function classifyErrorForLogging(error, statusCode) {
  if (error instanceof ZodError) return "contract_validation";
  if (statusCode === 401) return "authentication";
  if (statusCode === 403) return "authorization";
  if (statusCode === 404) return "not_found";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "internal_server_error";
  return error?.name ? String(error.name).replace(/Error$/u, "").toLowerCase() : "request_error";
}

function safeRequestPath(request) {
  try {
    return new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function buildHealthPayload(requestId) {
  return {
    status: "ok",
    requestId,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

function buildReadinessPayload({ authDb }) {
  try {
    const probe = authDb.db.prepare("SELECT 1 AS ok").get();
    const migrations = getMigrationStatus(authDb.db, AUTH_DATABASE_MIGRATIONS);
    const ready = probe?.ok === 1 && migrations.pending.length === 0 && migrations.unknown.length === 0;
    return {
      status: ready ? "ready" : "not_ready",
      database: {
        ok: probe?.ok === 1,
        migrations: {
          appliedCount: migrations.applied.length,
          pending: migrations.pending,
          unknown: migrations.unknown,
        },
      },
    };
  } catch {
    return {
      status: "not_ready",
      database: {
        ok: false,
      },
    };
  }
}

function sanitizeReadinessPayload(readiness = {}) {
  const database = readiness?.database && typeof readiness.database === "object" ? readiness.database : {};
  const migrations = database.migrations && typeof database.migrations === "object" ? database.migrations : null;
  return {
    status: readiness?.status === "ready" ? "ready" : "not_ready",
    database: {
      ok: Boolean(database.ok),
      ...(migrations ? {
        migrations: {
          appliedCount: Number.isInteger(migrations.appliedCount) ? Math.max(0, Number(migrations.appliedCount)) : 0,
          pending: Array.isArray(migrations.pending) ? migrations.pending.map((item) => String(item).slice(0, 120)) : [],
          unknown: Array.isArray(migrations.unknown) ? migrations.unknown.map((item) => String(item).slice(0, 120)) : [],
        },
      } : {}),
    },
  };
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

async function requireAccess(request, response, auth, {
  role = "user",
  redirectLocation = "",
  audit = null,
} = {}) {
  const user = await getUserForRequest(request, auth);
  const decision = evaluateRouteAccess(user, { role, redirectLocation });
  if (decision.allowed) return decision.user;

  await recordDeniedAudit(auth, user, audit, request);

  if (decision.redirectLocation) {
    response.writeHead(302, withSecurityHeaders({ Location: decision.redirectLocation }));
    response.end();
    return null;
  }
  const payload = typeof decision.payload?.error === "string"
    ? { ...decision.payload, ...buildErrorResponse(new AuthError(decision.payload.error, decision.statusCode), request.requestId, decision.statusCode) }
    : decision.payload;
  sendJson(response, decision.statusCode, payload);
  return null;
}

async function requireUser(request, response, auth) {
  return requireAccess(request, response, auth, { role: "user" });
}

async function requireAdmin(request, response, auth, { redirect = false, audit = null } = {}) {
  return requireAccess(request, response, auth, {
    role: "admin",
    redirectLocation: redirect ? "/" : "",
    audit,
  });
}

async function recordDeniedAudit(auth, user, audit, request) {
  if (!audit || typeof auth.recordAuditEvent !== "function") return;
  try {
    await auth.recordAuditEvent(buildDeniedAuditEvent({
      user,
      audit,
      metadata: getRequestMetadata(request),
    }));
  } catch (error) {
    console.error("Failed to record denied access audit event:", error);
  }
}

function createRateLimiter(rateLimits) {
  const entries = new Map();
  let nextCleanupAt = 0;

  return function getRateLimit(request, pathname) {
    const limit = rateLimits[pathname];
    if (!limit) return null;

    const now = Date.now();
    if (now >= nextCleanupAt) {
      for (const [entryKey, timestamps] of entries) {
        const entryPathname = entryKey.slice(0, entryKey.indexOf(":"));
        const entryLimit = rateLimits[entryPathname];
        if (!entryLimit || timestamps.every((timestamp) => timestamp <= now - entryLimit.windowMs)) {
          entries.delete(entryKey);
        }
      }
      nextCleanupAt = now + 10_000;
    }
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

function requestJobOptions(request, payload = {}) {
  const headerValue = request.headers?.["idempotency-key"];
  const idempotencyKey = String(Array.isArray(headerValue) ? headerValue[0] : headerValue || payload.idempotencyKey || "").trim();
  const timeoutMs = Number(payload.timeoutMs);
  return {
    ...(idempotencyKey ? { idempotencyKey: idempotencyKey.slice(0, 200) } : {}),
    ...(Number.isInteger(timeoutMs) ? { timeoutMs } : {}),
  };
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

export function resolveDatabasePath(env = process.env) {
  return env.AUTH_DATABASE_PATH || env.DATABASE_PATH || defaultDatabasePath;
}

export function resolveAppBaseUrl(env = process.env) {
  return String(env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || "").trim();
}

export function createAppServer({
  env = process.env,
  databasePath = resolveDatabasePath(env),
  authDb = createAuthDatabase({ databasePath }),
  auth = createAuthService({ authDb }),
  planning = createPlanningService({ authDb }),
  progressPlanner = createProgressPlannerService({ authDb }),
  activityPortfolio = createActivityPortfolioService({ authDb }),
  accountDataRights = createAccountDataRightsService({
    auth,
    planning,
    activityPortfolio,
    progressPlanner,
  }),
  metrics = createMetricsStore(),
  adminOperations = createAdminOperationsService({
    auth,
    metrics,
    getBackupStatus: () => getLatestBackupStatus({ root, env }),
  }),
  logger = null,
  deepSeekPlanLlmClient = null,
  deepSeekPlan = createDeepSeekPlanService({
    promptPath,
    metrics,
    ...(deepSeekPlanLlmClient ? { llmClient: deepSeekPlanLlmClient } : {}),
  }),
  deepSeekPortfolioCapabilityLlmClient = null,
  portfolioCapabilityAgent = createPortfolioCapabilityAgentService({
    activityPortfolio,
    metrics,
    ...(deepSeekPortfolioCapabilityLlmClient ? { llmClient: deepSeekPortfolioCapabilityLlmClient } : {}),
  }),
  deepSeekRagLlmClient = null,
  deepSeekRagRetriever = null,
  deepSeekRagKnowledgeGraph = null,
  deepSeekRag = createDeepSeekRagService({
    root,
    planning,
    activityPortfolio,
    metrics,
    ...(deepSeekRagRetriever ? { retriever: deepSeekRagRetriever } : {}),
    ...(deepSeekRagKnowledgeGraph ? { knowledgeGraph: deepSeekRagKnowledgeGraph } : {}),
    ...(deepSeekRagLlmClient ? { llmClient: deepSeekRagLlmClient } : {}),
    logger,
  }),
  deepSeekSchoolSelectionLlmClient = null,
  schoolSelection = createSchoolSelectionService({
    activityPortfolio,
    root,
    metrics,
    ...(deepSeekRagKnowledgeGraph ? { knowledgeGraph: deepSeekRagKnowledgeGraph } : {}),
    ...(deepSeekSchoolSelectionLlmClient ? { llmClient: deepSeekSchoolSelectionLlmClient } : {}),
  }),
  mailer = createMailerFromEnv(env),
  appBaseUrl = resolveAppBaseUrl(env),
  authHttp = null,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  rateLimits = DEFAULT_RATE_LIMITS,
  studentWorkspace = null,
  jobServices = null,
  infrastructureClose = null,
  readinessCheck = () => buildReadinessPayload({ authDb }),
  localObjectStore = createObjectStoreFromEnv(env, { root }),
} = {}) {
  const readText = (request) => readRequestText(request, maxRequestBodyBytes);
  const readJson = (request) => readRequestJson(request, maxRequestBodyBytes);
  const authHttpService = authHttp || createAuthHttpService({
    auth,
    mailer,
    appBaseUrl,
    readJson,
    readText,
    sendJson,
    withSecurityHeaders,
    env,
  });
  const handleAuth = authHttpService.handleAuth;
  const getRateLimit = createRateLimiter(rateLimits);
  const generationJobOptions = {
    errorClasses: [
      RequestError,
      DeepSeekPlanError,
      ActivityPortfolioError,
      PortfolioCapabilityAgentError,
      DeepSeekRagError,
      SchoolSelectionError,
    ],
  };
  const deepSeekPlanJobs = jobServices?.deepSeekPlan || createGenerationJobService(generationJobOptions);
  const deepSeekRagJobs = jobServices?.deepSeekRag || createGenerationJobService(generationJobOptions);
  const portfolioCapabilityAssessmentJobs = jobServices?.capabilityAssessment || createGenerationJobService(generationJobOptions);
  const schoolSelectionJobs = jobServices?.schoolSelection || createGenerationJobService(generationJobOptions);
  const wordExportJobs = jobServices?.wordExport || createGenerationJobService(generationJobOptions);
  const workspace = studentWorkspace || createStudentWorkspaceService({
    repositories: createSqliteStudentWorkspaceRepositories({
      planning,
      activityPortfolio,
      progressPlanner,
      auth,
    }),
  });
  const fastifyHttpLayer = createFastifyHttpLayer({
    auth,
    env,
    readinessCheck,
    readPrompt: () => readFile(promptPath, "utf8"),
    onStreamError: ({ error, requestId, assistantProfile }) => {
      logger?.error?.(buildStructuredEvent({
        level: "error",
        event: "deepseek_rag_stream_error",
        requestId,
        details: {
          assistantProfile,
          errorName: error?.name || "Error",
          errorCategory: getStreamErrorCategory(error),
          statusCode: error?.statusCode || error?.status || 0,
        },
      }));
    },
    answerRag: ({ user, question, historySummary, assistantProfile, usePersonalContext, signal, onToken }) => deepSeekRag.answerQuestion({
      user,
      question,
      historySummary,
      assistantProfile,
      usePersonalContext: assistantProfile === "major-match" || usePersonalContext === true,
      env,
      signal,
      onToken,
    }),
  });

  const server = createServer(async (request, response) => {
    request.trustProxy = env.TRUST_PROXY === "true";
    const requestPath = safeRequestPath(request);
    const useFastifyHttpLayer = Boolean(
      fastifyHttpLayer
      && isFastifyMigratedRoute(request.method, requestPath)
      && (
        requestPath === "/api/deepseek-rag/stream"
        || (env.FASTIFY_HTTP_ENABLED === "true" && isFastifyTrafficSelected(request, env))
      ),
    );
    const observedRequest = attachRequestObservability(request, response, {
      logger,
      metrics,
      httpLayer: useFastifyHttpLayer ? "fastify" : "native",
    });

    if (useFastifyHttpLayer) {
      try {
        const app = await fastifyHttpLayer;
        app.routing(request, response);
      } catch (error) {
        logRequestError(logger, request, error, 500, observedRequest.path);
        captureSanitizedException(error, {
          requestId: observedRequest.requestId,
          method: request.method,
          path: observedRequest.path,
          statusCode: 500,
        });
        sendJson(response, 500, buildErrorResponse(new Error("Server error"), observedRequest.requestId, 500));
      }
      return;
    }

    try {
      const url = new URL(request.url || "/", `http://${host}:${port}`);

      if (isWritePaused(env) && isUnsafeWriteRequest(request, url.pathname)) {
        sendJson(response, 503, { error: "Maintenance window: writes are temporarily paused.", code: "WRITES_PAUSED", retryable: true });
        return;
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/healthz") {
        sendJson(response, 200, buildHealthPayload(observedRequest.requestId));
        return;
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/readyz") {
        const readiness = sanitizeReadinessPayload(await readinessCheck());
        sendJson(response, readiness.status === "ready" ? 200 : 503, readiness);
        return;
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/objects/download") {
        if (typeof localObjectStore?.readSignedUrl !== "function") {
          sendJson(response, 404, { error: "Local object downloads are not enabled." });
          return;
        }
        try {
          const object = await localObjectStore.readSignedUrl(request.url || url.pathname);
          const fileName = String(object.objectKey || "download").split("/").at(-1) || "download";
          response.writeHead(200, withSecurityHeaders({
            "Cache-Control": "private, no-store",
            "Content-Type": object.contentType || "application/octet-stream",
            "Content-Length": String(object.body.length),
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          }));
          if (request.method === "HEAD") response.end();
          else response.end(object.body);
        } catch (error) {
          const statusCode = /not found/iu.test(error?.message || "") ? 404 : 403;
          sendJson(response, statusCode, { error: statusCode === 404 ? "Object not found." : "Invalid or expired download link." });
        }
        return;
      }

      if (isWorldRankingHost(request)) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
          response.end("Method Not Allowed");
          return;
        }

        const requestPath = normalizeStaticRequestPath(url.pathname);
        if (!requestPath) {
          response.writeHead(400, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
          response.end("Invalid path");
          return;
        }
        const filePath = resolveStaticFilePath({ root: worldRankingRoot, requestPath });
        if (!filePath) {
          response.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
          response.end("Not Found");
          return;
        }

        response.writeHead(200, withSecurityHeaders(buildStaticResponseHeaders({ filePath, requestPath })));
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        createReadStream(filePath).pipe(response);
        return;
      }

      if (request.method === "POST") {
        const retryAfterSeconds = getRateLimit(request, url.pathname);
        if (retryAfterSeconds) {
          response.setHeader("Retry-After", String(retryAfterSeconds));
          sendJson(response, 429, { error: "Too many requests. Please try again later." });
          return;
        }
      }

      if (!await authHttpService.verifyCsrfRequest(request, response, url.pathname)) return;

      if (await handleAuth(request, response, url.pathname)) return;

      if (request.method === "GET" && url.pathname === "/api/account/export") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const exportData = await accountDataRights.exportAccountData({
          user,
          metadata: getRequestMetadata(request),
        });
        response.writeHead(200, withSecurityHeaders({
          "Content-Type": "application/json;charset=utf-8",
          "Content-Disposition": `attachment; filename="consultant-account-export-${new Date().toISOString().slice(0, 10)}.json"`,
        }));
        response.end(JSON.stringify(exportData, null, 2));
        return;
      }

      if (request.method === "DELETE" && url.pathname === "/api/account") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const result = await accountDataRights.deleteAccount({
          user,
          payload: await readJson(request),
          metadata: getRequestMetadata(request),
        });
        response.writeHead(200, withSecurityHeaders({
          "Content-Type": "application/json;charset=utf-8",
          "Set-Cookie": authHttpService.buildClearSessionCookies(request),
          "Clear-Site-Data": '"cookies"',
        }));
        response.end(JSON.stringify(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/feedback") {
        const feedback = await auth.recordFeedback({
          user: await getUserForRequest(request, auth),
          payload: await readJson(request),
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 201, { ok: true, feedback });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/prompt") {
        if (!await requireUser(request, response, auth)) return;
        const prompt = await readFile(promptPath, "utf8");
        sendJson(response, 200, { prompt, hasDeepSeekApiKey: Boolean(env.DEEPSEEK_API_KEY) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-plan") {
        if (!await requireUser(request, response, auth)) return;
        const payload = await readJson(request);
        sendJson(response, 200, await deepSeekPlan.generatePlan({
          payload,
          env,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-plan-jobs") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const createdJob = deepSeekPlanJobs.create(user, ({ signal } = {}) =>
          deepSeekPlan.generatePlan({
            payload,
            env,
            signal,
          }),
          { type: "ai.deepseek-plan", payload: { payload }, options: requestJobOptions(request, payload) },
        );
        const job = isPromiseLike(createdJob) ? await createdJob : createdJob;
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const deepSeekPlanJobMatch = url.pathname.match(/^\/api\/deepseek-plan-jobs\/([a-f0-9-]{36})$/);
      if ((request.method === "GET" || request.method === "DELETE") && deepSeekPlanJobMatch) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        if (request.method === "DELETE") {
          const cancelled = await deepSeekPlanJobs.cancel?.(user, deepSeekPlanJobMatch[1]);
          if (!cancelled) sendJson(response, 404, { error: "DeepSeek plan job not found." });
          else sendJson(response, 200, serializeGenerationJob(cancelled));
          return;
        }
        const job = await deepSeekPlanJobs.get(user, deepSeekPlanJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "DeepSeek plan job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-rag") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const usePersonalContext = payload.assistantProfile === "major-match"
          || payload.usePersonalContext === true;
        sendJson(response, 200, await deepSeekRag.answerQuestion({
          user,
          question: payload.question,
          historySummary: payload.historySummary,
          assistantProfile: payload.assistantProfile,
          usePersonalContext,
          env,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/school-selection") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, await schoolSelection.generateSelection({
          user,
          payload: await readJson(request),
          env,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/school-selection-jobs") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const createdJob = schoolSelectionJobs.create(user, ({ signal } = {}) =>
          schoolSelection.generateSelection({
            user,
            payload,
            env,
            signal,
          }),
          { type: "ai.school-selection", payload: { user, payload, portfolio: await activityPortfolio.getPortfolio(user) }, options: requestJobOptions(request, payload) },
        );
        const job = isPromiseLike(createdJob) ? await createdJob : createdJob;
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const schoolSelectionJobMatch = url.pathname.match(/^\/api\/school-selection-jobs\/([a-f0-9-]{36})$/);
      if ((request.method === "GET" || request.method === "DELETE") && schoolSelectionJobMatch) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        if (request.method === "DELETE") {
          const cancelled = await schoolSelectionJobs.cancel?.(user, schoolSelectionJobMatch[1]);
          if (!cancelled) sendJson(response, 404, { error: "School selection job not found." });
          else sendJson(response, 200, serializeGenerationJob(cancelled, { fallbackError: "School selection generation failed." }));
          return;
        }
        const job = await schoolSelectionJobs.get(user, schoolSelectionJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "School selection job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job, {
          fallbackError: "School selection generation failed.",
        }));
        return;
      }

      if (isStudentWorkspaceRoute(url.pathname)) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const result = await workspace.handle({
          method: request.method,
          path: url.pathname,
          user,
          readJson: () => readJson(request),
          metadata: getRequestMetadata(request),
        });
        if (result) {
          sendJson(response, result.statusCode, result.body);
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/api/portfolio-capability-assessment") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        sendJson(response, 200, await portfolioCapabilityAgent.generateAssessment({
          user,
          payload: await readJson(request),
          env,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/portfolio-capability-assessment-jobs") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const createdJob = portfolioCapabilityAssessmentJobs.create(user, ({ signal } = {}) =>
          portfolioCapabilityAgent.generateAssessment({
            user,
            payload,
            env,
            signal,
          }),
          { type: "ai.capability-assessment", payload: { user, payload, portfolio: await activityPortfolio.getPortfolio(user) }, options: requestJobOptions(request, payload) },
        );
        const job = isPromiseLike(createdJob) ? await createdJob : createdJob;
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const capabilityAssessmentJobMatch = url.pathname.match(
        /^\/api\/portfolio-capability-assessment-jobs\/([a-f0-9-]{36})$/,
      );
      if ((request.method === "GET" || request.method === "DELETE") && capabilityAssessmentJobMatch) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        if (request.method === "DELETE") {
          const cancelled = await portfolioCapabilityAssessmentJobs.cancel?.(user, capabilityAssessmentJobMatch[1]);
          if (!cancelled) sendJson(response, 404, { error: "Portfolio capability assessment job not found." });
          else sendJson(response, 200, serializeGenerationJob(cancelled));
          return;
        }
        const job = await portfolioCapabilityAssessmentJobs.get(user, capabilityAssessmentJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "Portfolio capability assessment job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-rag-jobs") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const usePersonalContext = payload.assistantProfile === "major-match"
          || payload.usePersonalContext === true;
        const jobPayload = {
          user,
          question: payload.question,
          historySummary: payload.historySummary,
          assistantProfile: payload.assistantProfile,
          usePersonalContext,
        };
        if (jobPayload.usePersonalContext) {
          const [profile, portfolio, currentPlan] = await Promise.all([
            planning.getProfile(user),
            activityPortfolio.getPortfolio(user),
            planning.getLatestRagPlan(user),
          ]);
          Object.assign(jobPayload, { profile, portfolio, currentPlan });
        }
        const createdJob = deepSeekRagJobs.create(user, ({ signal } = {}) =>
          deepSeekRag.answerQuestion({
            user,
            question: payload.question,
            historySummary: payload.historySummary,
            assistantProfile: payload.assistantProfile,
            usePersonalContext,
            env,
            signal,
          }),
          {
            type: "ai.deepseek-rag",
            payload: jobPayload,
            options: requestJobOptions(request, payload),
          },
        );
        const job = isPromiseLike(createdJob) ? await createdJob : createdJob;
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const deepSeekRagJobMatch = url.pathname.match(/^\/api\/deepseek-rag-jobs\/([a-f0-9-]{36})$/);
      if ((request.method === "GET" || request.method === "DELETE") && deepSeekRagJobMatch) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        if (request.method === "DELETE") {
          const cancelled = await deepSeekRagJobs.cancel?.(user, deepSeekRagJobMatch[1]);
          if (!cancelled) sendJson(response, 404, { error: "DeepSeek RAG job not found." });
          else sendJson(response, 200, serializeGenerationJob(cancelled));
          return;
        }
        const job = await deepSeekRagJobs.get(user, deepSeekRagJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "DeepSeek RAG job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/login-dashboard") {
        const admin = await requireAdmin(request, response, auth, {
          audit: { action: "admin.dashboard.view", resourceType: "admin_dashboard" },
        });
        if (!admin) return;
        const dashboard = await adminOperations.getLoginDashboard({
          admin,
          searchParams: url.searchParams,
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, dashboard);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/ops/metrics") {
        const admin = await requireAdmin(request, response, auth, {
          audit: { action: "admin.ops.metrics.view", resourceType: "admin_ops_metrics" },
        });
        if (!admin) return;
        sendJson(response, 200, await adminOperations.getOpsMetrics());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/audit-log/export") {
        const admin = await requireAdmin(request, response, auth, {
          audit: { action: "admin.audit_log.export", resourceType: "audit_log" },
        });
        if (!admin) return;
        const auditExport = await adminOperations.exportAuditLog({
          admin,
          searchParams: url.searchParams,
          metadata: getRequestMetadata(request),
        });
        response.writeHead(200, withSecurityHeaders({
          "Content-Type": "application/json;charset=utf-8",
          "Content-Disposition": `attachment; filename="consultant-audit-log-${new Date().toISOString().slice(0, 10)}.json"`,
        }));
        response.end(JSON.stringify(auditExport, null, 2));
        return;
      }

      const adminFeedbackMatch = url.pathname.match(/^\/api\/admin\/feedback\/(\d+)$/);
      if (request.method === "PUT" && adminFeedbackMatch) {
        const admin = await requireAdmin(request, response, auth, {
          audit: {
            action: "admin.feedback.update",
            resourceType: "feedback_entry",
            resourceId: adminFeedbackMatch[1],
          },
        });
        if (!admin) return;
        const payload = await readJson(request);
        const feedback = await adminOperations.updateFeedbackEntry({
          admin,
          feedbackId: adminFeedbackMatch[1],
          payload,
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, { feedback });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/export-word-jobs") {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const createdJob = wordExportJobs.create(
          user,
          async () => ({ content: payload.document || payload, contentType: "application/msword" }),
          { type: "export.word", payload: { ...payload, userId: user.id }, options: requestJobOptions(request, payload) },
        );
        const job = isPromiseLike(createdJob) ? await createdJob : createdJob;
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const wordExportJobMatch = url.pathname.match(/^\/api\/export-word-jobs\/([a-f0-9-]{36})$/);
      if ((request.method === "GET" || request.method === "DELETE") && wordExportJobMatch) {
        const user = await requireUser(request, response, auth);
        if (!user) return;
        if (request.method === "DELETE") {
          const cancelled = await wordExportJobs.cancel?.(user, wordExportJobMatch[1]);
          if (!cancelled) sendJson(response, 404, { error: "Word export job not found." });
          else sendJson(response, 200, serializeGenerationJob(cancelled, { fallbackError: "Word export failed." }));
          return;
        }
        const job = await wordExportJobs.get(user, wordExportJobMatch[1]);
        if (!job) sendJson(response, 404, { error: "Word export job not found." });
        else sendJson(response, 200, serializeGenerationJob(job, { fallbackError: "Word export failed." }));
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Method Not Allowed");
        return;
      }

      const requestPath = normalizeStaticRequestPath(url.pathname);
      if (!requestPath) {
        response.writeHead(400, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Invalid path");
        return;
      }
      const staticAccessPolicy = getStaticRouteAccessPolicy(requestPath);
      if (staticAccessPolicy && !await requireAccess(request, response, auth, staticAccessPolicy)) {
        return;
      }

      if (!isKnownStaticRequestPath(requestPath)) {
        response.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Not Found");
        return;
      }

      const filePath = resolveStaticFilePath({ root, requestPath });
      if (!filePath) {
        response.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Not Found");
        return;
      }

      response.writeHead(200, withSecurityHeaders(buildStaticResponseHeaders({ filePath, requestPath })));
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      if (requestPath === "/index.html") {
        const user = await getUserForRequest(request, auth);
        response.end(renderIndexForSession(await readFile(filePath, "utf8"), user, url.searchParams.get("auth")));
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof ActivityPortfolioError ||
        error instanceof DeepSeekPlanError ||
        error instanceof PortfolioCapabilityAgentError ||
        error instanceof DeepSeekRagError ||
        error instanceof SchoolSelectionError ||
        error instanceof PlanningError ||
        error instanceof ProgressPlannerError ||
        error instanceof RequestError ||
        error instanceof ZodError
      ) {
        const statusCode = error instanceof ZodError ? 400 : error.statusCode || 500;
        logRequestError(logger, request, error, statusCode, observedRequest.path);
        sendJson(response, statusCode, buildErrorResponse(error, observedRequest.requestId, statusCode));
        return;
      }

      logRequestError(logger, request, error, 500, observedRequest.path);
      captureSanitizedException(error, {
        requestId: observedRequest.requestId,
        method: request.method,
        path: observedRequest.path,
        statusCode: 500,
      });
      sendJson(response, 500, buildErrorResponse(new Error("Server error"), observedRequest.requestId, 500));
    }
  });

  server.on("close", () => {
    void authDb.close();
    void infrastructureClose?.();
  });
  return server;
}

function getStreamErrorCategory(error) {
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.status || 0);
  const message = String(error?.message || "");
  if ([401, 403].includes(statusCode) || /unauthorized|forbidden|invalid.*key|authentication/i.test(message)) {
    return "authorization";
  }
  if (statusCode === 404 || /not found|model.*(not|invalid)/i.test(message)) {
    return "model_or_endpoint";
  }
  if (statusCode === 429 || /rate.?limit|too many requests/i.test(message)) {
    return "rate_limited";
  }
  if (statusCode === 408 || statusCode === 504 || /timeout|timed out/i.test(message)) {
    return "timeout";
  }
  if (statusCode >= 500 || /network|socket|connection|temporarily/i.test(message)) {
    return "upstream_unavailable";
  }
  if (/API_KEY|api key|未配置|配置未完成/i.test(message)) {
    return "configuration";
  }
  return "unknown";
}

function isWritePaused(env) {
  if (env.WRITE_PAUSED === "true") return true;
  return existsSync(env.WRITE_PAUSE_FILE || join(root, "work", "maintenance", "write-paused.lock"));
}

function isFastifyTrafficSelected(request, env) {
  const percentage = Math.max(0, Math.min(100, Number(env.FASTIFY_HTTP_TRAFFIC_PERCENT || 100)));
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;

  const rolloutKey = String(
    request.headers?.["x-request-id"]
      || request.headers?.cookie
      || request.socket?.remoteAddress
      || "anonymous",
  );
  let hash = 0;
  for (const character of rolloutKey) hash = ((hash * 31) + character.codePointAt(0)) >>> 0;
  return hash % 100 < percentage;
}

function isUnsafeWriteRequest(request, pathname) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !pathname.startsWith("/healthz") && !pathname.startsWith("/readyz");
}

async function createRuntimeJobInfrastructure(env) {
  const redisUrl = String(env.REDIS_URL || "").trim();
  if (!redisUrl) return null;
  const connection = createRedisConnection(redisUrl);
  const service = createBullMqJobService({
    queueName: env.JOB_QUEUE_NAME || "consultant-jobs",
    connection,
  });
  return {
    jobServices: {
      deepSeekPlan: createBullMqGenerationJobAdapter({ service, type: "ai.deepseek-plan" }),
      deepSeekRag: createBullMqGenerationJobAdapter({ service, type: "ai.deepseek-rag" }),
      capabilityAssessment: createBullMqGenerationJobAdapter({ service, type: "ai.capability-assessment" }),
      schoolSelection: createBullMqGenerationJobAdapter({ service, type: "ai.school-selection" }),
      wordExport: createBullMqGenerationJobAdapter({ service, type: "export.word" }),
    },
    mailer: {
      async sendPasswordResetEmail(payload) {
        const userId = Number(payload.userId);
        const messageId = `password-reset-${userId}-${String(payload.expiresAt || "").replace(/[^0-9]/gu, "")}`;
        await service.create({ id: userId }, "email.password-reset", { ...payload, messageId }, {
          idempotencyKey: `password-reset:${userId}:${payload.expiresAt || payload.resetUrl}`,
          attempts: 5,
        });
      },
    },
    async close() {
      await service.close();
      await connection.quit();
    },
  };
}

async function createRuntimeDatabaseInfrastructure(env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!databaseUrl) return null;
  const pool = createPostgresPool(env);
  try {
    await migratePostgres(pool);
    const workspaceRuntime = createPostgresWorkspaceRuntime({ pool });
    const auth = createPostgresAuthService({ pool });
    const embeddingClient = env.EMBEDDING_API_KEY ? createEmbeddingClientFromEnv(env) : null;
    const rerankerClient = createRerankerClientFromEnv(env);
    const retrievalCache = createRetrievalCacheFromEnv(env);
    const deepSeekRagRetriever = createPostgresRagRetriever({
      pool,
      root,
      planning: workspaceRuntime.planning,
      activityPortfolio: workspaceRuntime.activityPortfolio,
      embeddingClient,
      rerankerClient,
      retrievalCache,
      knowledgeVersion: env.KNOWLEDGE_SOURCE_VERSION,
    });
    const deepSeekRagKnowledgeGraph = createPostgresAdmissionsKnowledgeGraphAdapter({
      pool,
      fallback: createStaticAdmissionsKnowledgeGraphAdapter({
        root,
        planning: workspaceRuntime.planning,
        activityPortfolio: workspaceRuntime.activityPortfolio,
      }),
    });
    return {
      authDb: { db: null, close: () => Promise.all([pool.end(), retrievalCache?.close()]) },
      auth,
      planning: workspaceRuntime.planning,
      activityPortfolio: workspaceRuntime.activityPortfolio,
      progressPlanner: workspaceRuntime.progressPlanner,
      studentWorkspace: createStudentWorkspaceService({ repositories: workspaceRuntime.repositories }),
      deepSeekRagRetriever,
      deepSeekRagKnowledgeGraph,
      readinessCheck: async () => {
        try {
          const database = await checkPostgresReadiness(pool);
          return { status: database.vectorEnabled ? "ready" : "not_ready", database };
        } catch {
          return { status: "not_ready", database: { ok: false } };
        }
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initializeProductionObservability(process.env);
  const startupLogger = createPinoLogger(process.env);
  const databaseInfrastructure = await createRuntimeDatabaseInfrastructure(process.env);
  const jobInfrastructure = await createRuntimeJobInfrastructure(process.env);
  createAppServer({
    logger: startupLogger,
    ...(databaseInfrastructure || {}),
    ...(jobInfrastructure ? { jobServices: jobInfrastructure.jobServices, mailer: jobInfrastructure.mailer, infrastructureClose: () => jobInfrastructure.close() } : {}),
  }).listen(port, host, () => {
    const hasDeepSeekApiKey = Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
    startupLogger.info({
      event: "server_started",
      host,
      port,
      envFileLoaded: envFileStatus.loaded,
      envSettingCount: envFileStatus.loaded ? envFileStatus.keys.length : 0,
      deepSeekConfigured: hasDeepSeekApiKey,
    });
  });
}
