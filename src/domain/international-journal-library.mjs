function cleanValue(value) {
  return String(value ?? "").trim();
}

function normalizeSearchText(value) {
  return cleanValue(value).toLowerCase();
}

function splitList(value) {
  return cleanValue(value)
    .split(/[、,，；;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function primaryDirection(field) {
  return cleanValue(field).split(/[；;]/)[0]?.trim() || "";
}

function normalizeIndexDatabase(value) {
  const text = cleanValue(value);
  if (/scopus/i.test(text)) return "Scopus";
  if (/doaj/i.test(text)) return "DOAJ OA";
  if (text.includes("学生期刊")) return "学生期刊";
  return text || "待复核";
}

function parseJournalHeading(line) {
  const match = cleanValue(line).match(/^###\s+(\d{3})\.\s+(.+)$/);
  if (!match) return null;
  return {
    index: match[1],
    name: match[2].trim(),
  };
}

function parseField(line) {
  const match = cleanValue(line).match(
    /^-\s+\*\*(期刊地址|论文方向|期刊领域|检索库|期刊类型|期刊介绍)\*\*[:：]\s*(.*)$/,
  );
  if (!match) return null;
  return {
    label: match[1],
    value: match[2].trim(),
  };
}

function searchableText(journal) {
  return normalizeSearchText(
    [
      journal.name,
      journal.url,
      journal.direction,
      journal.field,
      journal.fieldKeywords.join(" "),
      journal.indexDatabase,
      journal.type,
      journal.description,
    ].join(" "),
  );
}

export function parseInternationalJournalsMarkdown(markdown) {
  const journals = [];
  let currentJournal = null;

  function addCurrentJournal() {
    if (!currentJournal?.name) return;
    const field = currentJournal.field || "";
    const indexDatabase = normalizeIndexDatabase(currentJournal.indexDatabase || currentJournal.type);
    const direction = cleanValue(currentJournal.direction) || primaryDirection(field);
    const journal = {
      id: `international-journal-${currentJournal.index}`,
      index: currentJournal.index,
      name: currentJournal.name,
      url: currentJournal.url || "",
      direction,
      field,
      fieldKeywords: splitList(field).filter((keyword) => keyword !== direction),
      indexDatabase,
      type: currentJournal.type || indexDatabase,
      description: currentJournal.description || "",
      raw: currentJournal.rawLines.join("\n").trim(),
    };
    journals.push({
      ...journal,
      searchText: searchableText(journal),
    });
    currentJournal = null;
  }

  for (const line of String(markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    const heading = parseJournalHeading(line);
    if (heading) {
      addCurrentJournal();
      currentJournal = {
        ...heading,
        rawLines: [line],
      };
      continue;
    }

    if (!currentJournal) continue;
    if (cleanValue(line)) currentJournal.rawLines.push(line);

    const field = parseField(line);
    if (!field) continue;
    if (field.label === "期刊地址") currentJournal.url = field.value;
    if (field.label === "论文方向") currentJournal.direction = field.value;
    if (field.label === "期刊领域") currentJournal.field = field.value;
    if (field.label === "检索库") currentJournal.indexDatabase = field.value;
    if (field.label === "期刊类型") currentJournal.type = field.value;
    if (field.label === "期刊介绍") currentJournal.description = field.value;
  }

  addCurrentJournal();
  return journals.filter((journal) => journal.name && journal.direction);
}

export function getInternationalJournalDirections(journals) {
  return [...new Set(journals.map((journal) => journal.direction).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "zh-CN"),
  );
}

export function getInternationalJournalIndexDatabases(journals) {
  const priority = ["Scopus", "DOAJ OA", "学生期刊", "待复核"];
  const values = [...new Set(journals.map((journal) => journal.indexDatabase).filter(Boolean))];
  return values.sort((left, right) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? priority.length : leftIndex) - (rightIndex === -1 ? priority.length : rightIndex);
    }
    return left.localeCompare(right, "zh-CN");
  });
}

export function filterInternationalJournals(journals, filters = {}) {
  const query = normalizeSearchText(filters.query);
  const direction = cleanValue(filters.direction);
  const indexDatabase = cleanValue(filters.indexDatabase);
  return journals.filter((journal) => {
    if (direction && journal.direction !== direction) return false;
    if (indexDatabase && journal.indexDatabase !== indexDatabase) return false;
    if (query && !journal.searchText.includes(query)) return false;
    return true;
  });
}
