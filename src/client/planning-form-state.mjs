import {
  PLANNING_ACTIVITY_COUNT,
  markdownToPlainText,
} from "../domain/agent-output-parser.mjs?v=20260531-narrative-cleanup";

const PROFILE_CHOICE_SEPARATOR = "；";

export function combineProfileChoiceValues(choice = "", custom = "") {
  return [...normalizeChoiceValues(choice), custom]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(PROFILE_CHOICE_SEPARATOR);
}

export function formatProfileChoiceSummary(choice = "", custom = "") {
  return combineProfileChoiceValues(choice, custom) || "请选择（可多选）";
}

export function splitProfileChoiceValue(value = "", choices = []) {
  const text = String(value || "").trim();
  const normalizedChoices = choices.map((choice) => String(choice || "").trim()).filter(Boolean);
  const parts = text.split(PROFILE_CHOICE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  const selectedChoices = normalizedChoices.filter((option) => parts.includes(option));
  if (!selectedChoices.length) return { choice: "", custom: text };
  const custom = parts.filter((part) => !selectedChoices.includes(part)).join(PROFILE_CHOICE_SEPARATOR);
  const result = {
    choice: selectedChoices[0],
    custom,
  };
  if (selectedChoices.length > 1) result.choices = selectedChoices;
  return result;
}

function normalizeChoiceValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof NodeList !== "undefined" && value instanceof NodeList) return Array.from(value);
  if (typeof HTMLCollection !== "undefined" && value instanceof HTMLCollection) return Array.from(value);
  return [value];
}

function collectChoiceValues(fieldset) {
  return Array.from(fieldset.querySelectorAll("[data-profile-choice-input]")).flatMap((input) => {
    if (input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type)) {
      return input.checked ? [input.value] : [];
    }
    if (input instanceof HTMLSelectElement && input.multiple) {
      return Array.from(input.selectedOptions, (option) => option.value);
    }
    return input.value ? [input.value] : [];
  });
}

function getAvailableChoiceValues(fieldset) {
  return Array.from(fieldset.querySelectorAll("[data-profile-choice-input]")).flatMap((input) => {
    if (input instanceof HTMLSelectElement) {
      return Array.from(input.querySelectorAll("option"), (option) => option.value).filter(Boolean);
    }
    return input.value ? [input.value] : [];
  });
}

function setChoiceValues(fieldset, selectedChoices) {
  Array.from(fieldset.querySelectorAll("[data-profile-choice-input]")).forEach((input) => {
    if (input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type)) {
      input.checked = selectedChoices.includes(input.value);
      return;
    }
    if (input instanceof HTMLSelectElement && input.multiple) {
      Array.from(input.options).forEach((option) => {
        option.selected = selectedChoices.includes(option.value);
      });
      return;
    }
    input.value = selectedChoices[0] || "";
  });
}

export function collectProfileFromForm(profileForm) {
  syncProfileCompositeFields(profileForm);
  const profile = Object.fromEntries(new FormData(profileForm).entries());
  getProfileCompositeFieldsets(profileForm).forEach((fieldset) => {
    fieldset.querySelectorAll("[data-profile-choice-input], [data-profile-custom-input]").forEach((input) => {
      if (input?.name) delete profile[input.name];
    });
  });
  return profile;
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
  activities.slice(0, PLANNING_ACTIVITY_COUNT).forEach((activity, index) => {
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
    if (hydrateProfileCompositeField(profileForm, name, value)) return;
    const field = profileForm.querySelector(`[name="${name}"]`);
    if (field) field.value = value || "";
  });
  syncProfileCompositeFields(profileForm);
}

export function syncProfileCompositeFields(profileForm) {
  getProfileCompositeFieldsets(profileForm).forEach((fieldset) => {
    const fieldName = fieldset.dataset.profileComposite;
    const output = fieldset.querySelector(`[data-profile-composite-output="${fieldName}"]`);
    const customInput = fieldset.querySelector("[data-profile-custom-input]");
    const selectedChoices = collectChoiceValues(fieldset);
    const summaryText = formatProfileChoiceSummary(selectedChoices, customInput?.value);
    if (output) output.value = combineProfileChoiceValues(selectedChoices, customInput?.value);
    const summary = fieldset.querySelector("[data-profile-choice-summary]");
    if (summary) {
      summary.textContent = summaryText;
      summary.title = summaryText;
    }
  });
}

function hydrateProfileCompositeField(profileForm, name, value) {
  const fieldset = profileForm.querySelector(`[data-profile-composite="${name}"]`);
  if (!fieldset) return false;
  const customInput = fieldset.querySelector("[data-profile-custom-input]");
  const splitValue = splitProfileChoiceValue(value, getAvailableChoiceValues(fieldset));
  setChoiceValues(fieldset, splitValue.choices || (splitValue.choice ? [splitValue.choice] : []));
  if (customInput) customInput.value = splitValue.custom;
  syncProfileCompositeFields(profileForm);
  return true;
}

function getProfileCompositeFieldsets(profileForm) {
  return Array.from(profileForm?.querySelectorAll?.("[data-profile-composite]") || []);
}
