import argparse
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from docx import Document


FIELD_LABEL = "\u4e2d\u56fd\u5b66\u751f\u5f55\u53d6\u53cb\u597d\u5ea6"
FIELD_PREFIX = f"- **{FIELD_LABEL}**\uff1a"

ALIASES = {
    "mit": "massachusettsinstituteoftechnology",
    "yale": "yaleuniversity",
    "duke": "dukeuniversity",
    "jhu": "johnshopkinsuniversity",
    "upenn": "universityofpennsylvania",
    "caltech": "californiainstituteoftechnology",
    "brown": "brownuniversity",
    "columbia": "columbiauniversity",
    "cornell": "cornelluniversity",
    "uchicago": "universityofchicago",
    "dartmouth": "dartmouthcollege",
    "rice": "riceuniversity",
    "vanderbilt": "vanderbiltuniversity",
    "washu": "washingtonuniversityinstlouis",
    "notredame": "universityofnotredame",
    "cmu": "carnegiemellonuniversity",
    "emory": "emoryuniversity",
    "georgetown": "georgetownuniversity",
    "umich": "universityofmichiganannarbor",
    "unc": "universityofnorthcarolinaatchapelhill",
    "uva": "universityofvirginia",
    "usc": "universityofsoutherncalifornia",
    "nyu": "newyorkuniversity",
    "uf": "universityofflorida",
    "ucsb": "universityofcaliforniasantabarbara",
    "ucsantabarbara": "universityofcaliforniasantabarbara",
    "ucirvine": "universityofcaliforniairvine",
    "ucsd": "universityofcaliforniasandiego",
    "ucsandiego": "universityofcaliforniasandiego",
    "ucdavis": "universityofcaliforniadavis",
    "ucla": "universityofcalifornialosangeles",
    "ucberkeley": "universityofcaliforniaberkeley",
    "wfu": "wakeforestuniversity",
    "uiuc": "universityofillinoisurbana-champaign",
    "uwmadison": "universityofwisconsinmadison",
    "uw": "universityofwashington",
    "ut-austin": "universityoftexasataustin",
    "utaustin": "universityoftexasataustin",
    "gt": "georgiainstituteoftechnology",
    "gatech": "georgiainstituteoftechnology",
    "bc": "bostoncollege",
    "bu": "bostonuniversity",
    "osu": "theohiostateuniversity",
    "ohiostate": "theohiostateuniversity",
    "purdue": "purdueuniversity",
    "umd": "universityofmarylandcollegepark",
    "uga": "universityofgeorgia",
    "fsu": "floridastateuniversity",
    "wm": "williamandmary",
    "williammary": "williamandmary",
    "cwru": "casewesternreserveuniversity",
    "neu": "northeasternuniversity",
    "umassamherst": "universityofmassachusettsamherst",
    "pennstate": "pennsylvaniastateuniversityuniversitypark",
    "pitt": "universityofpittsburgh",
    "rpi": "rensselaerpolytechnicinstitute",
    "uconn": "universityofconnecticut",
    "gwu": "georgewashingtonuniversity",
    "williams": "williamscollege",
    "amherst": "amherstcollege",
    "swarthmore": "swarthmorecollege",
    "bowdoin": "bowdoincollege",
    "usna": "unitedstatesnavalacademy",
    "pomona": "pomonacollege",
    "wellesley": "wellesleycollege",
    "carleton": "carletoncollege",
    "cmc": "claremontmckennacollege",
    "usma": "unitedstatesmilitaryacademyatwestpoint",
    "barnard": "barnardcollege",
    "middlebury": "middleburycollege",
    "grinnell": "grinnellcollege",
    "hamilton": "hamiltoncollege",
    "haverford": "haverfordcollege",
    "colby": "colbycollege",
    "wl": "washingtonandleeuniversity",
    "wlu": "washingtonandleeuniversity",
    "wesleyan": "wesleyanuniversity",
    "davidson": "davidsoncollege",
    "vassar": "vassarcollege",
    "smith": "smithcollege",
    "bates": "batescollege",
    "colgate": "colgateuniversity",
    "richmond": "universityofrichmond",
    "macalester": "macalestercollege",
    "brynmawr": "brynmawrcollege",
    "kenyon": "kenyoncollege",
    "scripps": "scrippscollege",
    "soka": "sokauniversityofamerica",
    "oberlin": "oberlincollege",
    "bucknell": "bucknelluniversity",
    "lafayette": "lafayettecollege",
    "mount-holyoke": "mountholyokecollege",
    "mountholyoke": "mountholyokecollege",
    "skidmore": "skidmorecollege",
    "trinity": "trinitycollege",
    "usafa": "unitedstatesairforceacademy",
    "fandm": "franklinandmarshallcollege",
    "franklinandmarshall": "franklinandmarshallcollege",
    "denison": "denisonuniversity",
    "pitzer": "pitzercollege",
    "bard": "bardcollege",
    "occidental": "occidentalcollege",
    "union": "unioncollege",
    "whitman": "whitmancollege",
    "connecticut": "connecticutcollege",
    "sewanee": "theuniversityofthesouth",
    "depauw": "depauwuniversity",
    "centre": "centrecollege",
    "earlham": "earlhamcollege",
    "lawrence": "lawrenceuniversity",
    "stjohns": "stjohnscollege",
    "furman": "furmanuniversity",
}


@dataclass
class DocRecord:
    category: str
    rank: str
    school: str
    score: str
    tier: str
    basis: str


@dataclass
class DataRecord:
    index: int
    category: str
    rank: str
    name: str
    key: str


def normalize(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def english_part(value):
    parts = re.findall(r"[A-Za-z][A-Za-z .&'()\-/]*", value)
    return " ".join(part.strip() for part in parts if part.strip())


def canonical_key(value):
    key = normalize(value)
    return ALIASES.get(key, key)


def parse_markdown_records(lines):
    records = []
    category = ""
    for index, line in enumerate(lines):
        if line.startswith("## \u7efc\u5408\u6027\u5927\u5b66"):
            category = "university"
            continue
        if line.startswith("## \u6587\u7406\u5b66\u9662"):
            category = "liberal-arts"
            continue
        match = re.match(r"^####\s+#(\S+)\s+(.+?)\s*$", line)
        if match and category:
            records.append(
                DataRecord(
                    index=index,
                    category=category,
                    rank=match.group(1),
                    name=match.group(2),
                    key=canonical_key(english_part(match.group(2))),
                )
            )
    return records


def extract_docx_records(path):
    doc = Document(path)
    records = []
    for table_index, category in ((1, "university"), (2, "liberal-arts")):
        for row in doc.tables[table_index].rows[1:]:
            cells = [cell.text.strip() for cell in row.cells]
            if len(cells) < 5 or not cells[1]:
                continue
            records.append(
                DocRecord(
                    category=category,
                    rank=cells[0],
                    school=cells[1],
                    score=cells[2],
                    tier=cells[3],
                    basis=cells[4].replace("\n", " ").strip(),
                )
            )
    return records


def match_record(data_record, doc_records):
    candidates = []
    for doc_record in doc_records:
        if doc_record.category != data_record.category:
            continue
        doc_key = canonical_key(doc_record.school)
        if data_record.key == doc_key:
            score = 1.0
        elif (
            len(data_record.key) >= 5
            and len(doc_key) >= 5
            and (data_record.key in doc_key or doc_key in data_record.key)
        ):
            score = 0.95
        else:
            score = SequenceMatcher(None, data_record.key, doc_key).ratio()
        candidates.append((score, doc_record))
    if not candidates:
        return None, 0.0
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1], candidates[0][0]


def build_friendliness_line(doc_record):
    return (
        f"{FIELD_PREFIX}{doc_record.score} / 10\uff08{doc_record.tier}\uff09\u3002"
        f"\u6807\u6ce8\u4f9d\u636e\uff1a{doc_record.basis}"
    )


def remove_existing_friendliness(lines):
    return [line for line in lines if not line.startswith(FIELD_PREFIX)]


def apply_import(markdown_path, docx_path, dry_run):
    original_lines = open(markdown_path, encoding="utf-8").read().splitlines()
    lines = remove_existing_friendliness(original_lines)
    data_records = parse_markdown_records(lines)
    doc_records = extract_docx_records(docx_path)

    inserts = {}
    unmatched = []
    low_confidence = []
    for data_record in data_records:
        doc_record, score = match_record(data_record, doc_records)
        if not doc_record or score < 0.88:
            unmatched.append((data_record, doc_record, score))
            continue
        if score < 0.9:
            low_confidence.append((data_record, doc_record, score))
        inserts[data_record.index] = build_friendliness_line(doc_record)

    output = []
    for index, line in enumerate(lines):
        output.append(line)
        if index in inserts:
            output.append("")
            output.append(inserts[index])

    if not dry_run:
        with open(markdown_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(output) + "\n")

    print(f"data records: {len(data_records)}")
    print(f"docx records: {len(doc_records)}")
    print(f"inserted: {len(inserts)}")
    print(f"unmatched: {len(unmatched)}")
    print(f"low confidence: {len(low_confidence)}")
    for data_record, doc_record, score in unmatched:
        best = doc_record.school if doc_record else ""
        print(f"UNMATCHED {data_record.category} #{data_record.rank} {data_record.name} best={score:.2f} {best}")
    for data_record, doc_record, score in low_confidence:
        print(f"LOW {score:.2f} {data_record.name} -> {doc_record.school}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("docx_path")
    parser.add_argument("--markdown", default="data/schools.md")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    apply_import(args.markdown, args.docx_path, args.dry_run)


if __name__ == "__main__":
    main()
