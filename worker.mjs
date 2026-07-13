import { createBullMqWorker, createRedisConnection } from "./src/infrastructure/bullmq-job-service.ts";
import { loadEnvFile } from "./src/server/env-loader.mjs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnvFile(join(root, ".env"));

const redisUrl = String(process.env.REDIS_URL || "").trim();
const handlerModule = String(process.env.JOB_HANDLER_MODULE || "").trim();
if (!redisUrl) throw new Error("REDIS_URL is required for the worker.");
if (!handlerModule) throw new Error("JOB_HANDLER_MODULE must export createHandlers() or handlers for the production worker.");

const loaded = await import(new URL(handlerModule, `file://${root.replace(/\\/gu, "/")}/`).href);
const handlerRuntime = loaded.handlers ? { handlers: loaded.handlers } : await loaded.createHandlers?.({ env: process.env, root });
const handlers = handlerRuntime?.handlers || handlerRuntime;
if (!handlers || typeof handlers !== "object") throw new Error("Worker handler module did not provide handlers.");

const connection = createRedisConnection(redisUrl);
const runtime = createBullMqWorker({
  queueName: process.env.JOB_QUEUE_NAME || "consultant-jobs",
  connection,
  handlers,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
});

const shutdown = async () => {
  await runtime.close();
  await handlerRuntime?.close?.();
  await connection.quit();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
