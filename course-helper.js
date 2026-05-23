import {
  buildApCourseStudentProfile,
  parseApCoursesMarkdown,
  recommendApCoursePlan,
} from "./ap-course-recommender.mjs";

const form = document.querySelector("#courseHelperForm");
const apCourseGrid = document.querySelector("#apCourseGrid");
const apCourseStatus = document.querySelector("#apCourseStatus");
const apRecommendationStatus = document.querySelector("#apRecommendationStatus");
const apRecommendationNotice = document.querySelector("#apRecommendationNotice");
const apRecommendationList = document.querySelector("#apRecommendationList");
const refreshApRecommendationsButton = document.querySelector("#refreshApRecommendationsButton");

let apCourses = [];
let apRecommendationBatchIndex = 0;

const AP_COURSE_FALLBACK = [
  { name: "AP 2-D Art and Design", chineseName: "二维设计" },
  { name: "AP 3-D Art and Design", chineseName: "三维设计" },
  { name: "AP African American Studies", chineseName: "非裔美国人研究" },
  { name: "AP Art History", chineseName: "艺术史" },
  { name: "AP Biology", chineseName: "生物" },
  { name: "AP Calculus AB", chineseName: "微积分 AB" },
  { name: "AP Calculus BC", chineseName: "微积分 BC" },
  { name: "AP Chemistry", chineseName: "化学" },
  { name: "AP Chinese Language and Culture", chineseName: "中文语言与文化" },
  { name: "AP Comparative Government and Politics", chineseName: "比较政府与政治" },
  { name: "AP Computer Science A", chineseName: "计算机科学 A" },
  { name: "AP Computer Science Principles", chineseName: "计算机科学原理" },
  { name: "AP Drawing", chineseName: "绘画" },
  { name: "AP English Language and Composition", chineseName: "英语语言与写作" },
  { name: "AP English Literature and Composition", chineseName: "英语文学与写作" },
  { name: "AP Environmental Science", chineseName: "环境科学" },
  { name: "AP European History", chineseName: "欧洲史" },
  { name: "AP French Language and Culture", chineseName: "法语语言与文化" },
  { name: "AP German Language and Culture", chineseName: "德语语言与文化" },
  { name: "AP Human Geography", chineseName: "人文地理" },
  { name: "AP Italian Language and Culture", chineseName: "意大利语语言与文化" },
  { name: "AP Japanese Language and Culture", chineseName: "日语语言与文化" },
  { name: "AP Latin", chineseName: "拉丁语" },
  { name: "AP Macroeconomics", chineseName: "宏观经济学" },
  { name: "AP Microeconomics", chineseName: "微观经济学" },
  { name: "AP Music Theory", chineseName: "乐理" },
  { name: "AP Physics 1", chineseName: "物理 1" },
  { name: "AP Physics 2", chineseName: "物理 2" },
  { name: "AP Physics C: Electricity and Magnetism", chineseName: "物理 C：电磁学" },
  { name: "AP Physics C: Mechanics", chineseName: "物理 C：力学" },
  { name: "AP Precalculus", chineseName: "微积分预备" },
  { name: "AP Psychology", chineseName: "心理学" },
  { name: "AP Research", chineseName: "研究" },
  { name: "AP Seminar", chineseName: "专题研讨" },
  { name: "AP Spanish Language and Culture", chineseName: "西班牙语语言与文化" },
  { name: "AP Spanish Literature and Culture", chineseName: "西班牙语文学与文化" },
  { name: "AP Statistics", chineseName: "统计学" },
  { name: "AP United States Government and Politics", chineseName: "美国政府与政治" },
  { name: "AP United States History", chineseName: "美国历史" },
  { name: "AP World History: Modern", chineseName: "世界历史：现代" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function collectCourseHelperInput() {
  const data = new FormData(form);
  const selectedCourses = data.getAll("apCourses");
  return {
    grade: data.get("grade") || "",
    majorDirection: data.get("majorDirection") || "",
    academicStatus: data.get("academicStatus") || "",
    hasNoApCourses: selectedCourses.includes("__none__"),
    completedCourses: selectedCourses.filter((course) => course !== "__none__"),
  };
}

function renderApCourseOptions(courses) {
  if (!apCourseGrid) return;
  apCourseGrid.innerHTML = [
    `
        <label class="ap-course-none-option">
          <input type="checkbox" name="apCourses" value="__none__" />
          <span>无修读任何 AP 课程</span>
        </label>`,
    ...courses
    .map(
      (course) => `
        <label>
          <input type="checkbox" name="apCourses" value="${escapeHtml(course.name)}" />
          <span>${escapeHtml(course.name)}${course.chineseName ? `（${escapeHtml(course.chineseName)}）` : ""}</span>
        </label>`,
    ),
  ]
    .join("");
}

function renderRecommendations() {
  if (!apRecommendationList || !apRecommendationNotice || !apRecommendationStatus) return;

  const studentProfile = buildApCourseStudentProfile(collectCourseHelperInput());
  const result = recommendApCoursePlan({ studentProfile, courses: apCourses, batchIndex: apRecommendationBatchIndex });

  apRecommendationStatus.textContent = result.items.length ? "已生成计划" : "等待完整输入";
  apRecommendationNotice.textContent = result.notice;

  apRecommendationList.innerHTML = result.items
    .map(
      (gradePlan) => `
        <article class="ap-plan-card">
          <div class="ap-plan-card__header">
            <div>
              <p class="case-index">${escapeHtml(gradePlan.grade)} 年级</p>
              <h3>建议修读 ${gradePlan.targetCount} 门 AP</h3>
            </div>
          </div>
          <div class="ap-plan-courses">
            ${gradePlan.recommendations
              .map(
                (course) => `
                  <section class="ap-plan-course">
                    <div class="ap-plan-course__title">
                      <strong>${escapeHtml(course.name)}</strong>
                      <span>${escapeHtml(course.rating || "B")}</span>
                    </div>
                    <p>${escapeHtml(course.chineseName || course.category)}</p>
                    <dl class="ap-score-meta">
                      <div><dt>5 分率</dt><dd>${escapeHtml(course.fiveRate || "未提供")}</dd></div>
                      <div><dt>4 分率</dt><dd>${escapeHtml(course.fourRate || "未提供")}</dd></div>
                      <div><dt>5 分阈值</dt><dd>${escapeHtml(course.fiveThreshold || "未提供")}</dd></div>
                      <div><dt>4 分阈值</dt><dd>${escapeHtml(course.fourThreshold || "未提供")}</dd></div>
                    </dl>
                    <p>${escapeHtml(course.reason)}</p>
                  </section>`,
              )
              .join("")}
          </div>
        </article>`,
    )
    .join("");
}

async function loadApCourses() {
  try {
    const response = await fetch("./data/ap-courses.md");
    if (!response.ok) throw new Error("AP course data unavailable");
    const markdown = await response.text();
    apCourses = parseApCoursesMarkdown(markdown);
    renderApCourseOptions(apCourses);
    if (apCourseStatus) apCourseStatus.textContent = `已载入 ${apCourses.length} 门 AP 课程`;
  } catch {
    apCourses = AP_COURSE_FALLBACK;
    renderApCourseOptions(apCourses);
    if (apCourseStatus) apCourseStatus.textContent = `已载入 ${apCourses.length} 门 AP 课程（备用列表）`;
  }
  renderRecommendations();
}

form?.addEventListener("input", () => {
  apRecommendationBatchIndex = 0;
  renderRecommendations();
});
refreshApRecommendationsButton?.addEventListener("click", () => {
  apRecommendationBatchIndex += 1;
  renderRecommendations();
});
loadApCourses();
