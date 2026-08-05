import { createHash, randomUUID } from "node:crypto";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";

export const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5_000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 5_000 },
});

export function createRedisConnection(redisUrl: string, overrides: any = {}) {
  if (!redisUrl) throw new Error("REDIS_URL is required for BullMQ.");
  return new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, ...overrides });
}

export function createBullMqJobService({ queueName, connection, prefix = "consultant", now = () => Date.now() }: any) {
  const queue = new Queue(queueName, { connection, prefix });
  const cancelledKey = (id: string) => `${prefix}:${queueName}:cancelled:${id}`;

  return {
    queue,
    async create(user: any, type: string, payload: any, options: any = {}) {
      const userId = requireUserId(user);
      const idempotencyKey = String(options.idempotencyKey || randomUUID());
      const jobId = deterministicJobId(userId, type, idempotencyKey);
      const existing = await queue.getJob(jobId);
      if (existing) return serializeBullJob(existing, await existing.getState());
      const job = await queue.add(type, { userId, type, payload, idempotencyKey, timeoutMs: normalizeTimeout(options.timeoutMs) }, {
        jobId,
        attempts: normalizeAttempts(options.attempts),
        backoff: options.backoff || DEFAULT_JOB_OPTIONS.backoff,
        removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete,
        removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail,
      });
      return serializeBullJob(job, "waiting");
    },
    async get(user: any, id: string) {
      const userId = requireUserId(user);
      const redis = await queue.client;
      const cancelledJson = await redis.get(cancelledKey(id));
      const cancelled = cancelledJson ? JSON.parse(cancelledJson) : null;
      if (cancelled) return Number(cancelled.userId) === userId ? cancelled : null;
      const job = await queue.getJob(id);
      return job ? resolveBullJobRecord({ userId, job, state: await job.getState(), cancelled: null }) : null;
    },
    async cancel(user: any, id: string) {
      const userId = requireUserId(user);
      const job = await queue.getJob(id);
      if (!job || Number(job.data?.userId) !== userId) return null;
      const redis = await queue.client;
      const record = { id, userId, type: job.name, status: "cancelled", createdAt: job.timestamp, updatedAt: now(), completedAt: now() };
      await redis.set(cancelledKey(id), JSON.stringify(record), "EX", 7 * 24 * 60 * 60);
      const state = await job.getState();
      if (state !== "active") await job.remove();
      return record;
    },
    async close() { await queue.close(); },
  };
}

export function createBullMqWorker({ queueName, connection, handlers, prefix = "consultant", concurrency = 4, deadLetterQueueName = `${queueName}-dead-letter` }: any) {
  const deadLetterQueue = new Queue(deadLetterQueueName, { connection, prefix });
  const worker = new Worker(queueName, async (job) => {
    const handler = handlers[job.name];
    if (!handler) throw new UnrecoverableError(`Unsupported job type: ${job.name}`);
    const redis = await worker.client;
    const cancellationKey = `${prefix}:${queueName}:cancelled:${job.id}`;
    if (await redis.exists(cancellationKey)) throw new UnrecoverableError("Job cancelled");
    const controller = new AbortController();
    const timeoutMs = normalizeTimeout(job.data.timeoutMs);
    const cancellation = createCancellationWatcher({ redis, cancellationKey, controller });
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(`Job timed out after ${timeoutMs}ms`)); }, timeoutMs);
        timer.unref?.();
      });
      const result = await Promise.race([
        handler(job.data.payload, { signal: controller.signal, job, userId: job.data.userId }),
        timeout,
        cancellation.promise,
      ]);
      if (await redis.exists(cancellationKey)) throw new UnrecoverableError("Job cancelled");
      return result;
    } finally { if (timer) clearTimeout(timer); cancellation.stop(); }
  }, { connection, prefix, concurrency });

  worker.on("failed", async (job, error) => {
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    const redis = await worker.client;
    if (await redis.exists(`${prefix}:${queueName}:cancelled:${job.id}`)) return;
    await deadLetterQueue.add(job.name, buildDeadLetterPayload(job, error), {
      jobId: `dlq-${job.id}`,
      removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete,
      removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail,
    });
  });

  return {
    worker,
    deadLetterQueue,
    async close() { await worker.close(); await deadLetterQueue.close(); },
  };
}

export function createBullMqGenerationJobAdapter({ service, type, defaultOptions = {} }: any) {
  return {
    async create(user: any, _localTask: any, descriptor: any = {}) {
      return service.create(user, descriptor.type || type, descriptor.payload || {}, { ...defaultOptions, ...(descriptor.options || {}) });
    },
    async get(user: any, id: string) { return service.get(user, id); },
    async cancel(user: any, id: string) { return service.cancel(user, id); },
  };
}

export function serializeBullJob(job: any, state: string) {
  const status = mapBullState(state);
  const payload: any = { id: String(job.id), userId: Number(job.data?.userId), type: job.name, status, createdAt: job.timestamp, updatedAt: job.finishedOn || job.processedOn || job.timestamp };
  if (status === "completed") { payload.result = job.returnvalue; payload.completedAt = job.finishedOn; }
  if (status === "failed") {
    // BullMQ only exposes a provider error string here. Do not send it to the
    // browser because it may contain credentials, connection URLs, or stack
    // traces from a worker.
    payload.error = "Generation failed.";
    payload.statusCode = 500;
    payload.completedAt = job.finishedOn;
  }
  return payload;
}

export function resolveBullJobRecord({ userId, cancelled, job, state }: any) {
  if (cancelled) return Number(cancelled.userId) === Number(userId) ? cancelled : null;
  return job && Number(job.data?.userId) === Number(userId) ? serializeBullJob(job, state) : null;
}

export function createCancellationWatcher({ redis, cancellationKey, controller, pollIntervalMs = 250 }: any) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    const check = async () => {
      if (stopped) return;
      try {
        if (await redis.exists(cancellationKey)) {
          const error = new UnrecoverableError("Job cancelled");
          controller.abort(error);
          reject(error);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      timer = setTimeout(check, Math.max(1, Number(pollIntervalMs) || 250));
      timer.unref?.();
    };
    void check();
  });
  return {
    promise,
    stop() { stopped = true; if (timer) clearTimeout(timer); },
  };
}

export function buildDeadLetterPayload(job: any, error: any) {
  return {
    originalJobId: String(job.id),
    userId: Number(job.data?.userId),
    jobType: job.name,
    failedReason: error?.name || "Job failed",
    attemptsMade: Number(job.attemptsMade || 0),
    failedAt: Date.now(),
  };
}

function deterministicJobId(userId: number, type: string, idempotencyKey: string) {
  const hash = createHash("sha256").update(`${userId}\n${type}\n${idempotencyKey}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function mapBullState(state: string) { return ({ active: "running", completed: "completed", failed: "failed" } as any)[state] || "pending"; }
function normalizeAttempts(value: unknown) { const attempts = Number(value); return Number.isInteger(attempts) && attempts >= 1 && attempts <= 10 ? attempts : DEFAULT_JOB_OPTIONS.attempts; }
function normalizeTimeout(value: unknown) { const timeout = Number(value); return Number.isInteger(timeout) && timeout >= 1_000 && timeout <= 15 * 60_000 ? timeout : 120_000; }
function requireUserId(user: any) { const id = Number(user?.id); if (!Number.isInteger(id) || id <= 0) throw new Error("Not authenticated"); return id; }
