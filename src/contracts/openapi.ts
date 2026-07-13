import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  HealthResponseSchema,
  JobStatusSchema,
  PlanningResultSchema,
  PromptResponseSchema,
  RagStreamRequestSchema,
  RagSourceSchema,
  ReadinessResponseSchema,
  SchoolSelectionResultSchema,
  StudentProfileResponseSchema,
  StudentProfileSchema,
  UnifiedErrorSchema,
  UsageEventSchema,
} from "./schemas.js";

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries({
    StudentProfile: StudentProfileSchema,
    HealthResponse: HealthResponseSchema,
    ReadinessResponse: ReadinessResponseSchema,
    PromptResponse: PromptResponseSchema,
    RagStreamRequest: RagStreamRequestSchema,
    StudentProfileResponse: StudentProfileResponseSchema,
    PlanningResult: PlanningResultSchema,
    RagSource: RagSourceSchema,
    SchoolSelectionResult: SchoolSelectionResultSchema,
    JobStatus: JobStatusSchema,
    UnifiedError: UnifiedErrorSchema,
    UsageEvent: UsageEventSchema,
  })) registry.register(name, schema);

  const errorResponse = {
    description: "Unified API error",
    content: { "application/json": { schema: UnifiedErrorSchema } },
  };
  registry.registerPath({
    method: "get",
    path: "/healthz",
    responses: { 200: { description: "Process liveness", content: { "application/json": { schema: HealthResponseSchema } } } },
  });
  registry.registerPath({
    method: "get",
    path: "/readyz",
    responses: {
      200: { description: "Runtime dependencies are ready", content: { "application/json": { schema: ReadinessResponseSchema } } },
      503: { description: "A runtime dependency is not ready", content: { "application/json": { schema: ReadinessResponseSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/prompt",
    responses: {
      200: { description: "Fixed planning prompt and model configuration status", content: { "application/json": { schema: PromptResponseSchema } } },
      401: errorResponse,
      500: errorResponse,
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/student-profile",
    responses: { 200: { description: "Current student profile", content: { "application/json": { schema: StudentProfileResponseSchema } } }, 401: errorResponse },
  });
  registry.registerPath({
    method: "put",
    path: "/api/student-profile",
    request: { body: { content: { "application/json": { schema: z.object({ profile: StudentProfileSchema }) } } } },
    responses: { 200: { description: "Saved student profile", content: { "application/json": { schema: StudentProfileResponseSchema } } }, 400: errorResponse, 401: errorResponse },
  });
  registry.registerPath({
    method: "post",
    path: "/api/analytics/usage-event",
    request: { body: { content: { "application/json": { schema: UsageEventSchema } } } },
    responses: { 200: { description: "Event accepted", content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } } }, 400: errorResponse, 401: errorResponse },
  });
  registry.registerPath({
    method: "post",
    path: "/api/deepseek-plan",
    responses: { 200: { description: "Validated planning result", content: { "application/json": { schema: z.object({ parsed: PlanningResultSchema, attempts: z.number().int() }).passthrough() } } }, 400: errorResponse, 502: errorResponse },
  });
  registry.registerPath({
    method: "post",
    path: "/api/deepseek-rag/stream",
    request: { body: { content: { "application/json": { schema: RagStreamRequestSchema } } } },
    responses: {
      200: { description: "RAG progress and final result as Server-Sent Events", content: { "text/event-stream": { schema: z.string() } } },
      400: errorResponse,
      401: errorResponse,
      403: errorResponse,
      429: errorResponse,
      500: errorResponse,
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "US College Application Consultant API", version: "1.0.0" },
    servers: [{ url: "/" }],
  });
}
