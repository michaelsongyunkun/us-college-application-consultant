import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const SafeTextSchema = z.string().trim().max(4_000);

export const StudentProfileSchema = z
  .object({
    grade: z.string().trim().max(40).optional(),
    nationality: z.string().trim().max(80).optional(),
    schoolRegion: z.string().trim().max(120).optional(),
    curriculum: z.string().trim().max(80).optional(),
    majorDirection: z.string().trim().max(240).optional(),
    interests: z.string().trim().max(2_000).optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown()), z.null()]))
  .openapi("StudentProfile");

export const PlanningActivitySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    type: SafeTextSchema,
    activityName: SafeTextSchema,
    executionDescription: SafeTextSchema,
    suggestedGrade: z.string().trim().max(120),
  })
  .openapi("PlanningActivity");

export const PlanningResultSchema = z
  .object({
    activities: z.array(PlanningActivitySchema).length(15),
    narrative: SafeTextSchema.min(1),
    caveats: z.array(SafeTextSchema).max(10).default([]),
    nextActions: z.array(SafeTextSchema).max(10).default([]),
  })
  .openapi("PlanningResult");

export const PlanningResultJsonSchema = z.toJSONSchema(PlanningResultSchema, { target: "draft-7" });

export const RagSourceSchema = z
  .object({
    id: z.string().trim().max(240),
    type: z.string().trim().max(80),
    typeLabel: z.string().trim().max(120),
    title: z.string().trim().max(300),
    snippet: z.string().trim().max(2_000).optional(),
  })
  .passthrough()
  .openapi("RagSource");

export const SchoolRecommendationSchema = z
  .object({
    school: z.string().trim().min(1).max(240),
    major: z.string().trim().min(1).max(240),
    riskLevel: z.enum(["high", "medium", "low"]),
    admissionProbability: z.string().trim().max(80),
    matchReason: SafeTextSchema,
    gaps: z.array(SafeTextSchema).max(10).default([]),
    nextAction: SafeTextSchema,
  })
  .passthrough()
  .openapi("SchoolRecommendation");

export const SchoolSelectionResultSchema = z
  .object({
    summary: SafeTextSchema,
    rounds: z.object({
      rea: z.array(SchoolRecommendationSchema),
      ed1: z.array(SchoolRecommendationSchema),
      ed2: z.array(SchoolRecommendationSchema),
      ea: z.array(SchoolRecommendationSchema),
      rd: z.array(SchoolRecommendationSchema),
      uc: z.array(SchoolRecommendationSchema),
    }),
    strategy: z.record(z.string(), z.unknown()),
    nextActions: z.array(SafeTextSchema).max(8),
  })
  .passthrough()
  .openapi("SchoolSelectionResult");

export const JobStatusSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
    result: z.unknown().optional(),
    error: z.string().max(1_000).optional(),
    statusCode: z.number().int().min(400).max(599).optional(),
  })
  .openapi("JobStatus");

export const UnifiedErrorSchema = z
  .object({
    error: z.string().trim().min(1).max(1_000),
    code: z.string().trim().min(1).max(120),
    requestId: z.string().trim().max(128).optional(),
    retryable: z.boolean().default(false),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("UnifiedError");

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    requestId: z.string().trim().min(1).max(128),
    uptimeSeconds: z.number().int().nonnegative(),
    timestamp: IsoDateTimeSchema,
  })
  .openapi("HealthResponse");

export const ReadinessResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    database: z.object({ ok: z.boolean() }).catchall(z.unknown()),
  })
  .openapi("ReadinessResponse");

export const PromptResponseSchema = z
  .object({
    prompt: z.string(),
    hasDeepSeekApiKey: z.boolean(),
  })
  .openapi("PromptResponse");

export const RagStreamRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(1_200),
    historySummary: z.string().trim().max(1_800).optional().default(""),
    assistantProfile: z.enum(["", "major-match", "inspiration"]).optional().default(""),
  })
  .openapi("RagStreamRequest");

export const UsageEventSchema = z
  .object({
    eventType: z.string().trim().min(1).max(120),
    profile: z.record(z.string(), z.unknown()).default({}),
    metrics: z.record(z.string(), z.unknown()).default({}),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .openapi("UsageEvent");

export const StudentProfileResponseSchema = z
  .object({ profile: StudentProfileSchema, updatedAt: IsoDateTimeSchema.nullable() })
  .openapi("StudentProfileResponse");

export type StudentProfile = z.infer<typeof StudentProfileSchema>;
export type PlanningResult = z.infer<typeof PlanningResultSchema>;
export type RagSource = z.infer<typeof RagSourceSchema>;
export type SchoolSelectionResult = z.infer<typeof SchoolSelectionResultSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type UnifiedError = z.infer<typeof UnifiedErrorSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
export type PromptResponse = z.infer<typeof PromptResponseSchema>;
export type RagStreamRequest = z.infer<typeof RagStreamRequestSchema>;
export type UsageEvent = z.infer<typeof UsageEventSchema>;
