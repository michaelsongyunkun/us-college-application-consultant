export function createAccountDataRightsService({
  auth,
  planning,
  activityPortfolio,
  progressPlanner,
} = {}) {
  function exportAccountData({ user, metadata = {} } = {}) {
    return resolveMaybeAll([
      planning.exportUserData(user),
      activityPortfolio.getPortfolio(user),
      progressPlanner.getPlanner(user),
    ], ([planningData, portfolio, progressData]) => {
      const exportData = auth.exportAccountData({ user, planning: planningData, portfolio, progressPlanner: progressData });
      return chainMaybe(exportData, (resolvedExport) => chainMaybe(auth.recordAuditEvent({
        actor: user, action: "account.data_export", resourceType: "user_account", resourceId: user.id, metadata,
      }), () => resolvedExport));
    });
  }

  function deleteAccount({ user, payload = {}, metadata = {} } = {}) {
    return auth.deleteAccount({
      user,
      confirmation: getAccountDeletionConfirmation(payload),
      metadata,
    });
  }

  return { exportAccountData, deleteAccount };
}

function chainMaybe(value, callback) { return value && typeof value.then === "function" ? value.then(callback) : callback(value); }
function resolveMaybeAll(values, callback) { return values.some((value) => value && typeof value.then === "function") ? Promise.all(values).then(callback) : callback(values); }

export function getAccountDeletionConfirmation(payload = {}) {
  return payload.confirmationEmail || payload.email || payload.confirmation;
}
