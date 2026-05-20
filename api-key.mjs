export function resolveApiKey({ environmentApiKey, requestApiKey } = {}) {
  const fromRequest = String(requestApiKey || "").trim();
  if (fromRequest) return fromRequest;
  return String(environmentApiKey || "").trim();
}

export function hasAnyApiKey({ environmentApiKey, requestApiKey } = {}) {
  return Boolean(resolveApiKey({ environmentApiKey, requestApiKey }));
}
