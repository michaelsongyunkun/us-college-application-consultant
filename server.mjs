import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
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
  createConsoleStructuredLogger,
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

function attachRequestObservability(request, response, { logger, metrics }) {
  const requestId = getOrCreateRequestId(request);
  request.requestId = requestId;
  response.setHeader(RESPONSE_REQUEST_ID_HEADER, requestId);
  const startedAt = monotonicNowMs();
  const path = safeRequestPath(request);

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
      },
    }));
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
      errorMessage: error?.message || "Unknown server error",
    },
  }));
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
  } catch (error) {
    return {
      status: "not_ready",
      database: {
        ok: false,
        error: error?.message || "Database readiness check failed.",
      },
    };
  }
}

function instrumentDeepSeekFetch(deepSeekFetch, metrics, feature) {
  return async function observedDeepSeekFetch(url, options) {
    const startedAt = monotonicNowMs();
    try {
      const apiResponse = await deepSeekFetch(url, options);
      metrics.recordAiCall({
        feature,
        ok: Boolean(apiResponse?.ok),
        statusCode: apiResponse?.status || 0,
        durationMs: monotonicNowMs() - startedAt,
      });
      return apiResponse;
    } catch (error) {
      metrics.recordAiCall({
        feature,
        ok: false,
        statusCode: 0,
        durationMs: monotonicNowMs() - startedAt,
      });
      throw error;
    }
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

function requireAccess(request, response, auth, {
  role = "user",
  redirectLocation = "",
  audit = null,
} = {}) {
  const user = getUserForRequest(request, auth);
  const decision = evaluateRouteAccess(user, { role, redirectLocation });
  if (decision.allowed) return decision.user;

  recordDeniedAudit(auth, user, audit, request);

  if (decision.redirectLocation) {
    response.writeHead(302, withSecurityHeaders({ Location: decision.redirectLocation }));
    response.end();
    return null;
  }
  sendJson(response, decision.statusCode, decision.payload);
  return null;
}

function requireUser(request, response, auth) {
  return requireAccess(request, response, auth, { role: "user" });
}

function requireAdmin(request, response, auth, { redirect = false, audit = null } = {}) {
  return requireAccess(request, response, auth, {
    role: "admin",
    redirectLocation: redirect ? "/" : "",
    audit,
  });
}

function recordDeniedAudit(auth, user, audit, request) {
  if (!audit || typeof auth.recordAuditEvent !== "function") return;
  try {
    auth.recordAuditEvent(buildDeniedAuditEvent({
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
  deepSeekPlan = createDeepSeekPlanService({ promptPath }),
  portfolioCapabilityAgent = createPortfolioCapabilityAgentService({ activityPortfolio }),
  deepSeekRag = createDeepSeekRagService({ root, planning, activityPortfolio, metrics }),
  schoolSelection = createSchoolSelectionService({ activityPortfolio, root }),
  mailer = createMailerFromEnv(env),
  appBaseUrl = env.APP_BASE_URL || "",
  authHttp = null,
  deepSeekFetch = fetch,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  rateLimits = DEFAULT_RATE_LIMITS,
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
  const deepSeekPlanJobs = createGenerationJobService(generationJobOptions);
  const deepSeekRagJobs = createGenerationJobService(generationJobOptions);
  const portfolioCapabilityAssessmentJobs = createGenerationJobService(generationJobOptions);
  const schoolSelectionJobs = createGenerationJobService(generationJobOptions);

  const server = createServer(async (request, response) => {
    const observedRequest = attachRequestObservability(request, response, { logger, metrics });
    try {
      const url = new URL(request.url || "/", `http://${host}:${port}`);

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/healthz") {
        sendJson(response, 200, buildHealthPayload(observedRequest.requestId));
        return;
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/readyz") {
        const readiness = buildReadinessPayload({ authDb });
        sendJson(response, readiness.status === "ready" ? 200 : 503, readiness);
        return;
      }

      if (isWorldRankingHost(request)) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
          response.end("Method Not Allowed");
          return;
        }

        const requestPath = normalizeStaticRequestPath(url.pathname);
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

      if (!authHttpService.verifyCsrfRequest(request, response, url.pathname)) return;

      if (await handleAuth(request, response, url.pathname)) return;

      if (request.method === "GET" && url.pathname === "/api/account/export") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const exportData = accountDataRights.exportAccountData({
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
        const user = requireUser(request, response, auth);
        if (!user) return;
        const result = accountDataRights.deleteAccount({
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
        const payload = await readJson(request);
        sendJson(response, 200, await deepSeekPlan.generatePlan({
          payload,
          env,
          deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "deepseek-plan"),
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-plan-jobs") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const job = deepSeekPlanJobs.create(user, () =>
          deepSeekPlan.generatePlan({
            payload,
            env,
            deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "deepseek-plan"),
          }),
        );
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const deepSeekPlanJobMatch = url.pathname.match(/^\/api\/deepseek-plan-jobs\/([a-f0-9-]{36})$/);
      if (request.method === "GET" && deepSeekPlanJobMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const job = deepSeekPlanJobs.get(user, deepSeekPlanJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "DeepSeek plan job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
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
          deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "deepseek-rag"),
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
          deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "school-selection"),
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/school-selection-jobs") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const job = schoolSelectionJobs.create(user, () =>
          schoolSelection.generateSelection({
            user,
            payload,
            env,
            deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "school-selection"),
          }),
        );
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const schoolSelectionJobMatch = url.pathname.match(/^\/api\/school-selection-jobs\/([a-f0-9-]{36})$/);
      if (request.method === "GET" && schoolSelectionJobMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const job = schoolSelectionJobs.get(user, schoolSelectionJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "School selection job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job, {
          fallbackError: "School selection generation failed.",
        }));
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
          deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "portfolio-capability-assessment"),
        }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/portfolio-capability-assessment-jobs") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const job = portfolioCapabilityAssessmentJobs.create(user, () =>
          portfolioCapabilityAgent.generateAssessment({
            user,
            payload,
            env,
            deepSeekFetch: instrumentDeepSeekFetch(
              deepSeekFetch,
              metrics,
              "portfolio-capability-assessment",
            ),
          }),
        );
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const capabilityAssessmentJobMatch = url.pathname.match(
        /^\/api\/portfolio-capability-assessment-jobs\/([a-f0-9-]{36})$/,
      );
      if (request.method === "GET" && capabilityAssessmentJobMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const job = portfolioCapabilityAssessmentJobs.get(user, capabilityAssessmentJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "Portfolio capability assessment job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/deepseek-rag-jobs") {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const payload = await readJson(request);
        const job = deepSeekRagJobs.create(user, () =>
          deepSeekRag.answerQuestion({
            user,
            question: payload.question,
            historySummary: payload.historySummary,
            assistantProfile: payload.assistantProfile,
            env,
            deepSeekFetch: instrumentDeepSeekFetch(deepSeekFetch, metrics, "deepseek-rag"),
          }),
        );
        sendJson(response, 202, { jobId: job.id, status: job.status });
        return;
      }

      const deepSeekRagJobMatch = url.pathname.match(/^\/api\/deepseek-rag-jobs\/([a-f0-9-]{36})$/);
      if (request.method === "GET" && deepSeekRagJobMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        const job = deepSeekRagJobs.get(user, deepSeekRagJobMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "DeepSeek RAG job not found." });
          return;
        }
        sendJson(response, 200, serializeGenerationJob(job));
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
        const result = planning.deleteSnapshot(user, snapshotMatch[1], snapshotMatch[2]);
        auth.recordAuditEvent({
          actor: user,
          action: "plan.snapshot.delete",
          resourceType: "planning_snapshot",
          resourceId: snapshotMatch[2],
          details: { planId: snapshotMatch[1] },
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, result);
        return;
      }

      const restoreMatch = url.pathname.match(
        /^\/api\/plans\/(\d+)\/snapshots\/(\d+)\/restore$/,
      );
      if (request.method === "POST" && restoreMatch) {
        const user = requireUser(request, response, auth);
        if (!user) return;
        await readJson(request);
        const restored = planning.restoreSnapshot(user, restoreMatch[1], restoreMatch[2]);
        auth.recordAuditEvent({
          actor: user,
          action: "plan.snapshot.restore",
          resourceType: "planning_snapshot",
          resourceId: restoreMatch[2],
          details: { planId: restoreMatch[1] },
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, restored);
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
        const result = planning.deletePlan(user, planMatch[1]);
        auth.recordAuditEvent({
          actor: user,
          action: "plan.delete",
          resourceType: "planning_project",
          resourceId: planMatch[1],
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, result);
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
        const admin = requireAdmin(request, response, auth, {
          audit: { action: "admin.dashboard.view", resourceType: "admin_dashboard" },
        });
        if (!admin) return;
        const dashboard = adminOperations.getLoginDashboard({
          admin,
          searchParams: url.searchParams,
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, dashboard);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/ops/metrics") {
        const admin = requireAdmin(request, response, auth, {
          audit: { action: "admin.ops.metrics.view", resourceType: "admin_ops_metrics" },
        });
        if (!admin) return;
        sendJson(response, 200, adminOperations.getOpsMetrics());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/audit-log/export") {
        const admin = requireAdmin(request, response, auth, {
          audit: { action: "admin.audit_log.export", resourceType: "audit_log" },
        });
        if (!admin) return;
        const auditExport = adminOperations.exportAuditLog({
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
        const admin = requireAdmin(request, response, auth, {
          audit: {
            action: "admin.feedback.update",
            resourceType: "feedback_entry",
            resourceId: adminFeedbackMatch[1],
          },
        });
        if (!admin) return;
        const payload = await readJson(request);
        const feedback = adminOperations.updateFeedbackEntry({
          admin,
          feedbackId: adminFeedbackMatch[1],
          payload,
          metadata: getRequestMetadata(request),
        });
        sendJson(response, 200, { feedback });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, withSecurityHeaders({ "Content-Type": "text/plain;charset=utf-8" }));
        response.end("Method Not Allowed");
        return;
      }

      const requestPath = normalizeStaticRequestPath(url.pathname);
      const staticAccessPolicy = getStaticRouteAccessPolicy(requestPath);
      if (staticAccessPolicy && !requireAccess(request, response, auth, staticAccessPolicy)) {
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
        const user = getUserForRequest(request, auth);
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
        error instanceof RequestError
      ) {
        const statusCode = error.statusCode || 500;
        logRequestError(logger, request, error, statusCode, observedRequest.path);
        sendJson(response, statusCode, { error: error.message });
        return;
      }
      logRequestError(logger, request, error, 500, observedRequest.path);
      sendJson(response, 500, { error: "Server error" });
    }
  });

  server.on("close", () => authDb.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAppServer({ logger: createConsoleStructuredLogger() }).listen(port, host, () => {
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
