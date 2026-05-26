import assert from "node:assert/strict";
import {
  DEFAULT_VISIBLE_RESULT_LIMIT,
  expandVisibleResultLimit,
  getVisibleResultPage,
} from "../visible-results.mjs";

const items = Array.from({ length: 60 }, (_, index) => index + 1);
const initial = getVisibleResultPage(items);

assert.equal(initial.shownCount, DEFAULT_VISIBLE_RESULT_LIMIT);
assert.equal(initial.totalCount, 60);
assert.deepEqual(initial.visibleItems, items.slice(0, DEFAULT_VISIBLE_RESULT_LIMIT));
assert.equal(initial.hasMore, true);

const expandedLimit = expandVisibleResultLimit(DEFAULT_VISIBLE_RESULT_LIMIT, items.length);
const expanded = getVisibleResultPage(items, expandedLimit);

assert.equal(expanded.shownCount, 48);
assert.equal(expanded.hasMore, true);
assert.equal(expandVisibleResultLimit(expandedLimit, 30), 30);
assert.equal(getVisibleResultPage(items, items.length).hasMore, false);
