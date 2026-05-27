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
    type: row.querySelector(`[name="type-${index + 1}"]`).value,
    activityName: row.querySelector(`[name="name-${index + 1}"]`).value,
    executionDescription: row.querySelector(`[name="description-${index + 1}"]`).value,
    suggestedGrade: row.querySelector(`[name="grade-${index + 1}"]`).value,
  }));
}

export function setNamedFieldValue(name, value, root = document) {
  const field = root.querySelector(`[name="${name}"]`);
  if (field) field.value = value || "";
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
  Object.entries(profile).forEach(([name, value]) => setNamedFieldValue(name, value, profileForm));
}
