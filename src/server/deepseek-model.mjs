const DEEPSEEK_MODEL_ALIASES = new Map([
  ["deepseekv4pro", "deepseek-v4-pro"],
  ["deepseekv4flash", "deepseek-v4-flash"],
]);

export function normalizeDeepSeekModel(value, fallback = "deepseek-v4-pro") {
  const raw = String(value || fallback || "").trim();
  if (!raw) return "deepseek-v4-pro";
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return DEEPSEEK_MODEL_ALIASES.get(compact) || raw;
}
