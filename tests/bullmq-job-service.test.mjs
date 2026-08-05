import assert from "node:assert/strict";
import {
  DEFAULT_JOB_OPTIONS,
  buildDeadLetterPayload,
  createCancellationWatcher,
  resolveBullJobRecord,
  serializeBullJob,
} from "../src/infrastructure/bullmq-job-service.ts";

assert.equal(typeof DEFAULT_JOB_OPTIONS.removeOnComplete, "object");
assert.equal(DEFAULT_JOB_OPTIONS.removeOnComplete.age > 0, true);
assert.equal(DEFAULT_JOB_OPTIONS.removeOnFail.count > 0, true);

const cancelled = { id: "job-1", userId: 7, status: "cancelled" };
const activeJob = { data: { userId: 7 } };
assert.deepEqual(resolveBullJobRecord({ userId: 7, cancelled, job: activeJob, state: "active" }), cancelled);
assert.equal(resolveBullJobRecord({ userId: 8, cancelled, job: activeJob, state: "active" }), null);

const controller = new AbortController();
const watcher = createCancellationWatcher({
  redis: { async exists() { return 1; } },
  cancellationKey: "cancelled:job-1",
  controller,
  pollIntervalMs: 1,
});
await assert.rejects(watcher.promise, /cancelled/i);
assert.equal(controller.signal.aborted, true);
watcher.stop();

const deadLetter = buildDeadLetterPayload({
  id: "job-1",
  name: "ai.deepseek-rag",
  attemptsMade: 3,
  data: { userId: 7, payload: { profile: { name: "Private Student" }, resetUrl: "secret" } },
}, new Error("failed"));
assert.equal("payload" in deadLetter, false);
assert.equal(JSON.stringify(deadLetter).includes("Private Student"), false);
assert.equal(deadLetter.originalJobId, "job-1");
assert.deepEqual(
  serializeBullJob({ id: "job-2", name: "ai.deepseek-rag", data: { userId: 7 }, failedReason: "postgresql://user:secret@db/internal" }, "failed"),
  {
    id: "job-2",
    userId: 7,
    type: "ai.deepseek-rag",
    status: "failed",
    createdAt: undefined,
    updatedAt: undefined,
    error: "Generation failed.",
    statusCode: 500,
    completedAt: undefined,
  },
);
