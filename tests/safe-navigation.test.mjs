import assert from "node:assert/strict";

const handlers = {};
let safeNavClickHandler = null;
let nextTimerId = 1;
const timerCallbacks = new Map();
let disabled = false;
let loading = false;
let preventDefaultCount = 0;
let setDisabledCount = 0;

const safeNavLink = {
  getAttribute(name) {
    return name === "href" ? "./ask-deepseek.html" : "";
  },
  setAttribute(name) {
    if (name !== "aria-disabled") return;
    disabled = true;
    setDisabledCount += 1;
  },
  removeAttribute(name) {
    if (name === "aria-disabled") disabled = false;
  },
  classList: {
    add(className) {
      if (className === "is-loading") loading = true;
    },
    remove(className) {
      if (className === "is-loading") loading = false;
    },
  },
  addEventListener(type, handler) {
    if (type === "click") safeNavClickHandler = handler;
  },
};

globalThis.Element = class Element {};
globalThis.document = {
  hidden: false,
  querySelectorAll(selector) {
    if (selector === "[data-safe-nav]") return [safeNavLink];
    if (selector === ".command-sidebar") return [];
    return [];
  },
  addEventListener(type, handler) {
    handlers[type] = handler;
  },
};
globalThis.window = {
  location: { href: "https://example.test/my-activities.html" },
  addEventListener(type, handler) {
    handlers[type] = handler;
  },
  setTimeout(handler) {
    const timerId = nextTimerId;
    nextTimerId += 1;
    timerCallbacks.set(timerId, handler);
    return timerId;
  },
  clearTimeout(timerId) {
    timerCallbacks.delete(timerId);
  },
};

await import(`../src/client/safe-navigation.mjs?test=${Date.now()}`);

assert.equal(typeof safeNavClickHandler, "function", "Safe navigation should bind safe-nav link clicks.");

const clickEvent = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault() {
    preventDefaultCount += 1;
  },
};

safeNavClickHandler(clickEvent);
assert.equal(preventDefaultCount, 1);
assert.equal(window.location.href, "https://example.test/ask-deepseek.html");
assert.equal(disabled, true);
assert.equal(loading, true);
const firstUnlockCallback = timerCallbacks.get(1);

safeNavClickHandler(clickEvent);
assert.equal(setDisabledCount, 1, "A locked navigation should ignore repeated clicks.");

firstUnlockCallback();
assert.equal(disabled, false, "Cancelled page exits should unlock safe navigation links.");
assert.equal(loading, false, "Cancelled page exits should remove loading affordance.");

safeNavClickHandler(clickEvent);
assert.equal(setDisabledCount, 2, "Links should be clickable again after the unlock fallback.");

handlers.focus();
safeNavClickHandler(clickEvent);
assert.equal(setDisabledCount, 3, "A focus reset should allow another navigation attempt.");
const staleUnlockCallback = timerCallbacks.get(3);
handlers.focus();
safeNavClickHandler(clickEvent);
assert.equal(setDisabledCount, 4, "A second focus reset should allow a fresh navigation attempt.");

staleUnlockCallback();
assert.equal(disabled, true, "A stale unlock callback should not release a newer navigation lock.");
assert.equal(loading, true, "A stale unlock callback should not remove a newer loading affordance.");

timerCallbacks.get(4)();
assert.equal(disabled, false, "The active unlock callback should release the current navigation lock.");
assert.equal(loading, false, "The active unlock callback should clear the current loading affordance.");
