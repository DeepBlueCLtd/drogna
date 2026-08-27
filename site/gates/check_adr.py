"""Site gate: the decision records are published as the manifest says, and settled.

Three things are checked.

**The decision is the manifest's, not the build's.** Whether the records are published
is an explicit entry in ``docs/manifest.yaml`` (FR-021). This gate reads that entry
rather than assuming, and asserts the built site agrees with it in both directions: if
the manifest says published, every record has a page; if it says not, no record has one.
Without the manifest the gate cannot know what to assert, so it exits 2 and says so
rather than passing.

**The index is complete and its statuses come from the records.** Every record appears
on the published index with the status written in the record itself. The gate reads the
statuses from ``docs/adr/`` for itself, so a hand-typed list that has drifted is caught.

**No published page carries a standing open-questions list** (FR-022, SC-010). The
project's discipline is that a question is raised where it arises and struck when it is
answered, the answer landing in a requirement or a record; a list of open questions on a
public page is a note that will go stale and be read as current. The rule is applied to
every published page, not only to the records.

Run it against a built site::

    python site/gates/check_adr.py --site site/build

Exit codes: 0 no findings, 1 findings, 2 could not run, with the reason named.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError as error:  # pragma: no cover - exercised by hand, not in CI
    print(f"adr: cannot run: {error.name} is not installed", file=sys.stderr)
    raise SystemExit(2) from error

GATE = "adr"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2

REPO_ROOT = Path(__file__).resolve().parents[2]
# harness:allow-literal-path the manifest this gate reads; not a component location
DEFAULT_MANIFEST = REPO_ROOT / "docs" / "manifest.yaml"

PUBLISHED_DIR = "decisions/adr"
BUILT_PAGE = "index" + ".html"

RECORD_STEM = re.compile(r"^(?P<number>\d{4})-(?P<slug>[a-z0-9-]+)$")
STATUS_FIELD = re.compile(r"^\*\*Status:\*\*\s*(?P<value>.+?)\s*$", re.MULTILINE)
HEADING = re.compile(r"<h[1-6][^>]*>(?P<text>.*?)</h[1-6]>", re.IGNORECASE | re.DOTALL)
TAG = re.compile(r"<[^>]+>")

# A heading that opens a standing list of questions nobody has answered yet.
OPEN_QUESTIONS = re.compile(
    r"(?<![a-z])(open (questions?|points?|issues?|problems?)|unresolved|"
    r"outstanding questions?|still (to be )?(decided|resolved)|to be decided|tbd)(?![a-z])",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int | str
    rule: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.rule}: {self.message}"


@dataclass(frozen=True)
class Record:
    number: str
    stem: str
    status: str
    source: str


def records(repo_root: Path) -> list[Record]:
    """Every decision record, with the status read from the record itself."""
    directory = repo_root / "docs" / "adr"
    if not directory.is_dir():
        raise FileNotFoundError(f"no decision records at {directory}")
    found: list[Record] = []
    for path in sorted(directory.glob("*.md")):
        stem = RECORD_STEM.match(path.stem)
        if stem is None:
            continue
        text = path.read_text(encoding="utf-8")
        status = STATUS_FIELD.search(text)
        found.append(
            Record(
                number=stem.group("number"),
                stem=path.stem,
                status=status.group("value") if status else "",
                source=path.relative_to(repo_root).as_posix(),
            )
        )
    return found


def publication_decision(manifest: Path) -> bool | None:
    """What the manifest records about publishing the records, or ``None`` if nothing.

    The entry is looked for by meaning rather than by one spelling: any key naming the
    records whose value is a boolean, or a mapping under such a key carrying a
    ``published`` boolean.
    """
    loaded = yaml.safe_load(manifest.read_text(encoding="utf-8"))

    def walk(node: object) -> bool | None:
        if not isinstance(node, dict):
            return None
        for key, value in node.items():
            name = str(key).lower()
            if "adr" in name or "decision record" in name:
                if isinstance(value, bool):
                    return value
                if isinstance(value, dict):
                    for inner, setting in value.items():
                        if str(inner).lower().startswith("publish") and isinstance(setting, bool):
                            return setting
            if str(key).lower().startswith("publish") and isinstance(value, bool):
                return value
        for value in node.values():
            found = walk(value)
            if found is not None:
                return found
        return None

    return walk(loaded)


def headings(html: str) -> list[tuple[int, str]]:
    """Every heading in a built page, with the line it is on."""
    found: list[tuple[int, str]] = []
    for match in HEADING.finditer(html):
        text = TAG.sub("", match.group("text")).replace("&para;", "").strip()
        found.append((html.count("\n", 0, match.start()) + 1, text))
    return found


def check_open_questions(site: Path, by_stem: dict[str, Record]) -> list[Finding]:
    """No published page keeps a standing list of open questions."""
    findings: list[Finding] = []
    for path in sorted(site.rglob("*.html")):
        relative = path.relative_to(site).as_posix()
        seen: set[str] = set()
        html = path.read_text(encoding="utf-8", errors="replace")
        for line, text in headings(html):
            if not OPEN_QUESTIONS.search(text) or text in seen:
                continue
            seen.add(text)
            source = by_stem.get(Path(relative).parent.name)
            where = f"; the record is {source.source}" if source else ""
            findings.append(
                Finding(
                    relative,
                    line,
                    "open-questions",
                    f"the page carries a standing open-questions list, `{text}`{where}. "
                    "A question is answered into a requirement or a record, not kept "
                    "on a page as a note",
                )
            )
    return findings


def check_published(site: Path, found: list[Record], published: bool) -> list[Finding]:
    findings: list[Finding] = []
    for record in found:
        page = site.joinpath(*PUBLISHED_DIR.split("/"), record.stem, BUILT_PAGE)
        if published and not page.is_file():
            findings.append(
                Finding(
                    record.source,
                    "-",
                    "record-not-published",
                    "the manifest records that the decision records are published, and "
                    "this one has no page in the built site",
                )
            )
        if not published and page.is_file():
            findings.append(
                Finding(
                    page.relative_to(site).as_posix(),
                    "-",
                    "published-against-decision",
                    "the manifest records that the decision records are not published, "
                    "and this page is in the built site",
                )
            )
        if not record.status:
            findings.append(
                Finding(record.source, "-", "status-unrecorded", "the record states no status")
            )
    return findings


def check_index(site: Path, found: list[Record], published: bool) -> list[Finding]:
    """Every record is on the index, with the status its own text gives."""
    if not published:
        return []
    index = site.joinpath(*PUBLISHED_DIR.split("/"), BUILT_PAGE)
    relative = index.relative_to(site).as_posix()
    if not index.is_file():
        return [
            Finding(
                relative,
                "-",
                "index-missing",
                "the records are published with no index listing them and their statuses",
            )
        ]
    html = index.read_text(encoding="utf-8", errors="replace")
    findings: list[Finding] = []
    for record in found:
        if record.stem not in html:
            findings.append(
                Finding(relative, "-", "index-incomplete", f"no entry for {record.stem}")
            )
        elif record.status and record.status not in html:
            findings.append(
                Finding(
                    relative,
                    "-",
                    "index-status",
                    f"{record.stem} is listed without the status its record gives, "
                    f"`{record.status}`",
                )
            )
    return findings


def run(site: Path, manifest: Path, repo_root: Path) -> list[Finding]:
    found = records(repo_root)
    decision = publication_decision(manifest)

    findings: list[Finding] = []
    if decision is None:
        findings.append(
            Finding(
                manifest.relative_to(repo_root).as_posix()
                if manifest.is_relative_to(repo_root)
                else str(manifest),
                "-",
                "publication-decision",
                "nothing in the manifest records whether the decision records are "
                "published, so the answer is whatever the build happened to glob",
            )
        )
    published = True if decision is None else decision

    findings.extend(check_published(site, found, published))
    findings.extend(check_index(site, found, published))
    findings.extend(check_open_questions(site, {record.stem: record for record in found}))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path, help="the built site")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT,
        help="the tree the built site was built from; the real one unless a test says otherwise",
    )
    args = parser.parse_args(argv)

    if not args.site.is_dir():
        print(f"{GATE}: cannot run: no built site at {args.site}", file=sys.stderr)
        return EXIT_CANNOT_RUN
    if not args.manifest.is_file():
        print(
            f"{GATE}: cannot run: no documentation manifest at {args.manifest}, so nothing "
            "records whether the decision records are published (FR-021)",
            file=sys.stderr,
        )
        return EXIT_CANNOT_RUN

    try:
        findings = run(args.site, args.manifest, args.repo_root)
    except FileNotFoundError as error:
        print(f"{GATE}: cannot run: {error}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    for finding in findings:
        print(finding)
    print(f"{GATE}: {len(findings)} findings")
    return EXIT_FINDINGS if findings else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
