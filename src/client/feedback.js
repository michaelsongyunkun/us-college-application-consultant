export const FEEDBACK_SUCCESS_MESSAGE = "建议提交成功";

function normalizeLine(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function buildFeedbackRecord(payload, now = new Date()) {
  const issueType = normalizeLine(payload.issueType, 60);
  const pageName = normalizeLine(payload.pageName, 80);
  const description = normalizeText(payload.description, 2000);
  const steps = normalizeText(payload.steps, 1600);
  const contact = normalizeLine(payload.contact, 120);

  if (!issueType) throw new Error("请选择问题类型");
  if (!pageName) throw new Error("请填写遇到问题的页面或功能");
  if (description.length < 10) throw new Error("请至少用 10 个字描述问题");

  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    id: `feedback-${createdAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    issueType,
    pageName,
    description,
    steps,
    contact,
  };
}

async function submitFeedback(payload) {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "建议提交失败，请稍后再试。");
  return data;
}

export function initFeedbackPage(root = globalThis.document, now = () => new Date()) {
  if (!root) return;
  const form = root.querySelector("#feedbackForm");
  const status = root.querySelector("#feedbackStatus");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) {
      status.textContent = "";
      status.classList.remove("error");
    }

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      buildFeedbackRecord(payload, now());
      if (status) status.textContent = "提交中...";
      await submitFeedback(payload);
      form.reset();
      if (status) status.textContent = FEEDBACK_SUCCESS_MESSAGE;
    } catch (error) {
      if (status) {
        status.textContent = error.message || "反馈保存失败，请稍后再试。";
        status.classList.add("error");
      }
    }
  });
}

if (typeof document !== "undefined") {
  initFeedbackPage();
}
