export function createProductionJobHandlers({ deepSeekPlan, deepSeekRag, schoolSelection, capabilityAssessment, wordExport, mailer }) {
  return {
    "ai.deepseek-plan": async (payload, { signal } = {}) => deepSeekPlan.generatePlan({ ...payload, signal }),
    "ai.deepseek-rag": async (payload, { signal } = {}) => deepSeekRag.answerQuestion({ ...payload, signal }),
    "ai.school-selection": async (payload, { signal } = {}) => schoolSelection.generateSelection({ ...payload, signal }),
    "ai.capability-assessment": async (payload, { signal } = {}) => capabilityAssessment.generateAssessment({ ...payload, signal }),
    "export.word": async (payload, context) => wordExport.generateAndStore(payload, context),
    "email.password-reset": async (payload) => {
      await mailer.sendPasswordResetEmail(payload);
      return { sent: true, messageId: payload.messageId || null };
    },
  };
}
