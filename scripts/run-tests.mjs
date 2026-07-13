import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = "tests";
const testFiles = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => join(testDir, file));

for (const testFile of testFiles) {
  console.log(`\n> node --import tsx ${testFile}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", testFile], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Test process failed", {
      testFile,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || "",
    });
    process.exit(result.status ?? 1);
  }
}
