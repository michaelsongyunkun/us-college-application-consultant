import assert from "node:assert/strict";
import {
  createGenerationJobService,
  normalizeGenerationJobError,
  serializeGenerationJob,
} from "../src/server/generation-job-service.mjs";

class KnownJobError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "KnownJobError";
    this.statusCode = statusCode;
  }
}

let clock = 1_000;
let idCounter = 0;
const errors = [];
const jobs = createGenerationJobService({
  ttlMs: 100,
  idFactory: () => `job-${++idCounter}`,
  now: () => clock,
  errorClasses: [KnownJobError],
  unexpectedErrorLogger: (...args) => errors.push(args),
});

const alice = { id: 1 };
const bob = { id: 2 };

const completedJob = jobs.create(alice, async () => ({ answer: "ok" }));
assert.equal(completedJob.status, "pending");
assert.equal(completedJob.id, "job-1");
assert.equal(jobs.get(alice, completedJob.id), completedJob);
assert.equal(jobs.get(bob, completedJob.id), null);

await flushAsyncJob();
assert.equal(completedJob.status, "completed");
assert.deepEqual(serializeGenerationJob(completedJob), {
  jobId: "job-1",
  status: "completed",
  result: { answer: "ok" },
});

const knownFailedJob = jobs.create(alice, async () => {
  throw new KnownJobError("Model quota exceeded", 429);
});
await flushAsyncJob();
assert.equal(knownFailedJob.status, "failed");
assert.deepEqual(serializeGenerationJob(knownFailedJob), {
  jobId: "job-2",
  status: "failed",
  error: "Model quota exceeded",
  statusCode: 429,
});

const unknownFailedJob = jobs.create(alice, async () => {
  throw new Error("Secret internal failure");
});
await flushAsyncJob();
assert.equal(unknownFailedJob.status, "failed");
assert.deepEqual(serializeGenerationJob(unknownFailedJob), {
  jobId: "job-3",
  status: "failed",
  error: "Server error",
  statusCode: 500,
});
assert.equal(errors.length, 1);

let cancelledSignal;
let cancelledTaskSideEffect = false;
const cancellableJob = jobs.create(alice, async ({ signal } = {}) => {
  cancelledSignal = signal;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (!signal?.aborted) cancelledTaskSideEffect = true;
  return { answer: "too late" };
});
await flushAsyncJob();
assert.equal(jobs.cancel(alice, cancellableJob.id).status, "cancelled");
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(cancelledSignal?.aborted, true);
assert.equal(cancelledTaskSideEffect, false);

assert.deepEqual(
  serializeGenerationJob({ id: "job-4", status: "failed" }, { fallbackError: "School selection generation failed." }),
  {
    jobId: "job-4",
    status: "failed",
    error: "School selection generation failed.",
    statusCode: 500,
  },
);

assert.deepEqual(
  normalizeGenerationJobError(new KnownJobError("Bad request", 400), {
    errorClasses: [KnownJobError],
    unexpectedErrorLogger: () => {
      throw new Error("Known errors should not be logged as unexpected.");
    },
  }),
  { error: "Bad request", statusCode: 400 },
);

assert.deepEqual(
  normalizeGenerationJobError(new KnownJobError("postgresql://user:super-secret@db/internal", 503), {
    errorClasses: [KnownJobError],
  }),
  { error: "Service temporarily unavailable.", statusCode: 503 },
);

clock += 101;
jobs.pruneJobs();
assert.equal(jobs.get(alice, completedJob.id), null);

function flushAsyncJob() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
