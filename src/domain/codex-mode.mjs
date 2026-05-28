export function buildCodexTaskPackage({ fixedPrompt, profile, activities }) {
  return [
    "请严格使用下面的固定Agent提示词完成任务。固定Agent提示词不得篡改、不得改写、不得删减。",
    "",
    "===== 固定Agent提示词开始 =====",
    fixedPrompt,
    "===== 固定Agent提示词结束 =====",
    "",
    "===== 用户背景信息开始 =====",
    JSON.stringify(profile || {}, null, 2),
    "===== 用户背景信息结束 =====",
    "",
    "===== 现有课外活动草稿开始 =====",
    JSON.stringify(activities || [], null, 2),
    "===== 现有课外活动草稿结束 =====",
    "",
    "请输出符合固定Agent提示词 Expected Output Format 的完整回答。",
  ].join("\n");
}
