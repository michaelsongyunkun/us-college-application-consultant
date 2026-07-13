import { readFile } from "node:fs/promises";
import { JobStatusSchema, RagSourceSchema, StudentProfileResponseSchema, UsageEventSchema } from "../src/contracts/schemas.js";

const app = await readFile("src/client/app.js", "utf8");
const activities = await readFile("src/client/my-activities.js", "utf8");
const planning = await readFile("src/client/planning-tracker.js", "utf8");
for (const [source, endpoint] of [[app, "/api/student-profile"], [app, "/api/plans"], [activities, "/api/my-activities"], [planning, "/api/progress-planner"]] as const) {
  if (!source.includes(endpoint)) throw new Error(`Browser contract no longer references ${endpoint}`);
}
StudentProfileResponseSchema.parse({ profile: { grade: "11年级", majorDirection: "CS" }, updatedAt: null });
UsageEventSchema.parse({ eventType: "save_draft", profile: {}, metrics: {}, details: {} });
JobStatusSchema.parse({ jobId: "00000000-0000-4000-8000-000000000000", status: "pending" });
RagSourceSchema.parse({ id: "rag-1", type: "school-encyclopedia", typeLabel: "院校百科", title: "Representative source" });
console.log("Browser/server contract compatibility checks passed.");
