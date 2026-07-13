import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateOpenApiDocument } from "../src/contracts/openapi.js";

const target = resolve("docs/openapi.json");
const output = `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== output) {
    console.error("docs/openapi.json is stale. Run npm run openapi:generate.");
    process.exit(1);
  }
  console.log("OpenAPI document is current.");
} else {
  await writeFile(target, output, "utf8");
  console.log(`Generated ${target}`);
}
