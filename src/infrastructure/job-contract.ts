import { randomUUID } from "node:crypto";

export interface DurableJobService {
  create(user: any, type: string, payload: any, options?: any): Promise<any>;
  get(user: any, id: string): Promise<any | null>;
  cancel(user: any, id: string): Promise<any>;
}

function createInMemoryFixture({ handlers = {}, now = () => Date.now() }: any = {}) {
  const jobs = new Map<string, any>();
  const idempotency = new Map<string, string>();
  const pending: Promise<void>[] = [];

  const service: any = {
    async create(user: any, type: string, payload: any, options: any = {}) {
      const userId = requireUserId(user);
      const key = `${userId}:${type}:${String(options.idempotencyKey || "")}`;
      if (options.idempotencyKey && idempotency.has(key)) return jobs.get(idempotency.get(key));
      const timestamp = now();
      const job = { id: randomUUID(), userId, type, status: "pending", createdAt: timestamp, updatedAt: timestamp };
      jobs.set(job.id, job);
      if (options.idempotencyKey) idempotency.set(key, job.id);
      if (!options.defer) pending.push(execute(job, payload));
      return job;
    },
    async get(user: any, id: string) { const job = jobs.get(id); return job?.userId === requireUserId(user) ? job : null; },
    async cancel(user: any, id: string) {
      const job = await service.get(user, id);
      if (!job) return null;
      if (["completed", "failed", "cancelled"].includes(job.status)) return job;
      job.status = "cancelled"; job.updatedAt = now(); job.completedAt = job.updatedAt;
      return job;
    },
    async drain() { await Promise.all(pending.splice(0)); },
  };

  async function execute(job: any, payload: any) {
    await Promise.resolve();
    if (job.status === "cancelled") return;
    job.status = "running"; job.updatedAt = now();
    try { job.result = await handlers[job.type](payload); job.status = "completed"; }
    catch (error: any) { job.status = "failed"; job.error = error?.message || "Job failed"; }
    job.completedAt = now(); job.updatedAt = job.completedAt;
  }
  return service;
}

export const runDurableJobContract = { createInMemoryFixture };

function requireUserId(user: any) { const id = Number(user?.id); if (!Number.isInteger(id) || id <= 0) throw new Error("Not authenticated"); return id; }
