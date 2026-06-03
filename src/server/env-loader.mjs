import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(filePath, { env = process.env } = {}) {
  if (!existsSync(filePath)) {
    return { loaded: false, keys: [] };
  }

  const keys = [];
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (String(env[key] || "").trim()) continue;

    env[key] = normalizeEnvValue(normalizedLine.slice(separatorIndex + 1).trim());
    keys.push(key);
  }

  return { loaded: true, keys };
}

function normalizeEnvValue(value) {
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    const unquoted = value.slice(1, -1);
    return quote === "\"" ? unquoted.replace(/\\n/g, "\n").replace(/\\"/g, "\"") : unquoted;
  }
  const hashIndex = value.search(/\s#/);
  return (hashIndex >= 0 ? value.slice(0, hashIndex) : value).trim();
}
