const DRAFT_STORAGE_PREFIX = "us-college-application-consultant-draft";

export function getDraftStorageKey(userId) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) throw new Error("A user id is required for draft storage");
  return `${DRAFT_STORAGE_PREFIX}:${normalizedUserId}`;
}

export function readUserDraft(storage, userId) {
  return storage.getItem(getDraftStorageKey(userId));
}

export function writeUserDraft(storage, userId, serializedDraft) {
  storage.setItem(getDraftStorageKey(userId), serializedDraft);
}

export function removeUserDraft(storage, userId) {
  storage.removeItem(getDraftStorageKey(userId));
}

export function removeLegacySharedDraft(storage) {
  storage.removeItem(DRAFT_STORAGE_PREFIX);
}
