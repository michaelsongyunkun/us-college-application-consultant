import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return /\.(mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

const files = ["server.mjs", ...collectJavaScriptFiles("src"), ...collectJavaScriptFiles("scripts")].sort();

for (const file of files) {
  console.log(`\n> node --check ${file}`);
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
