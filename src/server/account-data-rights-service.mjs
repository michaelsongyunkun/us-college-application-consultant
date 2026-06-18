export function createAccountDataRightsService({
  auth,
  planning,
  activityPortfolio,
  progressPlanner,
} = {}) {
  function exportAccountData({ user, metadata = {} } = {}) {
    const exportData = auth.exportAccountData({
      user,
      planning: planning.exportUserData(user),
      portfolio: activityPortfolio.getPortfolio(user),
      progressPlanner: progressPlanner.getPlanner(user),
    });

    auth.recordAuditEvent({
      actor: user,
      action: "account.data_export",
      resourceType: "user_account",
      resourceId: user.id,
      metadata,
    });

    return exportData;
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

export function getAccountDeletionConfirmation(payload = {}) {
  return payload.confirmationEmail || payload.email || payload.confirmation;
}
