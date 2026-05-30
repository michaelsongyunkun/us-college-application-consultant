import assert from "node:assert/strict";
import { clearDraftFields } from "../src/client/draft-state.mjs";

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
const codexTaskPackage = { value: "task package" };
const codexAnswerInput = { value: "codex answer" };
const snapshotNote = { value: "3152482377@qq.com" };

clearDraftFields({
  profileForm,
  activityTable,
  rawAnswer,
  narrativeOutput,
  codexTaskPackage,
  codexAnswerInput,
  snapshotNote,
});

assert.equal(profileForm.resetCalled, true);
assert.deepEqual(fields.map((field) => field.value), ["", ""]);
assert.equal(rawAnswer.value, "");
assert.equal(narrativeOutput.value, "");
assert.equal(codexTaskPackage.value, "");
assert.equal(codexAnswerInput.value, "");
assert.equal(snapshotNote.value, "");
