import { calculateGpa } from "./gpa-calculator.mjs";

const form = document.querySelector("#gpaForm");
const scaleSelect = document.querySelector("#gpaScale");
const thresholdFieldset = document.querySelector("#thresholdFieldset");
const courseRows = document.querySelector("#gpaCourseRows");
const addCourseButton = document.querySelector("#addGpaCourseButton");
const gpaStatus = document.querySelector("#gpaStatus");
const gpaResultValue = document.querySelector("#gpaResultValue");
const gpaCourseCount = document.querySelector("#gpaCourseCount");
const gpaTotalCredits = document.querySelector("#gpaTotalCredits");
const gpaScaleLabel = document.querySelector("#gpaScaleLabel");
const gpaNotice = document.querySelector("#gpaNotice");
const gpaBreakdown = document.querySelector("#gpaBreakdown");

let nextCourseId = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getScaleLabel(scale) {
  return scale === "four-point" ? "4.0制度" : "百分制";
}

function createCourseRow({ name = "", grade = "", credits = "", isAp = false } = {}) {
  const row = document.createElement("div");
  row.className = "gpa-course-row";
  row.dataset.courseId = String(nextCourseId);
  row.innerHTML = `
    <label>
      <span>科目名称</span>
      <input name="courseName" type="text" value="${escapeHtml(name)}" placeholder="例如 English 11" />
    </label>
    <label>
      <span>GPA成绩（必填）</span>
      <input name="courseGrade" type="number" min="0" step="0.01" value="${escapeHtml(grade)}" required />
    </label>
    <label>
      <span>学分（选填）</span>
      <input name="courseCredits" type="number" min="0.01" step="0.01" value="${escapeHtml(credits)}" placeholder="默认 1" />
    </label>
    <label class="gpa-ap-toggle">
      <input name="isApCourse" type="checkbox" ${isAp ? "checked" : ""} />
      <span>AP课程</span>
    </label>
    <button type="button" class="quiet gpa-remove-course" aria-label="删除此科目">删除</button>
  `;
  nextCourseId += 1;
  return row;
}

function collectInput() {
  const data = new FormData(form);
  return {
    scale: data.get("scale") || "percentage",
    thresholds: {
      a: data.get("thresholdA"),
      b: data.get("thresholdB"),
      c: data.get("thresholdC"),
      d: data.get("thresholdD"),
    },
    courses: [...courseRows.querySelectorAll(".gpa-course-row")].map((row) => ({
      name: row.querySelector('input[name="courseName"]')?.value || "",
      grade: row.querySelector('input[name="courseGrade"]')?.value || "",
      credits: row.querySelector('input[name="courseCredits"]')?.value || "",
      isAp: row.querySelector('input[name="isApCourse"]')?.checked || false,
    })),
  };
}

function updateGradeInputs() {
  const isFourPoint = scaleSelect?.value === "four-point";
  thresholdFieldset?.classList.toggle("is-muted", isFourPoint);
  thresholdFieldset?.querySelectorAll("input").forEach((input) => {
    input.disabled = isFourPoint;
  });
  courseRows?.querySelectorAll(".gpa-course-row").forEach((row) => {
    const input = row.querySelector('input[name="courseGrade"]');
    const isAp = row.querySelector('input[name="isApCourse"]')?.checked || false;
    if (!input) return;
    input.max = isFourPoint ? (isAp ? "5" : "4") : "100";
    input.placeholder = isFourPoint ? (isAp ? "例如 5.0" : "例如 3.7") : "例如 92";
  });
}

function renderResult() {
  if (!form) return;
  const result = calculateGpa(collectInput());
  const scaleLabel = getScaleLabel(result.scale);

  gpaResultValue.textContent = result.gpa === null ? "--" : result.gpa.toFixed(2);
  gpaCourseCount.textContent = String(result.validCourseCount);
  gpaTotalCredits.textContent = String(Number(result.totalCredits.toFixed(2)));
  gpaScaleLabel.textContent = scaleLabel;
  gpaStatus.textContent = result.gpa === null ? "等待输入" : "已计算";

  if (result.errors.length) {
    gpaNotice.textContent = result.errors.join("；");
    gpaNotice.classList.add("error");
  } else if (result.gpa === null) {
    gpaNotice.textContent = "请输入至少一科成绩。";
    gpaNotice.classList.remove("error");
  } else {
    gpaNotice.textContent = `已按 AP 加权规则和 ${scaleLabel} 计算 ${result.validCourseCount} 科课程。`;
    gpaNotice.classList.remove("error");
  }

  gpaBreakdown.innerHTML = result.courses
    .map(
      (course) => `
        <article class="gpa-breakdown-card">
          <div>
            <p class="case-index">${escapeHtml(course.name)}</p>
            <h3>${Number(course.gradePoint).toFixed(2)} / ${course.isAp ? "5.00" : "4.00"}</h3>
          </div>
          <dl>
            <div><dt>原始成绩</dt><dd>${escapeHtml(course.originalGrade)}</dd></div>
            <div><dt>学分</dt><dd>${escapeHtml(course.credits)}</dd></div>
            <div><dt>课程类型</dt><dd>${course.isAp ? "AP课程" : "普通课程"}</dd></div>
          </dl>
        </article>`,
    )
    .join("");
}

function addCourse(initialValue) {
  courseRows?.append(createCourseRow(initialValue));
  updateGradeInputs();
  renderResult();
}

addCourseButton?.addEventListener("click", () => addCourse());
courseRows?.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".gpa-remove-course");
  if (!removeButton) return;
  removeButton.closest(".gpa-course-row")?.remove();
  if (!courseRows.children.length) addCourse();
  renderResult();
});
form?.addEventListener("input", () => {
  updateGradeInputs();
  renderResult();
});

addCourse();
addCourse();
updateGradeInputs();
renderResult();
