import assert from "node:assert/strict";
import { runDurableJobContract } from "../src/infrastructure/job-contract.ts";

const calls = [];
const service = runDurableJobContract.createInMemoryFixture({
  handlers: {
    email: async (payload) => {
      calls.push(payload.messageId);
      return { sent: true };
    },
  },
});

const alice = { id: 1 };
const bob = { id: 2 };
const first = await service.create(alice, "email", { messageId: "m-1" }, { idempotencyKey: "welcome-1" });
const duplicate = await service.create(alice, "email", { messageId: "m-1" }, { idempotencyKey: "welcome-1" });
assert.equal(duplicate.id, first.id);
await service.drain();
assert.deepEqual(calls, ["m-1"]);
assert.equal((await service.get(alice, first.id)).status, "completed");
assert.equal(await service.get(bob, first.id), null);

const cancellable = await service.create(alice, "email", { messageId: "m-2" }, { idempotencyKey: "cancel-1", defer: true });
assert.equal((await service.cancel(alice, cancellable.id)).status, "cancelled");
assert.equal((await service.get(alice, cancellable.id)).status, "cancelled");
