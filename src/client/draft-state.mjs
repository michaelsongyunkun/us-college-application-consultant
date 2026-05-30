export function clearDraftFields({
  profileForm,
  activityTable,
  rawAnswer,
  narrativeOutput,
  codexTaskPackage,
  codexAnswerInput,
  snapshotNote,
}) {
  profileForm?.reset();
  activityTable?.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  if (rawAnswer) rawAnswer.value = "";
  if (narrativeOutput) narrativeOutput.value = "";
  if (codexTaskPackage) codexTaskPackage.value = "";
  if (codexAnswerInput) codexAnswerInput.value = "";
  if (snapshotNote) snapshotNote.value = "";
}
