export function clearDraftFields({
  profileForm,
  activityTable,
  rawAnswer,
  narrativeOutput,
  futureLearningOutput,
  codexTaskPackage,
  codexAnswerInput,
}) {
  profileForm?.reset();
  activityTable?.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  if (rawAnswer) rawAnswer.value = "";
  if (narrativeOutput) narrativeOutput.value = "";
  if (futureLearningOutput) futureLearningOutput.value = "";
  if (codexTaskPackage) codexTaskPackage.value = "";
  if (codexAnswerInput) codexAnswerInput.value = "";
}
