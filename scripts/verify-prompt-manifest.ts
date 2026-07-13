import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const ManifestSchema = z.object({
  manifestVersion: z.string(),
  prompts: z.array(z.object({
    id: z.string(), version: z.string(), path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    models: z.array(z.string()).min(1), schema: z.string(), enabled: z.boolean(),
  })).min(1),
  environments: z.record(z.string(), z.object({ active: z.string(), rollback: z.string().nullable() })),
});

const manifest = ManifestSchema.parse(JSON.parse(await readFile("prompts/manifest.json", "utf8")));
for (const prompt of manifest.prompts) {
  const content = await readFile(prompt.path);
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== prompt.sha256) throw new Error(`Prompt hash drift for ${prompt.id}: expected ${prompt.sha256}, got ${actual}`);
}
console.log(`Verified ${manifest.prompts.length} prompt manifest entr${manifest.prompts.length === 1 ? "y" : "ies"}.`);
