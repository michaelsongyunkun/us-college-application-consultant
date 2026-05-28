import assert from "node:assert/strict";
import { buildCodexTaskPackage } from "../src/domain/codex-mode.mjs";

const task = buildCodexTaskPackage({
  fixedPrompt: "# Role: 固定提示词",
  profile: { grade: "10年级", interests: "AI教育公益" },
  activities: [{ id: 1, type: "学术突破" }],
});

assert.ok(task.includes("固定Agent提示词不得篡改"));
assert.ok(task.includes("===== 固定Agent提示词开始 =====\n# Role: 固定提示词"));
assert.ok(task.includes('"grade": "10年级"'));
assert.ok(task.includes('"type": "学术突破"'));
