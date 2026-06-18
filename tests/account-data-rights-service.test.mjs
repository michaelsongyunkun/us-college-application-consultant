import assert from "node:assert/strict";
import {
  createAccountDataRightsService,
  getAccountDeletionConfirmation,
} from "../src/server/account-data-rights-service.mjs";

const user = { id: 7, email: "student@example.com" };
const calls = [];
const service = createAccountDataRightsService({
  auth: {
    exportAccountData(payload) {
      calls.push(["auth.exportAccountData", payload]);
      return {
        account: { email: payload.user.email },
        planning: payload.planning,
        portfolio: payload.portfolio,
        progressPlanner: payload.progressPlanner,
      };
    },
    recordAuditEvent(event) {
      calls.push(["auth.recordAuditEvent", event]);
    },
    deleteAccount(payload) {
      calls.push(["auth.deleteAccount", payload]);
      return { ok: true, deletedAt: "2026-06-18T00:00:00.000Z" };
    },
  },
  planning: {
    exportUserData(targetUser) {
      calls.push(["planning.exportUserData", targetUser]);
      return { profile: { grade: "11" }, plans: [] };
    },
  },
  activityPortfolio: {
    getPortfolio(targetUser) {
      calls.push(["activityPortfolio.getPortfolio", targetUser]);
      return { activities: [{ activityName: "Robotics Lab" }] };
    },
  },
  progressPlanner: {
    getPlanner(targetUser) {
      calls.push(["progressPlanner.getPlanner", targetUser]);
      return { tasks: [{ title: "Prepare recommendation packet" }] };
    },
  },
});

const metadata = { ipAddress: "127.0.0.1", userAgent: "node-test" };
const exportData = service.exportAccountData({ user, metadata });
assert.deepEqual(exportData, {
  account: { email: "student@example.com" },
  planning: { profile: { grade: "11" }, plans: [] },
  portfolio: { activities: [{ activityName: "Robotics Lab" }] },
  progressPlanner: { tasks: [{ title: "Prepare recommendation packet" }] },
});
assert.deepEqual(calls.slice(0, 5), [
  ["planning.exportUserData", user],
  ["activityPortfolio.getPortfolio", user],
  ["progressPlanner.getPlanner", user],
  [
    "auth.exportAccountData",
    {
      user,
      planning: { profile: { grade: "11" }, plans: [] },
      portfolio: { activities: [{ activityName: "Robotics Lab" }] },
      progressPlanner: { tasks: [{ title: "Prepare recommendation packet" }] },
    },
  ],
  [
    "auth.recordAuditEvent",
    {
      actor: user,
      action: "account.data_export",
      resourceType: "user_account",
      resourceId: 7,
      metadata,
    },
  ],
]);

assert.deepEqual(
  service.deleteAccount({
    user,
    payload: { confirmationEmail: "student@example.com" },
    metadata,
  }),
  { ok: true, deletedAt: "2026-06-18T00:00:00.000Z" },
);
assert.deepEqual(calls.at(-1), [
  "auth.deleteAccount",
  {
    user,
    confirmation: "student@example.com",
    metadata,
  },
]);

assert.equal(getAccountDeletionConfirmation({ confirmationEmail: "a@example.com" }), "a@example.com");
assert.equal(getAccountDeletionConfirmation({ email: "b@example.com" }), "b@example.com");
assert.equal(getAccountDeletionConfirmation({ confirmation: "c@example.com" }), "c@example.com");
assert.equal(getAccountDeletionConfirmation({}), undefined);
