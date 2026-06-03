import { parseSchoolsMarkdown } from "./school-encyclopedia.mjs";

export const APPLICATION_ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "uc", "rd", "multiCountry"];

export const APPLICATION_ROUND_LABELS = Object.freeze({
  rea: "REA",
  ed1: "ED1",
  ed2: "ED2",
  ea: "EA",
  uc: "UC",
  rd: "RD",
  multiCountry: "多国联申",
});

const ROUND_LABEL_TO_KEY = new Map([
  ["ED1", "ed1"],
  ["ED2", "ed2"],
  ["EA", "ea"],
  ["REA", "rea"],
  ["REA/SCEA", "rea"],
  ["UC", "uc"],
  ["RD", "rd"],
]);

const BLOCKED_ROUND_VALUES = new Set(["", "否", "特殊"]);

export function parseApplicationRoundSchoolsMarkdown(markdown = "") {
  const schools = [];
  let current = null;

  for (const rawLine of String(markdown).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#### ")) {
      if (current) schools.push(finalizeSchool(current));
      current = {
        name: line.replace(/^####\s+/u, "").trim(),
        category: "",
        rank: "",
        note: "",
        rounds: emptyRounds(),
      };
      continue;
    }

    if (!current || !line.startsWith("- ")) continue;
    const fieldMatch = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/u);
    if (!fieldMatch) continue;

    const [, rawLabel, rawValue] = fieldMatch;
    const label = rawLabel.trim();
    const value = rawValue.trim();
    if (label === "类别") current.category = value;
    if (label === "排名") current.rank = value;
    if (label === "策略/备注") current.note = value;

    const roundKey = ROUND_LABEL_TO_KEY.get(label);
    if (roundKey) current.rounds[roundKey] = value;
  }

  if (current) schools.push(finalizeSchool(current));
  return schools;
}

export function getEligibleSchools(schools = [], round) {
  const requestedRound = String(round || "").trim();
  const roundKey = APPLICATION_ROUND_KEYS.find(
    (key) => key.toLowerCase() === requestedRound.toLowerCase(),
  );
  if (!APPLICATION_ROUND_KEYS.includes(roundKey)) return [];
  return schools.filter((school) => isEligibleForRound(school, roundKey));
}

export function parseApplicationBackupSchoolsMarkdown(...markdownInputs) {
  return markdownInputs
    .flatMap((markdown) => parseSchoolsMarkdown(markdown))
    .filter((school) => school.category === "international" || school.category === "other-region")
    .map((school) =>
      finalizeSchool({
        name: school.name,
        category: [school.categoryLabel, school.region].filter(Boolean).join(" / "),
        rank: school.rank,
        note: [school.website, school.applicationRequirement, school.englishRequirement]
          .filter(Boolean)
          .join("；"),
        rounds: { ...emptyRounds(), multiCountry: "yes" },
      }),
    );
}

export function isEligibleForRound(school, round) {
  const value = String(school?.rounds?.[round] || "").trim();
  if (round === "uc") return value === "是";
  if (round === "rd" && value === "类RD") return false;
  return !BLOCKED_ROUND_VALUES.has(value);
}

function finalizeSchool(school) {
  return {
    name: school.name,
    category: school.category,
    rank: school.rank,
    note: school.note,
    rounds: { ...emptyRounds(), ...school.rounds },
  };
}

function emptyRounds() {
  return {
    ed1: "",
    ed2: "",
    ea: "",
    rea: "",
    uc: "",
    rd: "",
    multiCountry: "",
  };
}
