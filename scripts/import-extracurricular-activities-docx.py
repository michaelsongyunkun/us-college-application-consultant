from argparse import ArgumentParser
from pathlib import Path

from docx import Document


def default_source_path() -> Path:
    matches = sorted((Path.home() / "Desktop").glob("CommonApp_*.docx"))
    if not matches:
        raise SystemExit("No CommonApp_*.docx file found on the Desktop.")
    return matches[0]


def convert_docx_to_markdown(source: Path) -> str:
    document = Document(source)
    lines = [paragraph.text.strip() for paragraph in document.paragraphs]
    content = "\n\n".join(line for line in lines if line)
    return f"{content}\n"


def main() -> None:
    parser = ArgumentParser(description="Convert the Common App activity library DOCX into Markdown data.")
    parser.add_argument("source", nargs="?", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=Path("data/extracurricular-activities.md"))
    args = parser.parse_args()

    source = args.source or default_source_path()
    markdown = convert_docx_to_markdown(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown, encoding="utf-8")
    print(f"Wrote {args.output} from {source}")


if __name__ == "__main__":
    main()
