import assert from "node:assert/strict";
import { buildCompetitionStudentProfile, recommendCompetitions } from "../competition-recommender.mjs";
import { buildSummerSchoolStudentProfile, recommendSummerSchools, tierForRating } from "../summer-school-recommender.mjs";

const mixedDirectionProfile = {
  grade: "11",
  majorDirection: "History / Humanities",
  interests: "math, economics, social science",
  coreStrengths: "AMC training and economics club",
};

const competitionProfile = buildCompetitionStudentProfile({
  profile: mixedDirectionProfile,
  activities: [],
  narrative: "",
});

const competitions = [
  { id: "math-1", name: "AMC 10 Mathematics Competition", category: "Math", raw: "math amc" },
  { id: "econ-1", name: "National Economics Challenge", category: "Economics", raw: "economics business" },
  { id: "hum-1", name: "John Locke History Essay Competition", category: "Humanities", raw: "history writing humanities" },
  { id: "hum-2", name: "Global History Writing Challenge", category: "Humanities", raw: "history writing" },
  { id: "hum-3", name: "Public Policy Debate Contest", category: "Humanities", raw: "social science debate writing" },
  { id: "hum-4", name: "Journalism and Media Essay Prize", category: "Humanities", raw: "journalism writing media" },
  { id: "hum-5", name: "Museum Curation Research Prize", category: "Humanities", raw: "museum history humanities" },
];

const competitionBatch = recommendCompetitions({
  studentProfile: competitionProfile,
  competitions,
});

assert.equal(competitionBatch.items.length, 5);
const strongCompetitions = competitionBatch.items.slice(0, 3);
const expansionCompetitions = competitionBatch.items.slice(3);
assert.ok(strongCompetitions.every((item) => !item.id.startsWith("math-")));
assert.ok(strongCompetitions.every((item) => !item.id.startsWith("econ-")));
assert.ok(expansionCompetitions.some((item) => item.id.startsWith("math-") || item.id.startsWith("econ-")));

const summerProfile = buildSummerSchoolStudentProfile({
  profile: mixedDirectionProfile,
  activities: [],
  narrative: "",
});

const summerSchools = [
  {
    id: "math-s",
    name: "Advanced Mathematics Summer Program",
    category: "Math",
    description: "math proof and number theory",
    rating: "S",
    tier: tierForRating("S"),
    requirements: [],
    programTime: "",
    applicationTime: "",
  },
  {
    id: "hum-s",
    name: "History Humanities Seminar",
    category: "Humanities",
    description: "history humanities writing",
    rating: "S",
    tier: tierForRating("S"),
    requirements: [],
    programTime: "",
    applicationTime: "",
  },
  {
    id: "hum-a",
    name: "Social Science Writing Institute",
    category: "Humanities",
    description: "social science writing public policy",
    rating: "A",
    tier: tierForRating("A"),
    requirements: [],
    programTime: "",
    applicationTime: "",
  },
  {
    id: "hum-b",
    name: "Museum and Public History Program",
    category: "Humanities",
    description: "museum history humanities",
    rating: "B",
    tier: tierForRating("B"),
    requirements: [],
    programTime: "",
    applicationTime: "",
  },
];

const summerBatch = recommendSummerSchools({
  studentProfile: summerProfile,
  summerSchools,
});

assert.equal(summerBatch.items.length, 3);
assert.ok(summerBatch.items.every((item) => item.id !== "math-s"));
