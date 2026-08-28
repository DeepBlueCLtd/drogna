#!/usr/bin/env python3
"""Site gate: the landing page says what drogna is, and says it first (FR-003, SRD FR-01).

SRD FR-01 asks the landing page to "state plainly that this is a learning harness with
synthetic data and fake numerics, so no viewer mistakes it for a candidate system". The
clause after the comma is the requirement. A disclaimer three screens down is not a
disclaimer; a viewer forms their impression from what they read first, and this is the one
page whose whole job is to stop somebody taking the site for a real system.

Until this gate existed the property was a grep in `.github/workflows/pages.yml` for three
words anywhere in the built `index.html`. That is the presence half, and the presence half
is the half that was never in danger. Nothing checked the ordering, so moving the statement
below a section of prose — or below a screenshot, or a table of contents — would have
published and said nothing.

**The rule.** In the built landing page's ``<article>``, the first element after the page
heading must carry every required phrase.

Two scoping decisions come with it:

- **The heading may come first.** A page's own title is not content in the sense the
  requirement means; failing a page because its ``<h1>`` precedes the statement would be
  failing it for the shape every page on the site has.
- **One element, not a character budget.** "Before any other content" is read as "nothing
  else is first", which the document's own structure already answers. A budget — the first
  N characters, the first two paragraphs — would be a number typed into a gate, and this
  repository has learnt to prefer a bound that comes from something on disk. The statement
  currently lives in one admonition, so the admonition is the element; were it moved into a
  leading paragraph, that paragraph would be.

**The phrases are declared here and checked back against the requirement.** Restating a
requirement inside its own gate is how the two drift apart, so :data:`REQUIRED` is verified
against FR-01's text in ``harness-srd.md`` on every run. If somebody rewords the
requirement, this gate says the requirement no longer says what it is checking for, rather
than going on quietly enforcing the old wording — which is the failure it would otherwise
be an instance of.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

GATE = "landing-page"
GATES = Path(__file__).resolve().parent
REPO_ROOT = GATES.parents[1]
DEFAULT_REQUIREMENTS = REPO_ROOT / "harness-srd.md"

EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN = 0, 1, 2

# What MkDocs emits for the site root. It is the shape of the build output rather than a
# deployment location: nothing configures it and nothing could serve the site without it.
LANDING_PAGE = "index.html"  # harness:allow-literal-path the shape MkDocs emits, not a location

# The phrases FR-01 uses, in the order it uses them. Each is checked against FR-01's own
# text below, so this list cannot quietly become a second opinion about the requirement.
REQUIRED: tuple[str, ...] = ("learning harness", "synthetic", "fake")

# FR-01's bullet, however far it wraps: from the marker to the blank line that ends it.
FR_01 = re.compile(r"^-\s+\*\*FR-01\*\*(?P<text>.*?)(?=\n\s*\n)", re.MULTILINE | re.DOTALL)

# Elements that never have a closing tag, so depth must not be incremented for them.
VOID = frozenset(
    (
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    )
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int | str
    rule: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.rule}: {self.message}"


@dataclass
class Element:
    """One top-level child of the article, and the text it contains."""

    tag: str
    text: str = ""


class Article(HTMLParser):
    """The article's immediate children, in document order, with their text.

    Written rather than borrowed because the property under test is positional: it is not
    enough to know that a phrase is somewhere in the page, and a regular expression that
    tried to answer "which element is this in" would be answering it by accident.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.children: list[Element] = field(default_factory=list)  # type: ignore[assignment]
        self.children = []
        self._in_article = False
        self._depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in VOID:
            return
        if not self._in_article:
            if tag == "article":
                self._in_article = True
            return
        if self._depth == 0:
            self.children.append(Element(tag))
        self._depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID or not self._in_article:
            return
        if self._depth == 0:
            if tag == "article":
                self._in_article = False
            return
        self._depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_article and self.children and self._depth > 0:
            self.children[-1].text += data


def normalised(text: str) -> str:
    """Lower case with runs of whitespace collapsed, because the source is hard-wrapped."""
    return re.sub(r"\s+", " ", text).strip().lower()


def requirement_text(requirements: Path) -> str:
    """FR-01 as the requirements document states it."""
    found = FR_01.search(requirements.read_text(encoding="utf-8"))
    if found is None:
        raise LookupError(f"no FR-01 bullet in {requirements}")
    return normalised(found.group("text"))


def check_against_the_requirement(requirements: Path, source: str) -> list[Finding]:
    """Every phrase this gate looks for is still a phrase FR-01 uses."""
    stated = requirement_text(requirements)
    return [
        Finding(
            source,
            "-",
            "requirement-drift",
            f"this gate looks for {phrase!r} on the landing page, and FR-01 no longer "
            "uses that phrase; re-read the requirement before changing the page",
        )
        for phrase in REQUIRED
        if phrase not in stated
    ]


def check_landing_page(site: Path) -> list[Finding]:
    page = site / LANDING_PAGE
    if not page.is_file():
        return [
            Finding(
                LANDING_PAGE,
                "-",
                "landing-page-missing",
                f"the built site at {site} has no landing page, so FR-01's statement "
                "cannot be on it",
            )
        ]

    parser = Article()
    parser.feed(page.read_text(encoding="utf-8"))
    children = parser.children
    if not children:
        return [
            Finding(
                LANDING_PAGE,
                "-",
                "landing-page-empty",
                "the landing page has no article content this gate can read",
            )
        ]

    whole = normalised(" ".join(child.text for child in children))
    absent = [phrase for phrase in REQUIRED if phrase not in whole]
    if absent:
        return [
            Finding(
                LANDING_PAGE,
                "-",
                "statement-absent",
                f"the landing page never says {phrase!r}, which FR-01 requires of it",
            )
            for phrase in absent
        ]

    # The heading may come first; the statement must be in the element after it.
    rest = children[1:] if children[0].tag.startswith("h") else children
    if not rest:
        return [
            Finding(
                LANDING_PAGE,
                "-",
                "statement-not-first",
                "the landing page is a heading and nothing else",
            )
        ]

    first = normalised(rest[0].text)
    late = [phrase for phrase in REQUIRED if phrase not in first]
    if not late:
        return []
    return [
        Finding(
            LANDING_PAGE,
            "-",
            "statement-not-first",
            f"{phrase!r} appears on the landing page but not in its first element "
            f"(<{rest[0].tag}>); FR-01 asks the statement to come before anything a "
            "viewer would read first",
        )
        for phrase in late
    ]


def run(site: Path, requirements: Path, repo_root: Path) -> list[Finding]:
    source = (
        requirements.relative_to(repo_root).as_posix()
        if requirements.is_relative_to(repo_root)
        else str(requirements)
    )
    return check_against_the_requirement(requirements, source) + check_landing_page(site)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path, help="the built site")
    parser.add_argument(
        "--requirements",
        type=Path,
        default=DEFAULT_REQUIREMENTS,
        help="the requirements document FR-01 is read from",
    )
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args(argv)

    if not args.site.is_dir():
        print(f"{GATE}: cannot run: no built site at {args.site}", file=sys.stderr)
        return EXIT_CANNOT_RUN
    if not args.requirements.is_file():
        print(
            f"{GATE}: cannot run: no requirements document at {args.requirements}, so the "
            "phrases this gate looks for cannot be checked against FR-01",
            file=sys.stderr,
        )
        return EXIT_CANNOT_RUN

    try:
        findings = run(args.site, args.requirements, args.repo_root)
    except LookupError as error:
        print(f"{GATE}: cannot run: {error}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    for finding in findings:
        print(finding, file=sys.stderr)
    print(f"{GATE}: {len(findings)} findings")
    return EXIT_FINDINGS if findings else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
