import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPLICATION_ROUND_LABELS,
  getEligibleSchools,
  parseApplicationBackupSchoolsMarkdown,
  parseApplicationRoundSchoolsMarkdown,
} from "../src/domain/application-round-schools.mjs";

const markdown = readFileSync("data/application-round-schools.md", "utf8");
const internationalMarkdown = readFileSync("data/international-schools.md", "utf8");
const otherRegionMarkdown = readFileSync("data/other-region-schools.md", "utf8");
const schools = parseApplicationRoundSchoolsMarkdown(markdown);
const backupSchools = parseApplicationBackupSchoolsMarkdown(internationalMarkdown, otherRegionMarkdown);

assert.ok(schools.length >= 130, "RAG should include US T80 universities and TOP50 LACs.");
assert.equal(APPLICATION_ROUND_LABELS.multiCountry, "\u591a\u56fd\u8054\u7533");
assert.ok(backupSchools.length >= 60, "Multi-country backups should reuse international and other-region encyclopedia schools.");

const princeton = schools.find((school) => school.name === "Princeton University");
assert.deepEqual(
  {
    category: princeton?.category,
    rank: princeton?.rank,
    ed1: princeton?.rounds.ed1,
    ed2: princeton?.rounds.ed2,
    ea: princeton?.rounds.ea,
    rea: princeton?.rounds.rea,
    uc: princeton?.rounds.uc,
    rd: princeton?.rounds.rd,
  },
  {
    category: "综合大学",
    rank: "1",
    ed1: "否",
    ed2: "否",
    ea: "否",
    rea: "是",
    uc: "否",
    rd: "是",
  },
);

assert.ok(getEligibleSchools(schools, "rea").some((school) => school.name === "Princeton University"));
assert.ok(!getEligibleSchools(schools, "ed1").some((school) => school.name === "Princeton University"));
assert.ok(getEligibleSchools(schools, "ed1").some((school) => school.name === "University of Chicago"));
assert.ok(getEligibleSchools(schools, "ed2").some((school) => school.name === "University of Chicago"));
assert.ok(getEligibleSchools(schools, "ea").some((school) => school.name === "Massachusetts Institute of Technology"));
assert.ok(getEligibleSchools(schools, "uc").some((school) => school.name === "University of California, Los Angeles"));
assert.ok(!getEligibleSchools(schools, "rd").some((school) => school.name === "University of California, Los Angeles"));
assert.ok(getEligibleSchools(schools, "rd").some((school) => school.name === "Harvard University"));
assert.ok(!getEligibleSchools(schools, "ea").some((school) => school.name === "United States Naval Academy"));
assert.equal(getEligibleSchools(schools, "multiCountry").length, 0, "US round RAG should not populate overseas backups.");
assert.ok(
  getEligibleSchools(backupSchools, "multiCountry").some((school) => school.name.includes("University of Waterloo")),
  "Multi-country backups should include UK/HK/Macau/Canada/Singapore encyclopedia schools.",
);
assert.ok(
  getEligibleSchools(backupSchools, "multiCountry").some((school) => school.name.includes("ETH Zurich")),
  "Multi-country backups should include other-region encyclopedia schools.",
);
