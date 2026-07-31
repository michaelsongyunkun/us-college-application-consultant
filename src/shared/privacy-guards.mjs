const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const sensitiveDraftKeys = new Set([
  "apiKey",
  "deepSeekApiKey",
  "deepseekApiKey",
  "openAiApiKey",
  "openaiApiKey",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "INSPIRATION_API_KEY",
]);

export function normalizeSnapshotNote(value) {
  const note = String(value ?? "").trim();
  if (emailAddressPattern.test(note)) return "";
  return note;
}

export function stripSensitiveDraftFields(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !sensitiveDraftKeys.has(key)),
  );
}
