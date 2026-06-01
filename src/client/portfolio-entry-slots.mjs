export function hasAnyPortfolioValue(entry) {
  if (!entry || typeof entry !== "object") return false;
  return Object.values(entry).some((value) => String(value || "").trim());
}

export function trimTrailingEmptySlots(entries = []) {
  const result = entries.slice();
  while (result.length > 0 && !hasAnyPortfolioValue(result[result.length - 1])) {
    result.pop();
  }
  return result;
}

export function insertEntryIntoFirstEmptySlot(entries = [], entry = {}, limit = entries.length) {
  const slots = Array.from({ length: limit }, (_, index) => ({ ...(entries[index] || {}) }));
  const emptyIndex = slots.findIndex((slot) => !hasAnyPortfolioValue(slot));

  if (emptyIndex === -1) {
    return {
      entries: slots,
      index: -1,
      inserted: false,
    };
  }

  slots[emptyIndex] = { ...entry };
  return {
    entries: trimTrailingEmptySlots(slots),
    index: emptyIndex,
    inserted: true,
  };
}
