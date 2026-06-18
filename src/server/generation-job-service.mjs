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

  function pruneJobs() {
    const expiredBefore = now() - ttlMs;
    for (const [jobId, job] of jobs) {
      if (job.updatedAt < expiredBefore) jobs.delete(jobId);
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
    jobs.set(job.id, job);
    startJob(job, task);
    return job;
  }

  function get(user, jobId) {
    pruneJobs();
    const job = jobs.get(jobId);
    return job?.userId === user.id ? job : null;
  }

  function startJob(job, task) {
    Promise.resolve()
      .then(async () => {
        job.status = "running";
        job.updatedAt = now();
        job.result = await task();
        job.status = "completed";
        job.completedAt = now();
        job.updatedAt = job.completedAt;
      })
      .catch((error) => {
        const normalizedError = normalizeGenerationJobError(error, {
          errorClasses,
          unexpectedErrorLogger,
        });
        job.status = "failed";
        job.error = normalizedError.error;
        job.statusCode = normalizedError.statusCode;
        job.completedAt = now();
        job.updatedAt = job.completedAt;
      });
  }

  return { create, get, pruneJobs };
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
