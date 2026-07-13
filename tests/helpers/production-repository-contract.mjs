import assert from "node:assert/strict";

export async function runProductionRepositoryContract(createFixture) {
  const fixture = await createFixture();
  const { repositories } = fixture;
  try {
    const alice = await repositories.users.create({
      email: "alice@example.com",
      name: "Alice",
      role: "user",
      passwordHash: "hash-alice",
    });
    const bob = await repositories.users.create({
      email: "bob@example.com",
      name: "Bob",
      role: "user",
      passwordHash: "hash-bob",
    });
    assert.equal((await repositories.users.getByEmail("ALICE@example.com")).id, alice.id);

    await repositories.sessions.create({
      userId: alice.id,
      tokenHash: "token-alice",
      csrfTokenHash: "csrf-alice",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal((await repositories.sessions.getByTokenHash("token-alice")).userId, alice.id);

    await repositories.profiles.upsert(alice.id, { grade: "11", majorDirection: "CS" });
    assert.deepEqual((await repositories.profiles.get(alice.id)).profile, {
      grade: "11",
      majorDirection: "CS",
    });
    assert.equal(await repositories.profiles.get(bob.id), null);

    await repositories.activities.upsert(alice.id, {
      activities: [{ activityName: "Robotics" }],
      competitions: [],
    });
    assert.equal((await repositories.activities.get(alice.id)).portfolio.activities[0].activityName, "Robotics");

    await repositories.progress.upsert(alice.id, {
      tasks: [{ id: "task-1", title: "Draft essay" }],
      checkIns: [],
    });
    assert.equal((await repositories.progress.get(alice.id)).planner.tasks[0].id, "task-1");

    const plan = await repositories.plans.create(alice.id, {
      name: "ED plan",
      draft: { target: "Example University" },
    });
    assert.equal((await repositories.plans.getOwned(alice.id, plan.id)).name, "ED plan");
    assert.equal(await repositories.plans.getOwned(bob.id, plan.id), null, "plans must be user-owned");

    const snapshot = await repositories.plans.createSnapshot(alice.id, plan.id, {
      note: "before review",
      snapshot: { profile: { grade: "11" }, draft: plan.draft },
    });
    assert.equal((await repositories.plans.getSnapshotOwned(alice.id, plan.id, snapshot.id)).note, "before review");
    assert.equal(await repositories.plans.getSnapshotOwned(bob.id, plan.id, snapshot.id), null);

    await repositories.analytics.recordUsage({
      userId: alice.id,
      userName: "Alice",
      userEmail: "alice@example.com",
      eventType: "export_word",
      details: { format: "docx" },
    });
    assert.equal((await repositories.analytics.listByUser(alice.id))[0].eventType, "export_word");
    assert.deepEqual((await repositories.analytics.listByUser(alice.id))[0].details, { format: "docx" });

    await repositories.audit.record({
      actorUserId: alice.id,
      actorUserName: "Alice",
      actorUserEmail: "alice@example.com",
      actorRole: "user",
      action: "plan.snapshot.create",
      resourceType: "planning_snapshot",
      resourceId: String(snapshot.id),
      details: { planId: plan.id },
    });
    assert.equal((await repositories.audit.listByActor(alice.id))[0].action, "plan.snapshot.create");

    await assert.rejects(
      repositories.transaction(async (tx) => {
        await tx.profiles.upsert(bob.id, { grade: "9" });
        throw new Error("rollback-contract");
      }),
      /rollback-contract/,
    );
    assert.equal(await repositories.profiles.get(bob.id), null, "transaction must roll back atomically");
  } finally {
    await fixture.close?.();
  }
}
