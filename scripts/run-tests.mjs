import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = "tests";
const testFiles = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => join(testDir, file));

for (const testFile of testFiles) {
  console.log(`\n> node ${testFile}`);
  const result = spawnSync(process.execPath, [testFile], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
