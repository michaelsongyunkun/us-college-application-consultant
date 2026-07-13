import { randomUUID } from "node:crypto";

export const DEFAULT_GENERATION_JOB_TTL_MS = 30 * 60_000;

export function createGenerationJobService({
  ttlMs = DEFAULT_GENERATION_JOB_TTL_MS,
  idFactory = randomUUID,
  now = () => Date.now(),
  errorClasses = [],
  unexpectedErrorLogger = console.error,
} = {}) {
  const jobs = new Map();
  const controllers = new Map();

  function pruneJobs() {
    const expiredBefore = now() - ttlMs;
    for (const [jobId, job] of jobs) {
      if (job.updatedAt < expiredBefore) {
        controllers.get(jobId)?.abort(new Error("Job expired"));
        controllers.delete(jobId);
        jobs.delete(jobId);
      }
    }
  }

  function create(user, task) {
    pruneJobs();
    const timestamp = now();
    const job = {
      id: idFactory(),
      userId: user.id,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const controller = new AbortController();
    jobs.set(job.id, job);
    controllers.set(job.id, controller);
    startJob(job, task, controller);
    return job;
  }

  function get(user, jobId) {
    pruneJobs();
    const job = jobs.get(jobId);
    return job?.userId === user.id ? job : null;
  }

  function cancel(user, jobId) {
    pruneJobs();
    const job = jobs.get(jobId);
    if (!job || job.userId !== user.id) return null;
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    controllers.get(job.id)?.abort(new Error("Job cancelled"));
    job.status = "cancelled";
    job.completedAt = now();
    job.updatedAt = job.completedAt;
    return job;
  }

  function startJob(job, task, controller) {
    Promise.resolve()
      .then(async () => {
        job.status = "running";
        job.updatedAt = now();
        const result = await task({ signal: controller.signal });
        if (job.status === "cancelled") return;
        job.result = result;
        job.status = "completed";
        job.completedAt = now();
        job.updatedAt = job.completedAt;
      })
      .catch((error) => {
        if (job.status === "cancelled") return;
        const normalizedError = normalizeGenerationJobError(error, {
          errorClasses,
          unexpectedErrorLogger,
        });
        job.status = "failed";
        job.error = normalizedError.error;
        job.statusCode = normalizedError.statusCode;
        job.completedAt = now();
        job.updatedAt = job.completedAt;
      })
      .finally(() => controllers.delete(job.id));
  }

  return { create, get, cancel, pruneJobs };
}

export function serializeGenerationJob(job, { fallbackError = "Generation failed." } = {}) {
  const payload = {
    jobId: job.id,
    status: job.status,
  };
  if (job.status === "completed") payload.result = job.result;
  if (job.status === "failed") {
    payload.error = job.error || fallbackError;
    payload.statusCode = job.statusCode || 500;
  }
  return payload;
}

export function normalizeGenerationJobError(
  error,
  { errorClasses = [], unexpectedErrorLogger = console.error } = {},
) {
  if (errorClasses.some((ErrorClass) => error instanceof ErrorClass)) {
    return {
      error: error.message,
      statusCode: error.statusCode || 500,
    };
  }
  unexpectedErrorLogger?.("Unexpected generation job error:", error);
  return {
    error: "Server error",
    statusCode: 500,
  };
}
