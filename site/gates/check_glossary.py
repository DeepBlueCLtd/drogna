#!/usr/bin/env python3
"""Site gate: the glossary defines what it must, and pages link to it on first use.

FR-013 and SC-007 ask for two things and for **both directions to be reported**:

1. every term in the glossary source list has a definition, and
2. the first use of such a term on a page links to it.

The second is the one that has to be given a precise meaning before it can be a gate.
Read absolutely literally — every occurrence of every glossary word on every page must
itself be a hyperlink — it produces hundreds of findings on a site that is doing the
right thing, and a gate nobody can satisfy is a gate that gets switched off. Read too
loosely it finds nothing. The rule this gate actually enforces is stated here, in one
place, so that it is a decision rather than an accident of implementation:

**The rule.** For each page of the built site, and each term in the source list: if the
term appears in that page's own prose, then a link to the term's glossary anchor must
appear on that page **at or before** the term's first appearance in prose.

Four scoping decisions come with it, each with its reason:

- **Prose only.** Text inside ``code``, ``pre`` and headings does not count as a use, and
  neither does anything outside the page's ``article`` element. A term in a file name, a
  configuration key or a navigation entry is not the reader meeting the word.
- **The source list, not every heading.** SC-007 binds the glossary *source list* — the
  oceanographic and standards vocabulary the requirements name. The glossary carries more
  entries than that and is welcome to; a page is not required to link every one.
- **At or before, rather than exactly on.** A page that says "the coverage store" in its
  first sentence and links [coverage] in its second has served the reader. Demanding the
  very first occurrence carry the link would fail such a page for word order.
- **The glossary itself is exempt from the second rule.** It defines the terms; its
  internal cross-references are relative anchors on the same page.

Ambiguity is handled by declared phrases rather than by weakening the match.
``front matter``, ``coverage table`` and ``in front of`` are the glossary's words in a
different sense, and they are listed in :data:`TERMS` beside the term they belong to —
one place a reviewer can read — rather than by markers scattered through the pages.

Usage::

    python site/gates/check_glossary.py --site site/build [--manifest docs/manifest.yaml]

Findings go to stdout, one per line, as ``<path>:<line-or-->: <rule>: <message>``,
followed by ``glossary: N findings``. Exit 0 for none, 1 for findings, 2 when the gate
could not run — with a reason naming what is missing.
"""

from __future__ import annotations

import argparse
import posixpath
import re
import sys
import typing
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

GATE = "glossary"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2

UNDEFINED = "glossary-term-undefined"
UNLINKED = "glossary-first-use-unlinked"


@dataclass(frozen=True)
class Term:
    """One concept the glossary must define, and how a page may spell it.

    ``anchor`` is the fragment identifier the definition must carry. ``forms`` are the
    spellings that count as a use of the concept in prose; the first is also the spelling
    a finding names. ``excluded`` are phrases in which a form is the same word in a
    different sense, listed here rather than exempted page by page.
    """

    anchor: str
    forms: tuple[str, ...]
    excluded: tuple[str, ...] = field(default=())


# The source list, seeded from the oceanographic and standards vocabulary the requirements
# name (SRD §3.1, §5.3, §5.5; feature 015 task T027). It is declared here, and not read
# back out of the glossary, because a list derived from the page it checks would make the
# first rule vacuous: a term nobody defined would simply not be on the list.
TERMS: tuple[Term, ...] = (
    Term("sound-speed", ("sound speed",)),
    Term("thermocline", ("thermocline", "thermoclines")),
    Term(
        "front",
        ("front", "fronts"),
        excluded=("front matter", "in front of", "up front", "front end", "front of the"),
    ),
    Term("mesoscale-eddy", ("mesoscale eddy", "mesoscale eddies")),
    Term("decorrelation-timescale", ("decorrelation timescale", "decorrelation timescales")),
    Term("ensemble-spread", ("ensemble spread",)),
    Term("persistence-forecast", ("persistence forecast", "persistence reference")),
    Term("advection", ("advection",)),
    Term(
        "coverage",
        ("coverage", "coverages"),
        # "coverage" is also the ordinary software word for how much of a thing a check
        # reaches, and it names three components. Neither is the glossary's sense.
        excluded=(
            "coverage table",
            "coverage of features",
            "test coverage",
            "coverage test",
            "registry coverage",
            "subsystem coverage",
            "coverage store",
            "coverage output",
            "coverage read",
            "coverage catalogue",
        ),
    ),
    Term("trajectory", ("trajectory", "trajectories")),
    # A Compose profile decides which services start; it is not a vertical profile.
    Term("profile", ("profile", "profiles"), excluded=("compose profile", "compose profiles")),
    Term(
        "discrete-sampling-geometry",
        ("discrete sampling geometry", "discrete sampling geometries"),
    ),
    Term("orienteering", ("orienteering",)),
    Term("h3", ("h3",)),
)

_BEFORE = r"(?<![A-Za-z0-9])"
_AFTER = r"(?![A-Za-z0-9])"


def _spaced(form: str) -> str:
    """A form's pattern, with each space matching any run of whitespace.

    Source markdown is hard-wrapped, so a two-word term is as likely to arrive split
    across a line as not. A pattern with a literal space in it silently misses half the
    uses of every multi-word term on the list, which is the quietest way for a gate like
    this one to report clean.
    """
    return r"\s+".join(re.escape(word) for word in form.split())


def _pattern(forms: tuple[str, ...]) -> re.Pattern[str]:
    ordered = sorted(forms, key=len, reverse=True)
    body = "|".join(_spaced(form) for form in ordered)
    return re.compile(_BEFORE + "(?:" + body + ")" + _AFTER, re.IGNORECASE)


class ArticleReader(HTMLParser):
    """Collect a built page's prose, its glossary links, and where each of them starts.

    Only the ``article`` element is read. Everything outside it — the header, the two
    navigation columns, the search dialogue and the footer — is theme chrome that repeats
    on every page, and counting a navigation entry as a use of a term would fail every
    page for the sidebar.
    """

    _SKIP: typing.ClassVar[frozenset[str]] = frozenset(
        {"code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style"}
    )

    _EXCERPT_CLASS = "md-post--excerpt"

    def __init__(self, page_dir: str, glossary_paths: frozenset[str]) -> None:
        super().__init__(convert_charrefs=True)
        self._page_dir = page_dir
        self._glossary_paths = glossary_paths
        self._article_depth = 0
        self._skip_depth = 0
        self._excerpt_depth = 0
        self.prose: list[str] = []
        self._length = 0
        self.marks: list[tuple[int, int]] = [(0, 1)]
        self.links: dict[str, int] = {}

    # -- position bookkeeping -------------------------------------------------
    def _emit(self, text: str) -> None:
        self.prose.append(text)
        self._length += len(text)
        self.marks.append((self._length, self.getpos()[0]))

    def line_at(self, offset: int) -> int:
        line = 1
        for mark_offset, mark_line in self.marks:
            if mark_offset > offset:
                break
            line = mark_line
        return line

    # -- parsing --------------------------------------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "article":
            # The blog index, the archive and each category page repeat an excerpt of every
            # post. The excerpt is the post's own text, cut at a fixed point that may fall
            # before the post's glossary link, so a finding here would be a finding about
            # the aggregation rather than about anything anyone wrote. The post itself is
            # checked, on its own page, where the finding belongs.
            if self._EXCERPT_CLASS in (dict(attrs).get("class") or ""):
                self._excerpt_depth += 1
            elif self._excerpt_depth == 0:
                self._article_depth += 1
            return
        if self._article_depth == 0:
            return
        if self._skip_depth:
            if tag in self._SKIP:
                self._skip_depth += 1
            return
        if tag in self._SKIP:
            self._skip_depth = 1
            return
        if tag == "a":
            href = dict(attrs).get("href") or ""
            anchor = self._glossary_anchor(href)
            if anchor is not None:
                self.links.setdefault(anchor, self._length)

    def handle_endtag(self, tag: str) -> None:
        if tag == "article":
            if self._excerpt_depth:
                self._excerpt_depth -= 1
            else:
                self._article_depth = max(0, self._article_depth - 1)
            return
        if self._article_depth == 0:
            return
        if self._skip_depth and tag in self._SKIP:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._article_depth and not self._skip_depth and not self._excerpt_depth:
            self._emit(data)

    def _glossary_anchor(self, href: str) -> str | None:
        if "#" not in href:
            return None
        path, _, fragment = href.partition("#")
        if not fragment:
            return None
        if path in ("", "."):
            resolved = self._page_dir
        elif path.startswith(("http://", "https://", "//", "mailto:")):
            return None
        else:
            resolved = posixpath.normpath(posixpath.join(self._page_dir, path))
        if resolved in self._glossary_paths:
            return fragment.lower()
        return None


class GlossaryHeadings(HTMLParser):
    """The anchors the built glossary page actually defines."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._article_depth = 0
        self.anchors: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "article":
            self._article_depth += 1
            return
        if self._article_depth and tag in ("h2", "h3"):
            identifier = dict(attrs).get("id")
            if identifier:
                self.anchors.add(identifier.lower())

    def handle_endtag(self, tag: str) -> None:
        if tag == "article":
            self._article_depth = max(0, self._article_depth - 1)


def _page_dir(relative: str) -> str:
    """The directory a built page's relative links resolve against."""
    directory = posixpath.dirname(relative)
    return directory or "."


def _glossary_identity(relative: str) -> frozenset[str]:
    """Every spelling a link to the glossary page may normalise to.

    With directory URLs the page is ``glossary/index.html`` and a link to it is written
    ``../glossary/``, which normalises to ``glossary``. Without them it is
    ``glossary.html``. Both are accepted so the gate does not depend on that setting.
    """
    directory = posixpath.dirname(relative)
    names = {relative}
    # harness:allow-literal-path the shape MkDocs emits, not a deployment location
    if posixpath.basename(relative) == "index.html":
        names.add(directory)
        names.add(directory + "/")
    else:
        names.add(posixpath.splitext(relative)[0])
    return frozenset(names)


def find_glossary(root: Path) -> Path | None:
    """Where the glossary lands in the build, under either URL style."""
    # harness:allow-literal-path the two names MkDocs gives one source page, not a location
    for candidate in (root / "glossary" / "index.html", root / "glossary.html"):
        if candidate.is_file():
            return candidate
    return None


def _uses(text: str, term: Term) -> int | None:
    """Offset of the first genuine use of ``term`` in ``text``, or None."""
    blocked = [
        (match.start(), match.end())
        for phrase in term.excluded
        for match in re.finditer(_pattern((phrase,)), text)
    ]
    for match in _pattern(term.forms).finditer(text):
        if any(start <= match.start() and match.end() <= end for start, end in blocked):
            continue
        return match.start()
    return None


def findings(root: Path, terms: tuple[Term, ...]) -> list[str]:
    """Both directions, in one list, in path order."""
    out: list[str] = []

    glossary = find_glossary(root)
    if glossary is None:  # pragma: no cover - handled as exit 2 by main
        raise FileNotFoundError("glossary page")
    glossary_relative = glossary.relative_to(root).as_posix()
    glossary_names = _glossary_identity(glossary_relative)

    headings = GlossaryHeadings()
    headings.feed(glossary.read_text(encoding="utf-8"))
    for term in terms:
        if term.anchor not in headings.anchors:
            out.append(
                f"{glossary_relative}:-: {UNDEFINED}: "
                f"{term.forms[0]!r} is in the glossary source list and this page defines no "
                f"'#{term.anchor}' anchor for it"
            )

    for path in sorted(root.rglob("*.html")):
        relative = path.relative_to(root).as_posix()
        if path == glossary:
            continue
        reader = ArticleReader(_page_dir(relative), glossary_names)
        reader.feed(path.read_text(encoding="utf-8"))
        if not reader.prose:
            continue
        text = "".join(reader.prose)
        for term in terms:
            if term.anchor not in headings.anchors:
                continue  # already reported as undefined; do not report it twice per page
            first = _uses(text, term)
            if first is None:
                continue
            linked = reader.links.get(term.anchor)
            if linked is not None and linked <= first:
                continue
            line = reader.line_at(first)
            if linked is None:
                out.append(
                    f"{relative}:{line}: {UNLINKED}: "
                    f"{term.forms[0]!r} is used here and this page never links it to "
                    f"the glossary (#{term.anchor})"
                )
            else:
                out.append(
                    f"{relative}:{line}: {UNLINKED}: "
                    f"{term.forms[0]!r} is used here before the page's link to "
                    f"#{term.anchor}; the first use is the one that has to link"
                )
    return out


def load_terms(manifest: Path) -> tuple[Term, ...]:
    """The source list, from the manifest if it declares one, otherwise from this file.

    The manifest does not exist yet (feature 015, T004). When it does and it carries a
    ``glossary:`` sequence of ``anchor``/``forms``/``excluded`` entries, that becomes the
    source list and this module's copy stops being the authority. Until then the list
    above is it, and this function says which was used by returning it either way.
    """
    if not manifest.is_file():
        return TERMS
    # Imported inside the function rather than at module scope: the gate must run with
    # nothing installed when there is no manifest, and PyYAML is needed only when there is.
    try:
        import yaml
    except ModuleNotFoundError as error:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            f"{manifest} exists but PyYAML is not installed, so its glossary list cannot be read"
        ) from error
    document = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
    declared = document.get("glossary")
    if not declared:
        return TERMS
    return tuple(
        Term(
            anchor=str(entry["anchor"]),
            forms=tuple(str(form) for form in entry["forms"]),
            excluded=tuple(str(phrase) for phrase in entry.get("excluded", ())),
        )
        for entry in declared
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path, help="the built site")
    parser.add_argument(
        "--manifest",
        type=Path,
        # harness:allow-literal-path the gate runner's contract fixes this default
        default=Path("docs") / "manifest.yaml",
        help="the documentation manifest, if one exists",
    )
    arguments = parser.parse_args(argv)

    root: Path = arguments.site
    if not root.is_dir():
        print(f"{GATE}: cannot run: no built site at {root}", file=sys.stdout)
        return EXIT_CANNOT_RUN
    if find_glossary(root) is None:
        print(
            f"{GATE}: cannot run: the built site at {root} carries no glossary page "
            "(glossary/index.html or glossary.html)",
            file=sys.stdout,
        )
        return EXIT_CANNOT_RUN
    try:
        terms = load_terms(arguments.manifest)
    except RuntimeError as error:
        print(f"{GATE}: cannot run: {error}", file=sys.stdout)
        return EXIT_CANNOT_RUN

    found = findings(root, terms)
    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return EXIT_FINDINGS if found else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
