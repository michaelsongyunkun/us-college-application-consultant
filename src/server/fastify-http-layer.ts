import Fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyRequest,
} from "fastify";
import { PassThrough } from "node:stream";
import { z } from "zod";
import {
  HealthResponseSchema,
  PromptResponseSchema,
  RagStreamRequestSchema,
  ReadinessResponseSchema,
  UnifiedErrorSchema,
} from "../contracts/schemas.js";
import {
  DEFAULT_CSRF_HEADER_NAME,
  getCsrfCookieToken,
  getSessionTokens,
  getUserForRequest,
} from "./auth-http-service.mjs";
import {
  RESPONSE_REQUEST_ID_HEADER,
  getOrCreateRequestId,
} from "./observability.mjs";

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

export const FASTIFY_MIGRATED_ROUTES = Object.freeze([
  "GET /healthz",
  "HEAD /healthz",
  "GET /readyz",
  "HEAD /readyz",
  "GET /api/prompt",
  "POST /api/deepseek-rag/stream",
]);

const migratedRouteSet = new Set(FASTIFY_MIGRATED_ROUTES);

type AuthDependency = {
  getUserForSession(sessionToken: string): unknown | Promise<unknown>;
  verifyCsrfToken(sessionToken: string, csrfToken: string): boolean | Promise<boolean>;
};

type ReadinessPayload = z.infer<typeof ReadinessResponseSchema>;

export type FastifyHttpLayerOptions = {
  auth: AuthDependency;
  env?: Record<string, string | undefined>;
  readinessCheck: () => ReadinessPayload | Promise<ReadinessPayload>;
  readPrompt: () => string | Promise<string>;
  answerRag: (input: {
    user: any;
    question: string;
    historySummary: string;
    assistantProfile: "" | "major-match" | "inspiration";
    signal: AbortSignal;
    onToken?: (text: string) => void | Promise<void>;
  }) => unknown | Promise<unknown>;
};

export function isFastifyMigratedRoute(method = "GET", pathname = "/") {
  return migratedRouteSet.has(`${String(method).toUpperCase()} ${pathname}`);
}

export async function createFastifyHttpLayer(
  options: FastifyHttpLayerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    exposeHeadRoutes: false,
    genReqId: (request) => request.requestId || getOrCreateRequestId(request),
    logger: false,
  });

  registerSchemas(app);
  await app.register(requestContextPlugin, options);
  await app.ready();
  return app;
}

function registerSchemas(app: FastifyInstance) {
  for (const [id, schema] of [
    ["HealthResponse", HealthResponseSchema],
    ["ReadinessResponse", ReadinessResponseSchema],
    ["PromptResponse", PromptResponseSchema],
    ["RagStreamRequest", RagStreamRequestSchema],
    ["UnifiedError", UnifiedErrorSchema],
  ] as const) {
    app.addSchema({
      ...z.toJSONSchema(schema, { target: "draft-7" }),
      $id: id,
    });
  }
}

const requestContextPlugin: FastifyPluginAsync<FastifyHttpLayerOptions> = async (app, options) => {
  app.addHook("onRequest", async (request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
    reply.header(RESPONSE_REQUEST_ID_HEADER, request.id);
    request.raw.requestId = request.id;
  });
  await app.register(readOnlyRoutesPlugin, options);
};

const readOnlyRoutesPlugin: FastifyPluginAsync<FastifyHttpLayerOptions> = async (
  app,
  { auth, env = process.env, readinessCheck, readPrompt, answerRag },
) => {
  const ragRateLimit = createFixedWindowLimiter(Number(env.RAG_STREAM_RATE_LIMIT || 20), 60_000);
  app.get("/healthz", {
    schema: { response: { 200: { $ref: "HealthResponse#" } } },
  }, async (request) => ({
      status: "ok",
      requestId: request.id,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
  }));
  app.head("/healthz", async (_request, reply) => {
    return reply.type("application/json;charset=utf-8").code(200).send();
  });

  app.get("/readyz", {
    schema: {
      response: {
        200: { $ref: "ReadinessResponse#" },
        503: { $ref: "ReadinessResponse#" },
      },
    },
  }, async (_request, reply) => {
    const readiness = await readinessCheck();
    return reply.code(readiness.status === "ready" ? 200 : 503).send(readiness);
  });
  app.head("/readyz", async (_request, reply) => {
    const readiness = await readinessCheck();
    return reply
      .type("application/json;charset=utf-8")
      .code(readiness.status === "ready" ? 200 : 503)
      .send();
  });

  app.get(
    "/api/prompt",
    {
      schema: {
        response: {
          200: { $ref: "PromptResponse#" },
          401: { $ref: "UnifiedError#" },
          500: { $ref: "UnifiedError#" },
        },
      },
    },
    async (request, reply) => {
      const user = await getUserForRequest(request.raw, auth);
      if (!user) {
        return reply.code(401).send(buildErrorResponse({
          error: "Not authenticated",
          code: "AUTH",
          requestId: request.id,
          retryable: false,
        }));
      }
      return {
        prompt: await readPrompt(),
        hasDeepSeekApiKey: Boolean(String(env.DEEPSEEK_API_KEY || "").trim()),
      };
    },
  );

  app.post("/api/deepseek-rag/stream", async (request, reply) => {
    const session = await getAuthenticatedSession(request.raw, auth);
    if (!session) {
      return reply.code(401).send(buildErrorResponse({ error: "Not authenticated", code: "AUTH", requestId: request.id, retryable: false }));
    }
    if (!await hasValidCsrf(request.raw, auth, session.sessionToken)) {
      return reply.code(403).send(buildErrorResponse({ error: "Invalid CSRF token", code: "CSRF", requestId: request.id, retryable: false }));
    }
    const parsed = RagStreamRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(buildErrorResponse({ error: "Invalid RAG request", code: "VALIDATION", requestId: request.id, retryable: false }));
    }
    if (!ragRateLimit.allow(String(session.user?.id || request.ip))) {
      return reply.code(429).send(buildErrorResponse({ error: "Too many requests", code: "RATE_LIMIT", requestId: request.id, retryable: true }));
    }
    const isInspirationRequest = parsed.data.assistantProfile === "inspiration";

    const stream = new PassThrough();
    const controller = new AbortController();
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) controller.abort();
    });
    reply
      .header("Content-Type", "text/event-stream; charset=utf-8")
      .header("Cache-Control", "no-cache, no-transform")
      .header("Connection", "keep-alive")
      .header("X-Accel-Buffering", "no")
      .send(stream);

    stream.write(sseEvent("status", {
      stage: isInspirationRequest ? "conversation_started" : "retrieval_started",
      requestId: request.id,
    }));
    void (async () => {
      try {
        const result = await answerRag({
          ...parsed.data,
          user: session.user,
          signal: controller.signal,
          onToken: isInspirationRequest
            ? (text) => {
              if (!controller.signal.aborted && !stream.destroyed && text) {
                stream.write(sseEvent("delta", { text }));
              }
            }
            : undefined,
        });
        stream.write(sseEvent("result", result));
        stream.write(sseEvent("done", { requestId: request.id }));
      } catch (error) {
        stream.write(sseEvent("error", {
          error: isInspirationRequest ? "Inspiration conversation failed" : "RAG request failed",
          code: isInspirationRequest ? "INSPIRATION_ERROR" : "RAG_ERROR",
          requestId: request.id,
          retryable: true,
        }));
      } finally {
        stream.end();
      }
    })();
    return reply;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.code(500).send(buildErrorResponse({
      error: "Server error",
      code: "SERVER_ERROR",
      requestId: request.id,
      retryable: true,
    }));
  });
};

async function getAuthenticatedSession(request: any, auth: AuthDependency): Promise<{ user: any; sessionToken: string } | null> {
  for (const sessionToken of [...getSessionTokens(request)].reverse()) {
    const user: any = await auth.getUserForSession(sessionToken);
    if (user) return { user, sessionToken };
  }
  return null;
}

async function hasValidCsrf(request: any, auth: AuthDependency, sessionToken: string) {
  const headerToken = String(request.headers[DEFAULT_CSRF_HEADER_NAME] || "");
  const cookieToken = getCsrfCookieToken(request);
  return Boolean(headerToken && cookieToken && headerToken === cookieToken && await auth.verifyCsrfToken(sessionToken, headerToken));
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createFixedWindowLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  const safeMax = Number.isInteger(maxRequests) && maxRequests > 0 ? maxRequests : 20;
  return {
    allow(key: string) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.expiresAt <= now) {
        buckets.set(key, { count: 1, expiresAt: now + windowMs });
        return true;
      }
      bucket.count += 1;
      return bucket.count <= safeMax;
    },
  };
}

function buildErrorResponse(payload: {
  error: string;
  code: string;
  requestId: string;
  retryable: boolean;
}) {
  return UnifiedErrorSchema.parse(payload);
}

declare module "node:http" {
  interface IncomingMessage {
    requestId?: string;
  }
}
