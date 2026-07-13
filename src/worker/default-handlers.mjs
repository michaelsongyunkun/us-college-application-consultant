import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildWordDocument } from "../domain/word-export.mjs";
import { createActivityPortfolioService } from "../server/activity-portfolio-service.mjs";
import { createDeepSeekPlanService } from "../server/deepseek-plan-service.mjs";
import { createDeepSeekRagService } from "../server/deepseek-rag-service.mjs";
import { createMailerFromEnv } from "../server/mailer.mjs";
import { createPortfolioCapabilityAgentService } from "../server/portfolio-capability-agent-service.mjs";
import { createSchoolSelectionService } from "../server/school-selection-service.mjs";
import { createObjectStoreFromEnv } from "../infrastructure/object-store.ts";
import { createPostgresPool } from "../infrastructure/postgres.ts";
import { createPostgresProductionRepositories } from "../repositories/postgres-production-repositories.ts";
import { createEmbeddingClientFromEnv } from "../infrastructure/embedding-client.ts";
import { createRerankerClientFromEnv } from "../infrastructure/reranker-client.ts";
import { createRetrievalCacheFromEnv } from "../infrastructure/retrieval-cache.ts";
import { createPostgresRagRetriever } from "../infrastructure/postgres-rag-retriever.ts";

export async function createHandlers({ env, root }) {
  const promptPath = join(root, "prompts", "us-college-admissions-strategist-agent.md");
  const planService = createDeepSeekPlanService({ promptPath });
  const mailer = createMailerFromEnv(env);
  const objectStore = createObjectStoreFromEnv(env, { root });
  const pool = env.DATABASE_URL ? createPostgresPool(env) : null;
  const repositories = pool ? createPostgresProductionRepositories({ pool }) : null;
  const embeddingClient = env.EMBEDDING_API_KEY ? createEmbeddingClientFromEnv(env) : null;
  const rerankerClient = createRerankerClientFromEnv(env);
  const retrievalCache = createRetrievalCacheFromEnv(env);

  return {
    handlers: createDefaultJobHandlers({
      env,
      root,
      planService,
      mailer,
      objectStore,
      pool,
      repositories,
      embeddingClient,
      rerankerClient,
      retrievalCache,
    }),
    async close() { await Promise.all([pool?.end(), retrievalCache?.close()]); },
  };
}

export function createDefaultJobHandlers({
  env,
  root,
  planService,
  mailer,
  objectStore,
  pool = null,
  repositories = null,
  embeddingClient = null,
  rerankerClient = null,
  retrievalCache = null,
  createRagService = createDeepSeekRagService,
  createSchoolSelection = createSchoolSelectionService,
  createCapabilityAssessment = createPortfolioCapabilityAgentService,
}) {
  return {
    "ai.deepseek-plan": ({ payload }, { signal } = {}) => planService.generatePlan({ payload, env, signal }),
    "ai.deepseek-rag": async (payload, { signal } = {}) => {
      const planning = {
        getProfile: () => payload.profile || { profile: {}, updatedAt: null },
        listRagBackups: () => payload.backups || [],
      };
      const activityPortfolio = { getPortfolio: () => payload.portfolio || {} };
      const retriever = pool ? createPostgresRagRetriever({
        pool,
        root,
        planning,
        activityPortfolio,
        embeddingClient,
        rerankerClient,
        retrievalCache,
        knowledgeVersion: env.KNOWLEDGE_SOURCE_VERSION,
      }) : null;
      const service = createRagService({ root, planning, activityPortfolio, ...(retriever ? { retriever } : {}) });
      return service.answerQuestion({ user: payload.user, question: payload.question, historySummary: payload.historySummary, assistantProfile: payload.assistantProfile, env, signal });
    },
    "ai.school-selection": async (payload, { signal } = {}) => {
      const service = createSchoolSelection({ root, activityPortfolio: { getPortfolio: () => payload.portfolio || {} } });
      return service.generateSelection({ user: payload.user, payload: payload.payload, env, signal });
    },
    "ai.capability-assessment": async (payload, { signal } = {}) => {
      let pendingSave = null;
      const activityPortfolio = {
        getPortfolio: () => payload.portfolio || {},
        savePortfolio: (_user, nextPortfolio) => {
          if (!repositories) throw new Error("DATABASE_URL is required to persist capability assessments from the worker.");
          pendingSave = repositories.activities.upsert(payload.user.id, nextPortfolio);
          return nextPortfolio;
        },
      };
      const service = createCapabilityAssessment({ activityPortfolio });
      const result = await service.generateAssessment({ user: payload.user, payload: payload.payload, env, signal });
      if (pendingSave) await pendingSave;
      return result;
    },
    "export.word": async (payload, { job } = {}) => {
      const html = typeof payload.document === "string" ? payload.document : buildWordDocument(payload.document || payload);
      const key = `exports/${payload.exportId || job?.id || randomUUID()}.doc`;
      await objectStore.put({ userId: payload.userId, key, body: Buffer.from(html, "utf8"), contentType: "application/msword" });
      const signed = await objectStore.getSignedDownloadUrl({ userId: payload.userId, key, expiresInSeconds: Number(env.OBJECT_SIGNED_URL_TTL_SECONDS || 300) });
      return { objectKey: `users/${payload.userId}/${key}`, downloadUrl: signed.url, expiresAt: signed.expiresAt };
    },
    "email.password-reset": async (payload) => {
      await mailer.sendPasswordResetEmail(payload);
      return { sent: true };
    },
  };
}
