import assert from "node:assert/strict";
import {
  classifyResource,
  enrichResourceEligibility,
  hasEligibilityConditions,
} from "../resource-eligibility.mjs";

const offline = enrichResourceEligibility({
  formatAndWebsite: "线下(Boston University)",
  requirements: ["接受国际生"],
});

assert.equal(offline.participationMode, "offline");
assert.equal(offline.eligibilityStatus, "open_to_international");
assert.equal(
  classifyResource(offline, { participationPreference: "online_only" }).excluded,
  true,
);

const hybrid = enrichResourceEligibility({
  formatAndWebsite: "线下 + 线上双轨",
  requirements: [],
});

assert.equal(hybrid.participationMode, "hybrid");
assert.equal(
  classifyResource(hybrid, { participationPreference: "online_only" }).excluded,
  false,
);

const restricted = enrichResourceEligibility({
  formatAndWebsite: "线上",
  requirements: ["仅美国公民或永久居民可申请"],
});

assert.equal(restricted.eligibilityStatus, "us_status_only");
const restrictedResult = classifyResource(restricted, {
  nationality: "中国",
  identityDescription: "中国大陆高中在读，无美国公民或绿卡身份",
  schoolContext: "mainland_china_high_school",
  participationPreference: "online_only",
});
assert.equal(restrictedResult.excluded, true);
assert.deepEqual(restrictedResult.reasons, ["仅美国公民或永久居民可申请"]);

const usHighSchoolOnly = enrichResourceEligibility({
  name: "Local Lab Research",
  requirements: ["限纽约市公立高中 9-11 年级"],
});
assert.equal(usHighSchoolOnly.eligibilityStatus, "us_high_school_only");
assert.equal(
  classifyResource(usHighSchoolOnly, { schoolContext: "mainland_china_high_school" }).excluded,
  true,
);
assert.deepEqual(
  classifyResource(usHighSchoolOnly, { schoolContext: "mainland_china_high_school" }).reasons,
  ["仅限美国境内指定高中或地区学生申请"],
);
assert.equal(
  classifyResource(usHighSchoolOnly, { schoolContext: "us_high_school" }).excluded,
  false,
);

const usSchoolAbbreviationOnly = enrichResourceEligibility({
  name: "US Campus Seminar",
  requirements: ["仅美高学生可申请"],
});
assert.equal(usSchoolAbbreviationOnly.eligibilityStatus, "us_high_school_only");
assert.deepEqual(
  classifyResource(usSchoolAbbreviationOnly, { schoolContext: "mainland_china_high_school" }).reasons,
  ["仅限美国境内指定高中或地区学生申请"],
);

const explicitAmericanHighSchoolAudience = enrichResourceEligibility({
  name: "CodeQuest",
  description: "洛克希德·马丁主办的美国高中生团队编程邀请赛。",
});
assert.equal(explicitAmericanHighSchoolAudience.eligibilityStatus, "us_high_school_only");
assert.equal(
  classifyResource(explicitAmericanHighSchoolAudience, { schoolContext: "mainland_china_high_school" }).excluded,
  true,
);

const mainlandChinaExcluded = enrichResourceEligibility({
  name: "Restricted Research Program",
  requirements: ["不接受中国大陆高中生"],
});
assert.equal(mainlandChinaExcluded.eligibilityStatus, "mainland_china_excluded");
assert.equal(
  classifyResource(mainlandChinaExcluded, { schoolContext: "mainland_china_high_school" }).excluded,
  true,
);
assert.deepEqual(
  classifyResource(mainlandChinaExcluded, { schoolContext: "mainland_china_high_school" }).reasons,
  ["不接受中国大陆高中生申请"],
);
assert.equal(
  classifyResource(mainlandChinaExcluded, { schoolContext: "outside_us_high_school" }).excluded,
  false,
);

const internationalTrackAvailable = enrichResourceEligibility({
  name: "Track-based Program",
  description: "免费 track 限美国学生，商业版对国际生开放",
  requirements: ["接受国际生"],
});
assert.equal(internationalTrackAvailable.eligibilityStatus, "open_to_international");
assert.equal(
  classifyResource(internationalTrackAvailable, {
    schoolContext: "mainland_china_high_school",
    identityDescription: "无美国公民或绿卡身份",
  }).excluded,
  false,
);

const unknown = enrichResourceEligibility({ name: "未标注竞赛", raw: "" });
const unknownResult = classifyResource(unknown, { participationPreference: "online_only" });
assert.equal(unknownResult.excluded, false);
assert.deepEqual(unknownResult.notices, []);

const limitedButUnclear = enrichResourceEligibility({
  rawRating: "A+(身份受限)",
  formatAndWebsite: "线上",
  requirements: [],
});
assert.equal(limitedButUnclear.eligibilityStatus, "restricted");
assert.equal(
  classifyResource(limitedButUnclear, { nationality: "中国", identityDescription: "国际学生" }).excluded,
  false,
);

const onlineResearchProject = enrichResourceEligibility({
  name: "Pioneer Academics",
  format: "线上",
  requirements: "9-11 年级国际高中生",
});
assert.equal(onlineResearchProject.participationMode, "online");
assert.equal(
  classifyResource(onlineResearchProject, { participationPreference: "offline_only" }).excluded,
  true,
);

const explicitlyTagged = enrichResourceEligibility({
  name: "人工已标记项目",
  participationMode: "online",
  eligibilityStatus: "restricted",
  eligibilityNote: "仅指定地区学生可参加",
});
assert.equal(explicitlyTagged.participationMode, "online");
assert.equal(explicitlyTagged.eligibilityStatus, "restricted");
assert.equal(explicitlyTagged.eligibilityNote, "仅指定地区学生可参加");

assert.equal(
  hasEligibilityConditions({
    nationality: "",
    identityDescription: "",
    schoolContext: "",
    participationPreference: "",
  }),
  false,
);
assert.equal(
  hasEligibilityConditions({
    nationality: "",
    identityDescription: "",
    schoolContext: "mainland_china_high_school",
    participationPreference: "",
  }),
  true,
);
assert.equal(
  hasEligibilityConditions({
    nationality: "",
    identityDescription: "",
    participationPreference: "offline_only",
  }),
  true,
);
