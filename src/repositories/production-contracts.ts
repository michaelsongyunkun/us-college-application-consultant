export type UserId = number;

export interface ProductionRepositories {
  users: {
    create(input: Record<string, unknown>): Promise<any>;
    getById(id: UserId): Promise<any | null>;
    getByEmail(email: string): Promise<any | null>;
  };
  sessions: {
    create(input: Record<string, unknown>): Promise<any>;
    getByTokenHash(tokenHash: string): Promise<any | null>;
    deleteByTokenHash(tokenHash: string): Promise<void>;
  };
  profiles: {
    get(userId: UserId): Promise<any | null>;
    upsert(userId: UserId, profile: Record<string, unknown>): Promise<any>;
  };
  activities: {
    get(userId: UserId): Promise<any | null>;
    upsert(userId: UserId, portfolio: Record<string, unknown>): Promise<any>;
  };
  progress: {
    get(userId: UserId): Promise<any | null>;
    upsert(userId: UserId, planner: Record<string, unknown>): Promise<any>;
  };
  plans: {
    create(userId: UserId, input: Record<string, unknown>): Promise<any>;
    list(userId: UserId): Promise<any[]>;
    getOwned(userId: UserId, planId: number): Promise<any | null>;
    createSnapshot(userId: UserId, planId: number, input: Record<string, unknown>): Promise<any>;
    getSnapshotOwned(userId: UserId, planId: number, snapshotId: number): Promise<any | null>;
  };
  analytics: {
    recordUsage(input: Record<string, unknown>): Promise<any>;
    listByUser(userId: UserId): Promise<any[]>;
  };
  audit: {
    record(input: Record<string, unknown>): Promise<any>;
    listByActor(userId: UserId): Promise<any[]>;
  };
  transaction<T>(callback: (repositories: ProductionRepositories) => Promise<T>): Promise<T>;
}
