import assert from "node:assert/strict";
import { insertEntryIntoFirstEmptySlot } from "../src/client/portfolio-entry-slots.mjs";

const importedActivity = {
  activityName: "AI 教育公益研究",
  type: "公益",
  status: "计划中",
};

const withDeletedMiddleActivity = [
  { activityName: "社区科普社", type: "公益" },
  {},
  { activityName: "校队辩论", type: "社团" },
];

const inserted = insertEntryIntoFirstEmptySlot(
  withDeletedMiddleActivity,
  importedActivity,
  10,
);

assert.equal(inserted.inserted, true, "Import should succeed when an empty activity slot exists.");
assert.equal(inserted.index, 1, "Import should fill the first empty visible activity slot.");
assert.equal(inserted.entries[0].activityName, "社区科普社");
assert.equal(inserted.entries[1].activityName, "AI 教育公益研究");
assert.equal(inserted.entries[2].activityName, "校队辩论", "Existing following activities should not shift forward.");
assert.equal(inserted.entries.length, 3, "Trailing empty slots should not be persisted in the view model.");

const fullSlots = Array.from({ length: 10 }, (_, index) => ({
  activityName: `Activity ${index + 1}`,
}));
const rejected = insertEntryIntoFirstEmptySlot(fullSlots, importedActivity, 10);

assert.equal(rejected.inserted, false, "Import should be rejected when all activity slots are filled.");
assert.equal(rejected.index, -1);
assert.deepEqual(rejected.entries, fullSlots);
