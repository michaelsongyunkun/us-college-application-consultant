import assert from "node:assert/strict";
import { collectActivitiesFromTable, fillActivityTable } from "../src/client/planning-form-state.mjs";

function createField(value = "") {
  return { value };
}

function createActivityTable() {
  const fields = new Map();
  const rows = Array.from({ length: 15 }, (_, index) => {
    const rowNumber = index + 1;
    for (const field of ["type", "name", "description", "grade"]) {
      fields.set(`${field}-${rowNumber}`, createField());
    }
    return {
      querySelector(selector) {
        const match = selector.match(/name="([^"]+)"/);
        return match ? fields.get(match[1]) : null;
      },
    };
  });
  return {
    fields,
    querySelector(selector) {
      const match = selector.match(/name="([^"]+)"/);
      return match ? fields.get(match[1]) : null;
    },
    querySelectorAll(selector) {
      return selector === "tbody tr" ? rows : [];
    },
  };
}

const activityTable = createActivityTable();
fillActivityTable(activityTable, [
  {
    id: "1",
    type: "学术突破",
    activityName: "**独立研究：基于NLP的初中生数学错题归因分析模型**",
    executionDescription:
      "**问题**：发现传统错题本效率低下。**行动**：利用Python爬取数据。**成果**：构建分类模型，准确率达82%。",
    suggestedGrade: "10-11",
  },
]);

assert.equal(
  activityTable.fields.get("name-1").value,
  "独立研究：基于NLP的初中生数学错题归因分析模型",
);
assert.equal(
  activityTable.fields.get("description-1").value,
  "问题：发现传统错题本效率低下。行动：利用Python爬取数据。成果：构建分类模型，准确率达82%。",
);

activityTable.fields.get("description-1").value =
  "**问题**：旧草稿仍有Markdown。**行动**：保存时也要清理。";
const collected = collectActivitiesFromTable(activityTable);
const fifteenRowTable = createActivityTable();
fillActivityTable(
  fifteenRowTable,
  Array.from({ length: 15 }, (_, index) => ({
    id: String(index + 1),
    type: `Type ${index + 1}`,
    activityName: `Activity ${index + 1}`,
    executionDescription: `Description ${index + 1}`,
    suggestedGrade: `Grade ${index + 1}`,
  })),
);

assert.equal(fifteenRowTable.fields.get("name-15").value, "Activity 15");
assert.equal(collected[0].executionDescription, "问题：旧草稿仍有Markdown。行动：保存时也要清理。");
