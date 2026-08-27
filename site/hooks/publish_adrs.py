"""Publish the repository's decision records into the site, at build time.

The records live in ``docs/adr/``. They are not copied into ``site/docs/``, and the
reason is the one this repository has already paid for once: two copies of a document
drift, and the drifted one is the copy the public reads. So the build reads the records
where they live and emits the pages into the built tree only. Nothing is written back
into the source tree, so there is no file anyone could mistake for a hand-written page,
and no copy anyone could edit instead of the record.

The mechanism is MkDocs' own ``hooks`` configuration key, which needs no plugin and
therefore no addition to the fully pinned ``site/requirements.txt``.

Whether the records are published at all is not this file's decision. It is the entry
``adrs.published`` in ``docs/manifest.yaml`` (FR-021), and the hook reads it: publishing
is a recorded decision rather than a consequence of which files the build globbed. When
the answer is no — or when there is no manifest to ask — the index page is still built,
and says so, so that the navigation stays whole and the decision stays visible.

Two pages come out of it:

* one page per record, at ``decisions/adr/<number>-<slug>/``, carrying the record
  verbatim with a note under its heading saying where it came from;
* an index at ``decisions/adr/``, listing every record with the status **read from the
  record itself**. Nobody retypes thirteen statuses into a table that then goes stale.

The record pages are marked ``NOT_IN_NAV``: the index is the way in, and the navigation
in ``mkdocs.yml`` names one page rather than thirteen, so adding a record is not an edit
to the site configuration.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml
from mkdocs.structure.files import File, InclusionLevel

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORDS_DIR = REPO_ROOT.joinpath("docs", "adr")
# harness:allow-literal-path the manifest this hook reads; not a component location
MANIFEST = REPO_ROOT.joinpath("docs", "manifest.yaml")

# Where the records appear in the built site. `site/docs/decisions/` holds hand-written
# pages about decisions; the records are published beneath it.
PUBLISHED_DIR = "decisions/adr"
INDEX_URI = "/".join((PUBLISHED_DIR, "index.md"))

HEADING = re.compile(r"^#\s+(?P<title>.+?)\s*$", re.MULTILINE)
FIELD = re.compile(r"^\*\*(?P<name>[A-Za-z][A-Za-z ]*):\*\*\s*(?P<value>.+?)\s*$", re.MULTILINE)
RECORD_STEM = re.compile(r"^(?P<number>\d{4})-(?P<slug>[a-z0-9-]+)$")
# The record's own heading opens with its number, which the index already has a column for.
NUMBER_PREFIX = re.compile(r"^ADR-\d+:\s*")

STATUS_UNRECORDED = "unrecorded"
DATE_UNRECORDED = "unrecorded"


@dataclass(frozen=True)
class Record:
    """One decision record, as read from its own text."""

    number: str
    stem: str
    title: str
    status: str
    date: str
    text: str

    @property
    def uri(self) -> str:
        return f"{PUBLISHED_DIR}/{self.stem}.md"


def _field(text: str, name: str, default: str) -> str:
    for match in FIELD.finditer(text):
        if match.group("name").strip().lower() == name:
            return match.group("value").strip()
    return default


def _title(text: str, fallback: str) -> str:
    match = HEADING.search(text)
    if match is None:
        return fallback
    return NUMBER_PREFIX.sub("", match.group("title").strip())


def read_records(records_dir: Path = RECORDS_DIR) -> list[Record]:
    """Every record under ``records_dir``, in number order.

    A file whose name is not ``NNNN-slug.md`` is not a record — ``README.md`` is the
    only one today — and is left where it is.
    """
    records: list[Record] = []
    for path in sorted(records_dir.glob("*.md")):
        stem = RECORD_STEM.match(path.stem)
        if stem is None:
            continue
        text = path.read_text(encoding="utf-8")
        records.append(
            Record(
                number=stem.group("number"),
                stem=path.stem,
                title=_title(text, fallback=path.stem),
                status=_field(text, "status", STATUS_UNRECORDED),
                date=_field(text, "date", DATE_UNRECORDED),
                text=text,
            )
        )
    return records


def record_page(record: Record) -> str:
    """The record, with a note under its heading saying where it is published from."""
    note = (
        '!!! info "Published from the repository\'s decision record"\n\n'
        f"    This page is generated at build time from `docs/adr/{record.stem}.md`.\n"
        "    The record is the original; this is a rendering of it, and editing the\n"
        "    built page would change nothing.\n"
    )
    match = HEADING.search(record.text)
    if match is None:
        return f"{note}\n{record.text}"
    cut = match.end()
    return f"{record.text[:cut]}\n\n{note}{record.text[cut:]}"


def publication_decision(manifest: Path = MANIFEST) -> bool | None:
    """What ``docs/manifest.yaml`` records about publishing the records.

    ``None`` means the question is not recorded, which is not the same answer as no —
    and the gate reports the difference.
    """
    if not manifest.is_file():
        return None
    loaded = yaml.safe_load(manifest.read_text(encoding="utf-8"))
    entry = loaded.get("adrs") if isinstance(loaded, dict) else None
    if isinstance(entry, dict) and isinstance(entry.get("published"), bool):
        return entry["published"]
    return None


def index_page(records: list[Record], published: bool | None) -> str:
    """The index, whose statuses are read from the records rather than retyped."""
    if published is not True:
        withheld = (
            "not published, which `docs/manifest.yaml` records as a decision"
            if published is False
            else "not published: nothing in `docs/manifest.yaml` records the decision "
            "either way, and a build does not get to make it"
        )
        return (
            "---\n"
            "title: Architecture decision records\n"
            "---\n\n"
            "# Architecture decision records\n\n"
            f"The project keeps {len(records)} decision records. They are {withheld}.\n"
        )

    rows = "\n".join(
        f"| [{record.number}]({record.stem}.md) | {record.title} "
        f"| {record.status} | {record.date} |"
        for record in records
    )
    return (
        "---\n"
        "title: Architecture decision records\n"
        "---\n\n"
        "# Architecture decision records\n\n"
        "A decision record exists for any decision that was hard to reverse, was\n"
        "genuinely contested, or rejected a plausible alternative. Routine choices do\n"
        "not earn one. Each record states the context it was decided in, the decision,\n"
        "and what the decision costs. A record that has been overtaken is marked\n"
        "superseded and kept, never deleted, because the reasoning is the point.\n\n"
        f"There are {len(records)} of them. The table below is generated at build time\n"
        "from the records themselves, so a status here cannot disagree with the status\n"
        "in the record it names.\n\n"
        "| # | Decision | Status | Date |\n"
        "|---|---|---|---|\n"
        f"{rows}\n"
    )


def on_files(files, config):  # the MkDocs hook signature
    """Add the record pages and their index to the built site."""
    records = read_records()
    published = publication_decision()
    if published is True:
        for record in records:
            files.append(
                File.generated(
                    config,
                    record.uri,
                    content=record_page(record),
                    inclusion=InclusionLevel.NOT_IN_NAV,
                )
            )
    files.append(File.generated(config, INDEX_URI, content=index_page(records, published)))
    return files
