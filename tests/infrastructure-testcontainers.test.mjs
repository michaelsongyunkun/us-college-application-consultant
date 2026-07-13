import assert from "node:assert/strict";

if (process.env.RUN_INFRASTRUCTURE_TESTS !== "1") {
  console.log("Skipping Testcontainers infrastructure suite (set RUN_INFRASTRUCTURE_TESTS=1).");
} else {
  const [{ GenericContainer, Wait }, pgModule, aws] = await Promise.all([
    import("testcontainers"),
    import("pg"),
    import("@aws-sdk/client-s3"),
  ]);
  const { Pool } = pgModule.default || pgModule;
  const { CreateBucketCommand, S3Client } = aws;
  const [{ migratePostgres }, { createPostgresProductionRepositories }, { runProductionRepositoryContract }, bull, objectStoreModule, importModule, authDbModule, authModule, postgresAuthModule] = await Promise.all([
    import("../src/infrastructure/postgres.ts"),
    import("../src/repositories/postgres-production-repositories.ts"),
    import("./helpers/production-repository-contract.mjs"),
    import("../src/infrastructure/bullmq-job-service.ts"),
    import("../src/infrastructure/object-store.ts"),
    import("../src/infrastructure/sqlite-postgres-import.ts"),
    import("../src/server/auth-db.mjs"),
    import("../src/server/auth-service.mjs"),
    import("../src/server/postgres-auth-service.ts"),
  ]);

  const [postgres, redis, minio] = await Promise.all([
    new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({ POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres", POSTGRES_DB: "consultant" })
      .withExposedPorts(5432)
      // A fresh PostgreSQL image reports readiness once for its temporary init
      // server and again after the final server starts. Waiting for both avoids
      // opening the migration connection while the init server is shutting down.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(120_000)
      .start(),
    new GenericContainer("redis:7.4-alpine")
      .withCommand(["redis-server", "--appendonly", "yes", "--appendfsync", "always"])
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .withStartupTimeout(120_000)
      .start(),
    new GenericContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z")
      .withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
      .withCommand(["server", "/data", "--console-address", ":9001"])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
      .withStartupTimeout(120_000)
      .start(),
  ]);

  const databaseUrl = `postgresql://postgres:postgres@${postgres.getHost()}:${postgres.getMappedPort(5432)}/consultant`;
  const pool = new Pool({ connectionString: databaseUrl });
  let redisConnection;
  let jobService;
  let workerRuntime;
  try {
    await migratePostgres(pool);
    await runProductionRepositoryContract(async () => ({ repositories: createPostgresProductionRepositories({ pool }) }));

    const sourceDb = authDbModule.createAuthDatabase({ databasePath: ":memory:" });
    try {
      const sourceAuth = authModule.createAuthService({ authDb: sourceDb });
      const registered = sourceAuth.register({ email: "migration@example.com", name: "Migration User", password: "strongpass123" });
      sourceDb.db.prepare("INSERT INTO student_profiles (user_id,profile_json,created_at,updated_at) VALUES (?,?,?,?)").run(registered.user.id, JSON.stringify({ grade: "11" }), "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z");
      const migrationReport = await importModule.createSqliteToPostgresImporter({ sqlite: sourceDb.db, pool }).run({ dryRun: false, replace: true });
      assert.equal(migrationReport.validation.ok, true);
      assert.equal(migrationReport.source.rowCounts.users, migrationReport.target.rowCounts.users);
      assert.equal((await pool.query("SELECT profile_json->>'grade' AS grade FROM student_profiles")).rows[0].grade, "11");
      const postgresAuth = postgresAuthModule.createPostgresAuthService({ pool });
      const login = await postgresAuth.login({ email: "migration@example.com", password: "strongpass123" });
      assert.equal((await postgresAuth.getUserForSession(login.sessionToken)).email, "migration@example.com");
      assert.equal(await postgresAuth.verifyCsrfToken(login.sessionToken, login.csrfToken), true);
      await postgresAuth.logout(login.sessionToken);
      assert.equal(await postgresAuth.getUserForSession(login.sessionToken), null);
    } finally { sourceDb.close(); }

    const getRedisUrl = () => `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    redisConnection = bull.createRedisConnection(getRedisUrl());
    jobService = bull.createBullMqJobService({ queueName: "contract-jobs", connection: redisConnection });
    const sent = [];
    workerRuntime = bull.createBullMqWorker({
      queueName: "contract-jobs",
      connection: redisConnection,
      handlers: { email: async (payload) => { sent.push(payload.messageId); return { sent: true }; } },
    });
    const alice = { id: 1 };
    const first = await jobService.create(alice, "email", { messageId: "one" }, { idempotencyKey: "same-email" });
    const duplicate = await jobService.create(alice, "email", { messageId: "one" }, { idempotencyKey: "same-email" });
    assert.equal(first.id, duplicate.id);
    await waitFor(async () => (await jobService.get(alice, first.id))?.status === "completed");
    assert.deepEqual(sent, ["one"]);
    await workerRuntime.close(); workerRuntime = null;
    await jobService.close(); jobService = null;
    await redisConnection.quit(); redisConnection = null;
    await redis.restart({ timeout: 30_000 });
    // Testcontainers refreshes bound ports after a restart, so do not reuse the
    // pre-restart URL when Docker assigns a different random host port.
    redisConnection = bull.createRedisConnection(getRedisUrl());
    jobService = bull.createBullMqJobService({ queueName: "contract-jobs", connection: redisConnection });
    assert.equal((await jobService.get(alice, first.id)).status, "completed", "job state must survive Redis restart");

    const s3 = new S3Client({
      endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
    });
    await s3.send(new CreateBucketCommand({ Bucket: "consultant-exports" }));
    const store = objectStoreModule.createS3ObjectStore({ bucket: "consultant-exports", client: s3 });
    await store.put({ userId: 1, key: "exports/report.doc", body: "report", contentType: "application/msword" });
    await assert.rejects(() => store.get({ userId: 2, key: "exports/report.doc" }), /not found/i);
    const signed = await store.getSignedDownloadUrl({ userId: 1, key: "exports/report.doc", expiresInSeconds: 60 });
    assert.equal(await (await fetch(signed.url)).text(), "report");
  } finally {
    await workerRuntime?.close();
    await jobService?.close();
    await redisConnection?.quit();
    await pool.end();
    await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
  }
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for infrastructure condition.");
}
