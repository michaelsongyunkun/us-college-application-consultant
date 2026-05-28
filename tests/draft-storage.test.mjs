import assert from "node:assert/strict";
import {
  getDraftStorageKey,
  readUserDraft,
  removeLegacySharedDraft,
  removeUserDraft,
  writeUserDraft,
} from "../src/client/draft-storage.mjs";

const values = new Map();
const storage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, value);
  },
  removeItem(key) {
    values.delete(key);
  },
};

assert.notEqual(getDraftStorageKey(1), getDraftStorageKey(2));

writeUserDraft(storage, 1, JSON.stringify({ student: "A" }));
writeUserDraft(storage, 2, JSON.stringify({ student: "B" }));
values.set("us-college-application-consultant-draft", JSON.stringify({ student: "legacy" }));

assert.equal(readUserDraft(storage, 1), JSON.stringify({ student: "A" }));
assert.equal(readUserDraft(storage, 2), JSON.stringify({ student: "B" }));

removeLegacySharedDraft(storage);
assert.equal(values.has("us-college-application-consultant-draft"), false);

removeUserDraft(storage, 1);
assert.equal(readUserDraft(storage, 1), null);
assert.equal(readUserDraft(storage, 2), JSON.stringify({ student: "B" }));
