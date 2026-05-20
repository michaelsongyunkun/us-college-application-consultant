function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildWordDocument({ profile, activities, narrative }) {
  const profileRows = Object.entries(profile || {})
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const activityRows = (activities || [])
    .map(
      (activity) => `
        <tr>
          <td>${escapeHtml(activity.id)}</td>
          <td>${escapeHtml(activity.type)}</td>
          <td>${escapeHtml(activity.activityName)}</td>
          <td>${escapeHtml(activity.executionDescription).replaceAll("\n", "<br>")}</td>
          <td>${escapeHtml(activity.suggestedGrade)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>美本申请规划活动表</title>
    <style>
      body { font-family: "Microsoft YaHei", Arial, sans-serif; line-height: 1.5; }
      h1, h2 { color: #172033; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; }
      th, td { border: 1px solid #888; padding: 8px; vertical-align: top; }
      th { background: #eef5f7; }
    </style>
  </head>
  <body>
    <h1>美本申请规划活动表</h1>
    <h2>用户背景信息</h2>
    <table>
      <tbody>${profileRows}</tbody>
    </table>
    <h2>10项课外活动列表</h2>
    <table>
      <thead>
        <tr>
          <th>序号</th>
          <th>活动类型（Type）</th>
          <th>活动名称（精准描述）</th>
          <th>具体执行描述（需含：问题 / 成果 / 影响）</th>
          <th>建议年级</th>
        </tr>
      </thead>
      <tbody>${activityRows}</tbody>
    </table>
    <h2>活动叙事逻辑解读</h2>
    <p>${escapeHtml(narrative).replaceAll("\n", "<br>")}</p>
  </body>
</html>`;
}
