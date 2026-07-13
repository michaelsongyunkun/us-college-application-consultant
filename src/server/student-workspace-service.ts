import { StudentProfileSchema, UsageEventSchema } from "../contracts/schemas.js";
import type { AuthenticatedUser, StudentWorkspaceRepositories } from "../repositories/contracts.js";

interface WorkspaceRequest {
  method?: string;
  path: string;
  user: AuthenticatedUser;
  readJson: () => Promise<any>;
  metadata: Record<string, unknown>;
}

interface WorkspaceResponse { statusCode: number; body: unknown }

export function createStudentWorkspaceService({ repositories }: { repositories: StudentWorkspaceRepositories }) {
  async function handle(request: WorkspaceRequest): Promise<WorkspaceResponse | null> {
    const { method, path, user } = request;
    if (method === "GET" && path === "/api/student-profile") return ok(await repositories.profiles.get(user));
    if (method === "PUT" && path === "/api/student-profile") {
      const payload = await request.readJson();
      return ok(await repositories.profiles.save(user, StudentProfileSchema.parse(payload.profile || {})));
    }
    if (method === "GET" && path === "/api/my-activities") return ok(await repositories.activities.get(user));
    if (method === "PUT" && path === "/api/my-activities") return ok(await repositories.activities.save(user, await request.readJson()));
    if (method === "GET" && path === "/api/my-activities/import-sources") return ok({ sources: await repositories.activities.listImportSources(user) });
    if (method === "GET" && path === "/api/progress-planner") return ok(await repositories.progress.get(user));
    if (method === "PUT" && path === "/api/progress-planner") return ok(await repositories.progress.save(user, await request.readJson()));
    if (method === "GET" && path === "/api/plans") return ok({ plans: await repositories.plans.list(user) });
    if (method === "POST" && path === "/api/plans") return created({ plan: await repositories.plans.create(user, await request.readJson()) });

    const snapshot = path.match(/^\/api\/plans\/(\d+)\/snapshots\/(\d+)$/);
    if (method === "DELETE" && snapshot) {
      const body = await repositories.plans.deleteSnapshot(user, snapshot[1], snapshot[2]);
      await audit(request, "plan.snapshot.delete", "planning_snapshot", snapshot[2], { planId: snapshot[1] });
      return ok(body);
    }
    const restore = path.match(/^\/api\/plans\/(\d+)\/snapshots\/(\d+)\/restore$/);
    if (method === "POST" && restore) {
      await request.readJson();
      const body = await repositories.plans.restoreSnapshot(user, restore[1], restore[2]);
      await audit(request, "plan.snapshot.restore", "planning_snapshot", restore[2], { planId: restore[1] });
      return ok(body);
    }
    const snapshots = path.match(/^\/api\/plans\/(\d+)\/snapshots$/);
    if (method === "GET" && snapshots) return ok({ snapshots: await repositories.plans.listSnapshots(user, snapshots[1]) });
    if (method === "POST" && snapshots) return created({ snapshot: await repositories.plans.createSnapshot(user, snapshots[1], await request.readJson()) });

    const plan = path.match(/^\/api\/plans\/(\d+)$/);
    if (method === "GET" && plan) return ok({ plan: await repositories.plans.get(user, plan[1]) });
    if (method === "PUT" && plan) return ok({ plan: await repositories.plans.save(user, plan[1], await request.readJson()) });
    if (method === "DELETE" && plan) {
      const body = await repositories.plans.delete(user, plan[1]);
      await audit(request, "plan.delete", "planning_project", plan[1]);
      return ok(body);
    }
    if (method === "POST" && path === "/api/analytics/usage-event") {
      await repositories.analytics.record(user, UsageEventSchema.parse(await request.readJson()), request.metadata);
      return ok({ ok: true });
    }
    return null;
  }

  async function audit(request: WorkspaceRequest, action: string, resourceType: string, resourceId: string, details?: Record<string, unknown>) {
    await repositories.analytics.audit({ actor: request.user, action, resourceType, resourceId, ...(details ? { details } : {}), metadata: request.metadata });
  }

  return { handle };
}

export function isStudentWorkspaceRoute(path: string): boolean {
  return path === "/api/student-profile"
    || path === "/api/my-activities"
    || path === "/api/my-activities/import-sources"
    || path === "/api/progress-planner"
    || path === "/api/plans"
    || path === "/api/analytics/usage-event"
    || /^\/api\/plans\/\d+(?:\/snapshots(?:\/\d+(?:\/restore)?)?)?$/.test(path);
}

const ok = (body: unknown): WorkspaceResponse => ({ statusCode: 200, body });
const created = (body: unknown): WorkspaceResponse => ({ statusCode: 201, body });
