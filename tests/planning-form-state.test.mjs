import assert from "node:assert/strict";
import {
  buildPlanningGenerationPayload,
  collectActivitiesFromTable,
  combineProfileChoiceValues,
  fillActivityTable,
  formatProfileChoiceSummary,
  splitProfileChoiceValue,
} from "../src/client/planning-form-state.mjs";

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
assert.equal(
  combineProfileChoiceValues("科研探索 / 实验设计", "做过一个心理学问卷小项目"),
  "科研探索 / 实验设计；做过一个心理学问卷小项目",
);
assert.equal(combineProfileChoiceValues("", "播客主持 / 纪录片剪辑"), "播客主持 / 纪录片剪辑");
assert.deepEqual(
  splitProfileChoiceValue("科研探索 / 实验设计；做过一个心理学问卷小项目", [
    "科研探索 / 实验设计",
    "写作表达 / 公开演讲",
  ]),
  {
    choice: "科研探索 / 实验设计",
    custom: "做过一个心理学问卷小项目",
  },
);
assert.deepEqual(splitProfileChoiceValue("家庭有社区公益资源", ["校内实验室 / 社团平台"]), {
  choice: "",
  custom: "家庭有社区公益资源",
});
assert.equal(
  combineProfileChoiceValues(["科研探索 / 实验设计", "编程 / 数据分析"], "做过一个心理学问卷小项目"),
  "科研探索 / 实验设计；编程 / 数据分析；做过一个心理学问卷小项目",
);
assert.deepEqual(
  splitProfileChoiceValue("科研探索 / 实验设计；编程 / 数据分析；做过一个心理学问卷小项目", [
    "科研探索 / 实验设计",
    "编程 / 数据分析",
    "写作表达 / 公开演讲",
  ]),
  {
    choice: "科研探索 / 实验设计",
    choices: ["科研探索 / 实验设计", "编程 / 数据分析"],
    custom: "做过一个心理学问卷小项目",
  },
);
assert.equal(formatProfileChoiceSummary([]), "请选择（可多选）");
assert.equal(
  formatProfileChoiceSummary(["科研探索 / 实验设计", "编程 / 数据分析"], "做过一个心理学问卷小项目"),
  "科研探索 / 实验设计；编程 / 数据分析；做过一个心理学问卷小项目",
);

const compactedGenerationPayload = buildPlanningGenerationPayload({
  profile: {
    majorDirection: "Computer Science",
    interests: "I".repeat(5000),
    existingActivities: "E".repeat(5000),
  },
  activities: Array.from({ length: 20 }, (_, index) => ({
    type: `Type ${index + 1} ${"T".repeat(500)}`,
    activityName: `Activity ${index + 1} ${"N".repeat(2000)}`,
    executionDescription: `Description ${index + 1} ${"D".repeat(5000)}`,
    suggestedGrade: `Grade ${index + 1} ${"G".repeat(500)}`,
  })),
});

assert.equal(compactedGenerationPayload.profile.majorDirection, "Computer Science");
assert.ok(compactedGenerationPayload.profile.interests.length < 1000);
assert.ok(compactedGenerationPayload.profile.interests.endsWith("..."));
assert.equal(compactedGenerationPayload.activities.length, 15);
assert.ok(compactedGenerationPayload.activities[0].executionDescription.length < 1300);
assert.ok(compactedGenerationPayload.activities[0].executionDescription.endsWith("..."));
assert.doesNotMatch(
  JSON.stringify(compactedGenerationPayload),
  new RegExp("D{2000}|I{2000}|N{1000}"),
);
