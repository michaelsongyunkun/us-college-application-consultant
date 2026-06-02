import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterInternationalJournals,
  getInternationalJournalDirections,
  getInternationalJournalIndexDatabases,
  parseInternationalJournalsMarkdown,
} from "../src/domain/international-journal-library.mjs";

const markdown = readFileSync("data/international-journals.md", "utf8");
const journals = parseInternationalJournalsMarkdown(markdown);

assert.equal(journals.length, 242, "DOCX-derived journal RAG should parse all numbered entries.");

const firstJournal = journals[0];
assert.equal(firstJournal.name, "Journal of Emerging Investigators");
assert.equal(firstJournal.direction, "高中生 STEM");
assert.equal(firstJournal.indexDatabase, "学生期刊");
assert.equal(firstJournal.url, "https://emerginginvestigators.org/");
assert.match(firstJournal.description, /同行评审/);

const directions = getInternationalJournalDirections(journals);
assert.ok(directions.includes("计算机科学、人工智能、数据科学与信息系统"));
assert.ok(directions.includes("医学、公共卫生、护理、临床与基础健康科学"));
assert.ok(directions.includes("艺术、设计、音乐、视觉文化与创意研究"));

assert.deepEqual(getInternationalJournalIndexDatabases(journals), ["Scopus", "DOAJ OA", "学生期刊"]);

const scopusComputerScience = filterInternationalJournals(journals, {
  direction: "计算机科学、人工智能、数据科学与信息系统",
  indexDatabase: "Scopus",
});
assert.ok(scopusComputerScience.length > 0, "Computer science + Scopus should return matching journals.");
assert.ok(scopusComputerScience.every((journal) => journal.direction === "计算机科学、人工智能、数据科学与信息系统"));
assert.ok(scopusComputerScience.every((journal) => journal.indexDatabase === "Scopus"));

const publicHealthDoaj = filterInternationalJournals(journals, {
  query: "global health",
  direction: "医学、公共卫生、护理、临床与基础健康科学",
  indexDatabase: "DOAJ OA",
});
assert.ok(publicHealthDoaj.some((journal) => journal.name === "Graduate Medical Education Research Journal"));

const noMatch = filterInternationalJournals(journals, {
  query: "robotics",
  direction: "文学、语言、文化研究、翻译与文本分析",
  indexDatabase: "Scopus",
});
assert.equal(noMatch.length, 0, "Keyword search should narrow selected direction and index filters.");
