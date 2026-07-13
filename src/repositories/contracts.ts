import type { StudentProfile, UsageEvent } from "../contracts/schemas.js";

export interface AuthenticatedUser { id: number; name?: string; email?: string; role?: string }

export interface StudentProfileRepository {
  get(user: AuthenticatedUser): unknown;
  save(user: AuthenticatedUser, profile: StudentProfile): unknown;
}

export interface ActivityPortfolioRepository {
  get(user: AuthenticatedUser): unknown;
  save(user: AuthenticatedUser, payload: unknown): unknown;
  listImportSources(user: AuthenticatedUser): unknown[];
}

export interface ProgressPlannerRepository {
  get(user: AuthenticatedUser): unknown;
  save(user: AuthenticatedUser, payload: unknown): unknown;
}

export interface PlanningVersionRepository {
  list(user: AuthenticatedUser): unknown[];
  create(user: AuthenticatedUser, payload: unknown): unknown;
  get(user: AuthenticatedUser, planId: string): unknown;
  save(user: AuthenticatedUser, planId: string, payload: unknown): unknown;
  delete(user: AuthenticatedUser, planId: string): unknown;
  listSnapshots(user: AuthenticatedUser, planId: string): unknown[];
  createSnapshot(user: AuthenticatedUser, planId: string, payload: unknown): unknown;
  deleteSnapshot(user: AuthenticatedUser, planId: string, snapshotId: string): unknown;
  restoreSnapshot(user: AuthenticatedUser, planId: string, snapshotId: string): unknown;
}

export interface AnalyticsRepository {
  record(user: AuthenticatedUser, event: UsageEvent, metadata: Record<string, unknown>): void;
  audit(input: Record<string, unknown>): void;
}

export interface StudentWorkspaceRepositories {
  profiles: StudentProfileRepository;
  activities: ActivityPortfolioRepository;
  progress: ProgressPlannerRepository;
  plans: PlanningVersionRepository;
  analytics: AnalyticsRepository;
}
