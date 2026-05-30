import { calculateGpa } from "../domain/gpa-calculator.mjs";

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
const syncGpaGradeLevel = document.querySelector("#syncGpaGradeLevel");
const syncGpaTerm = document.querySelector("#syncGpaTerm");
const syncGpaToPortfolioButton = document.querySelector("#syncGpaToPortfolioButton");
const gpaSyncStatus = document.querySelector("#gpaSyncStatus");
const MY_ACTIVITIES_ENDPOINT = "/api/my-activities";

let nextCourseId = 1;
let latestGpaResult = null;

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

function getPortfolioScaleLabel(scale) {
  return scale === "four-point" ? "4.0分制" : "100分制";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
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
  latestGpaResult = result;
  const scaleLabel = getScaleLabel(result.scale);

  gpaResultValue.textContent = result.gpa === null ? "--" : result.gpa.toFixed(2);
  gpaCourseCount.textContent = String(result.validCourseCount);
  gpaTotalCredits.textContent = String(Number(result.totalCredits.toFixed(2)));
  gpaScaleLabel.textContent = scaleLabel;
  gpaStatus.textContent = result.gpa === null ? "等待输入" : "已计算";
  if (syncGpaToPortfolioButton) syncGpaToPortfolioButton.disabled = result.gpa === null;

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

function buildSyncedAcademicRecords(portfolio, result) {
  const gradeLevel = syncGpaGradeLevel?.value || "9年级";
  const term = syncGpaTerm?.value || "上学期";
  const existingRecords = portfolio.academicRecords || {};
  const gpaRecords = Array.isArray(existingRecords.gpaRecords)
    ? existingRecords.gpaRecords.map((record) => ({ ...record }))
    : [];
  const syncedRecord = {
    gradeLevel,
    term,
    gpa: result.gpa.toFixed(2),
  };
  const existingIndex = gpaRecords.findIndex(
    (record) => record.gradeLevel === gradeLevel && record.term === term,
  );
  if (existingIndex >= 0) {
    gpaRecords[existingIndex] = { ...gpaRecords[existingIndex], ...syncedRecord };
  } else {
    gpaRecords.push(syncedRecord);
  }
  return {
    ...existingRecords,
    gpaScale: getPortfolioScaleLabel(result.scale),
    gpaRecords,
  };
}

async function syncGpaToPortfolio() {
  if (!latestGpaResult || latestGpaResult.gpa === null) {
    if (gpaSyncStatus) {
      gpaSyncStatus.textContent = "请先输入有效课程成绩后再同步。";
      gpaSyncStatus.classList.add("error");
    }
    return;
  }

  syncGpaToPortfolioButton.disabled = true;
  if (gpaSyncStatus) {
    gpaSyncStatus.textContent = "正在同步";
    gpaSyncStatus.classList.remove("error");
  }

  try {
    const portfolio = await requestJson(MY_ACTIVITIES_ENDPOINT, { method: "GET" });
    const academicRecords = buildSyncedAcademicRecords(portfolio, latestGpaResult);
    const saved = await requestJson(MY_ACTIVITIES_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify({ ...portfolio, academicRecords }),
    });
    if (gpaSyncStatus) {
      gpaSyncStatus.textContent = `已同步到我的申请：${syncGpaGradeLevel.value} ${syncGpaTerm.value} GPA ${saved.academicRecords.gpaRecords.find(
        (record) => record.gradeLevel === syncGpaGradeLevel.value && record.term === syncGpaTerm.value,
      )?.gpa || latestGpaResult.gpa.toFixed(2)}`;
      gpaSyncStatus.classList.remove("error");
    }
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/?next=/gpa-calculator.html";
      return;
    }
    if (gpaSyncStatus) {
      gpaSyncStatus.textContent = error.message;
      gpaSyncStatus.classList.add("error");
    }
  } finally {
    syncGpaToPortfolioButton.disabled = latestGpaResult?.gpa === null;
  }
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
syncGpaToPortfolioButton?.addEventListener("click", syncGpaToPortfolio);

addCourse();
addCourse();
updateGradeInputs();
renderResult();
