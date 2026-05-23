import assert from "node:assert/strict";
import { clearDraftFields } from "../draft-state.mjs";

const fields = [
  { value: "activity type" },
  { value: "activity description" },
];
const profileForm = {
  resetCalled: false,
  reset() {
    this.resetCalled = true;
  },
};
const activityTable = {
  querySelectorAll(selector) {
    assert.equal(selector, "input, textarea");
    return fields;
  },
};
const rawAnswer = { value: "raw" };
const narrativeOutput = { value: "narrative" };
const futureLearningOutput = { value: "future learning" };
const codexTaskPackage = { value: "task package" };
const codexAnswerInput = { value: "codex answer" };

clearDraftFields({
  profileForm,
  activityTable,
  rawAnswer,
  narrativeOutput,
  futureLearningOutput,
  codexTaskPackage,
  codexAnswerInput,
});

assert.equal(profileForm.resetCalled, true);
assert.deepEqual(fields.map((field) => field.value), ["", ""]);
assert.equal(rawAnswer.value, "");
assert.equal(narrativeOutput.value, "");
assert.equal(futureLearningOutput.value, "");
assert.equal(codexTaskPackage.value, "");
assert.equal(codexAnswerInput.value, "");
