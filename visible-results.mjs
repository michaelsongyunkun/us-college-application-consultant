export const DEFAULT_VISIBLE_RESULT_LIMIT = 24;

export function getVisibleResultPage(items, limit = DEFAULT_VISIBLE_RESULT_LIMIT) {
  const visibleItems = items.slice(0, Math.max(0, limit));
  return {
    visibleItems,
    shownCount: visibleItems.length,
    totalCount: items.length,
    hasMore: visibleItems.length < items.length,
  };
}

export function expandVisibleResultLimit(currentLimit, totalCount, step = DEFAULT_VISIBLE_RESULT_LIMIT) {
  return Math.min(currentLimit + step, totalCount);
}
