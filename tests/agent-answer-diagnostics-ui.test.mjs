import assert from "node:assert/strict";
import {
  buildParseFailureMessage,
  renderParseDiagnostics,
} from "../src/client/agent-answer-diagnostics-ui.mjs";

assert.equal(
  buildParseFailureMessage({
    issues: ["没有识别到可填入表格的活动行。"],
    suggestions: ["建议让 AI 使用包含 5 列的表格。"],
  }),
  "没有识别到可填入表格的活动行。 建议让 AI 使用包含 5 列的表格。",
);

assert.match(buildParseFailureMessage({}), /未识别到活动表格/);

const classes = new Set(["is-hidden"]);
const container = {
  hidden: true,
  innerHTML: "",
  classList: {
    remove(name) {
      classes.delete(name);
    },
    toggle(name, force) {
      if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    },
  },
};

renderParseDiagnostics(container, {
  activityCount: 0,
  strategy: "none",
  nonEmptyLineCount: 2,
  narrativeFound: false,
  evidence: {
    candidatePipeRows: 0,
    candidatePlainTextRows: 0,
    candidateNumberedBlocks: 0,
  },
  issues: ["没有识别到可填入表格的活动行。"],
  suggestions: ["建议让 AI 使用包含 5 列的表格。"],
});

assert.equal(container.hidden, false);
assert.equal(classes.has("is-hidden"), false);
assert.equal(classes.has("has-error"), true);
assert.match(container.innerHTML, /解析诊断/);
assert.match(container.innerHTML, /没有识别到可填入表格的活动行/);
