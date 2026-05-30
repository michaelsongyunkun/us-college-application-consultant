import { markdownToPlainText } from "../domain/agent-output-parser.mjs?v=20260530-markdown-field-cleanup";

export function collectProfileFromForm(profileForm) {
  return Object.fromEntries(new FormData(profileForm).entries());
}

export function collectPlanningProfileFromForm(profileForm) {
  const { schoolContext, identityDescription, ...planningProfile } = collectProfileFromForm(profileForm);
  return planningProfile;
}

export function collectActivitiesFromTable(activityTable) {
  return Array.from(activityTable.querySelectorAll("tbody tr")).map((row, index) => ({
    id: index + 1,
    type: cleanActivityField(row.querySelector(`[name="type-${index + 1}"]`).value),
    activityName: cleanActivityField(row.querySelector(`[name="name-${index + 1}"]`).value),
    executionDescription: cleanActivityField(row.querySelector(`[name="description-${index + 1}"]`).value),
    suggestedGrade: cleanActivityField(row.querySelector(`[name="grade-${index + 1}"]`).value),
  }));
}

function cleanActivityField(value) {
  return markdownToPlainText(value);
}

export function setNamedFieldValue(name, value, root = document) {
  const field = root.querySelector(`[name="${name}"]`);
  if (field) field.value = cleanActivityField(value);
}

export function fillActivityTable(activityTable, activities, { afterFill } = {}) {
  activities.slice(0, 10).forEach((activity, index) => {
    const rowNumber = index + 1;
    setNamedFieldValue(`type-${rowNumber}`, activity.type, activityTable);
    setNamedFieldValue(`name-${rowNumber}`, activity.activityName, activityTable);
    setNamedFieldValue(`description-${rowNumber}`, activity.executionDescription, activityTable);
    setNamedFieldValue(`grade-${rowNumber}`, activity.suggestedGrade, activityTable);
  });
  afterFill?.();
}

export function applyProfileFields(profileForm, profile = {}) {
  profileForm.reset();
  Object.entries(profile).forEach(([name, value]) => {
    const field = profileForm.querySelector(`[name="${name}"]`);
    if (field) field.value = value || "";
  });
}
