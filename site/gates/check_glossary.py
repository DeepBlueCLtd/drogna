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

Five scoping decisions come with it, each with its reason:

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
- **A page the site publishes verbatim from a record it did not author is out of scope
  for the second rule.** The argument is below, because it is the one most easily
  mistaken for an excuse.

Ambiguity is handled by declared phrases rather than by weakening the match.
``front matter``, ``coverage table`` and ``in front of`` are the glossary's words in a
different sense, and they are listed in :data:`TERMS` beside the term they belong to —
one place a reviewer can read — rather than by markers scattered through the pages.

A declared phrase excludes the occurrence it matches and nothing else, which is right for
``front matter`` — a page may discuss both front matter and an ocean front, a sentence
apart. It is wrong for a page whose *subject* is the other sense. ``profile`` is the case
that forced the distinction: one blog entry is about Compose profiles, names them as such
once, and then says ``profile`` six more times meaning what it established. Excluding
those six by quoting the entry's wording would be a per-page dodge written to look like a
declaration, and linking any of them to the glossary would send a reader after a vertical
profile of the water column. So a phrase may instead be declared in
``Term.establishes_other_sense``: it excludes its own occurrence *and* the term's bare
uses after it on that page. Three properties keep it from being a way out of a finding:

- It is opt-in per phrase. ``front matter`` is not one, so a genuine ``front`` after it
  is still a finding — the control the existing tests already assert.
- It suppresses only what follows it. A use before the phrase is checked as ever.
- Its blind spot is real, is named here, and is printed on every run: a page that
  establishes the other sense and *then* uses the glossary's sense is not checked for
  that term past that point. It is a debt, not an exemption, and the printed line names
  the page and the phrase so that it can be argued with.

Pages the site does not author
------------------------------

The build publishes the repository's decision records: ``site/hooks/publish_adrs.py``
reads ``docs/adr/`` and emits one page per record plus an index, and the records are
reproduced **verbatim** — nothing is written back into the site source, so there is no
page anyone could edit instead of the record. On the first run of this gate against the
real site, twelve of its thirty-three findings were on those pages.

They are out of scope for the first-use rule, and the reason is not that they were
inconvenient to fix. It is that there is nowhere to make the fix that is not the record
itself. A decision record is a historical document: it says what was decided, when, and
what was rejected, and it is cited by number. Editing thirteen of them to carry links to
a glossary on a site that did not exist when most of them were written would change the
record in order to satisfy a presentation rule of the thing quoting it, and the reason
those pages are worth publishing at all is that they are the record rather than a
retelling of it. The first-use rule is a rule about pages this project writes for
readers of this site; it cannot bind prose written for a different purpose and
reproduced under a note saying where it came from.

What is given up is real and should be said: a reader who arrives at a record from a
search engine meets ``decorrelation timescale`` with no way to its definition. The
remedy that does not touch the records is for the publishing hook to render a glossary
pointer alongside the note it already renders under each record's heading. That is a
change to the hook and to nobody's record, and it is left open rather than done here.

The exclusion is computed, never listed, so that widening it costs something:

- :func:`generated_record_pages` reads ``adrs`` from the documentation manifest —
  ``published``, ``source`` and ``destination``, the same entry ``check_adr.py`` and the
  hook read. No manifest, or ``published: false``, and **nothing** is excluded.
- It then matches built pages against the record files actually on disk. A page is out
  of scope only if a record of that name exists in the manifest's ``source`` directory.
  Adding a page to the exclusion therefore means adding a decision record, which is an
  act nobody performs by accident.
- The premise — that the site authors nothing in that area — is checked rather than
  assumed. If the directory holding the record pages contains any other page, the
  exclusion does not apply at all and the gate says why. A hand-written page smuggled in
  beside the records does not inherit their exemption; it takes the exemption away.
- Whatever it excluded is printed on every run, in the same spirit in which
  ``check_blog.py`` prints its screenshot allowances: an exclusion nobody can see is an
  exemption, and an exclusion printed on every run is a scope a reviewer can dispute.

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

# Not findings. Two things the gate did rather than two things it found, printed on every
# run so that the scope of a clean run is visible in the same transcript as the run.
OTHER_SENSE = "glossary-other-sense"
NOT_AUTHORED = "glossary-not-authored-here"

REPO_ROOT = Path(__file__).resolve().parents[2]

# The name a decision record's file carries, as `publish_adrs.py` and `check_adr.py` both
# spell it. A built page is out of scope only if a file of this shape exists to have
# generated it.
RECORD_STEM = re.compile(r"^\d{4}-[a-z0-9-]+$")

BUILT_PAGE = "index" + ".html"


@dataclass(frozen=True)
class Term:
    """One concept the glossary must define, and how a page may spell it.

    ``anchor`` is the fragment identifier the definition must carry. ``forms`` are the
    spellings that count as a use of the concept in prose; the first is also the spelling
    a finding names. ``excluded`` are phrases in which a form is the same word in a
    different sense, listed here rather than exempted page by page.

    ``establishes_other_sense`` is the stronger form of ``excluded``, described in the
    module docstring: such a phrase excludes its own occurrence and governs the term's
    bare uses after it on the same page. It is for a page whose subject is the other
    sense, and it is opt-in per phrase precisely because it is capable of hiding a
    genuine use.
    """

    anchor: str
    forms: tuple[str, ...]
    excluded: tuple[str, ...] = field(default=())
    establishes_other_sense: tuple[str, ...] = field(default=())

    @property
    def not_the_term(self) -> tuple[str, ...]:
        """Every declared phrase in which a form is not this concept."""
        return self.excluded + self.establishes_other_sense


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
    # A Compose profile decides which services start; it is not a vertical profile. The
    # deployment entry names them once and then abbreviates, which is what the second
    # form is for: see the module docstring, and the line the gate prints for it.
    Term(
        "profile",
        ("profile", "profiles"),
        establishes_other_sense=("compose profile", "compose profiles"),
    ),
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


def _other_sense(text: str, term: Term) -> tuple[int, str] | None:
    """Where the page first establishes the term's other sense, and with which phrase.

    Everything after this offset is read in that sense. Only phrases the term declares as
    sense-establishing count; an ordinary excluded phrase governs its own occurrence and
    nothing else.
    """
    earliest: tuple[int, str] | None = None
    for phrase in term.establishes_other_sense:
        match = _pattern((phrase,)).search(text)
        if match is None:
            continue
        if earliest is None or match.end() < earliest[0]:
            earliest = (match.end(), phrase)
    return earliest


def _uses(text: str, term: Term, established: int | None = None) -> int | None:
    """Offset of the first genuine use of ``term`` in ``text``, or None.

    ``established`` is the offset from which the page's own other sense governs, as
    :func:`_other_sense` found it. A use at or after it is that other sense; a use before
    it is checked exactly as it always was.
    """
    blocked = [
        (match.start(), match.end())
        for phrase in term.not_the_term
        for match in re.finditer(_pattern((phrase,)), text)
    ]
    for match in _pattern(term.forms).finditer(text):
        if any(start <= match.start() and match.end() <= end for start, end in blocked):
            continue
        if established is not None and match.start() >= established:
            return None
        return match.start()
    return None


def findings(
    root: Path,
    terms: tuple[Term, ...],
    out_of_scope: frozenset[str] = frozenset(),
) -> tuple[list[str], list[str]]:
    """Both directions, in one list, in path order — and what the gate decided not to check.

    The second list is not findings. It is the pages and terms this run read in a declared
    other sense, one line each, so that a clean run says what it did not look at.
    """
    out: list[str] = []
    notes: list[str] = []

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
        if path == glossary or relative in out_of_scope:
            continue
        reader = ArticleReader(_page_dir(relative), glossary_names)
        reader.feed(path.read_text(encoding="utf-8"))
        if not reader.prose:
            continue
        text = "".join(reader.prose)
        for term in terms:
            if term.anchor not in headings.anchors:
                continue  # already reported as undefined; do not report it twice per page
            established = _other_sense(text, term)
            first = _uses(text, term, established[0] if established else None)
            if established is not None and first is None and _uses(text, term) is not None:
                # The declared sense suppressed a use that would otherwise have been a
                # finding. That is the whole of what this mechanism can hide, so it is
                # said out loud, on the page it happened on, on every run.
                notes.append(
                    f"{relative}:-: {OTHER_SENSE}: "
                    f"{term.forms[0]!r} is read as {established[1]!r} from that phrase "
                    "onwards on this page; a use of the glossary's own sense after it "
                    "is not checked here"
                )
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
    return out, notes


def _document(manifest: Path) -> dict:
    """The manifest, or an empty mapping if there is none to read."""
    if not manifest.is_file():
        return {}
    # Imported inside the function rather than at module scope: the gate must run with
    # nothing installed when there is no manifest, and PyYAML is needed only when there is.
    try:
        import yaml
    except ModuleNotFoundError as error:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            f"{manifest} exists but PyYAML is not installed, so it cannot be read"
        ) from error
    loaded = yaml.safe_load(manifest.read_text(encoding="utf-8"))
    return loaded if isinstance(loaded, dict) else {}


def load_terms(manifest: Path) -> tuple[Term, ...]:
    """The source list, from the manifest if it declares one, otherwise from this file.

    The manifest does not exist yet (feature 015, T004). When it does and it carries a
    ``glossary:`` sequence of ``anchor``/``forms``/``excluded`` entries, that becomes the
    source list and this module's copy stops being the authority. Until then the list
    above is it, and this function says which was used by returning it either way.
    """
    declared = _document(manifest).get("glossary")
    if not declared:
        return TERMS
    return tuple(
        Term(
            anchor=str(entry["anchor"]),
            forms=tuple(str(form) for form in entry["forms"]),
            excluded=tuple(str(phrase) for phrase in entry.get("excluded", ())),
            establishes_other_sense=tuple(
                str(phrase) for phrase in entry.get("establishes_other_sense", ())
            ),
        )
        for entry in declared
    )


@dataclass(frozen=True)
class NotAuthoredHere:
    """The built pages the site publishes verbatim from records it does not author.

    ``paths`` are relative built paths out of scope for the first-use rule. ``note`` is
    what the gate prints about them, and is never empty when ``paths`` is not: an
    exclusion nobody can see is an exemption.
    """

    paths: frozenset[str] = frozenset()
    note: str = ""


def generated_record_pages(root: Path, manifest: Path, repo_root: Path) -> NotAuthoredHere:
    """The decision-record pages the build generates, read out of the manifest and the tree.

    Nothing here is a list of paths. The manifest says whether records are published and
    where they come from; the record files on disk say which pages may exist; the built
    tree says where they landed. Every one of the three has to agree before a page is out
    of scope, and the module docstring argues why these pages are.
    """
    adrs = _document(manifest).get("adrs")
    if not isinstance(adrs, dict) or not adrs.get("published"):
        return NotAuthoredHere()
    source = str(adrs.get("source") or "").strip()
    destination = str(adrs.get("destination") or "").strip().strip("/")
    if not source or not destination:
        return NotAuthoredHere()

    stems = {
        path.stem for path in (repo_root / source).glob("*.md") if RECORD_STEM.match(path.stem)
    }
    if not stems:
        return NotAuthoredHere()

    area = root / destination
    if not area.is_dir():
        return NotAuthoredHere()

    pages: dict[str, Path] = {}
    for path in sorted(area.rglob("*.html")):
        stem = path.parent.name if path.name == BUILT_PAGE else path.stem
        if stem in stems:
            pages[path.relative_to(root).as_posix()] = (
                path.parent.parent if path.name == BUILT_PAGE else path.parent
            )
    if not pages:
        return NotAuthoredHere()

    directories = set(pages.values())
    if len(directories) != 1:
        return NotAuthoredHere(
            note=f"{GATE}: {NOT_AUTHORED}: the records published from {source} are spread "
            f"across {len(directories)} directories of the build, which is not the one "
            "place this gate knows how to reason about; every page is checked"
        )
    directory = directories.pop()

    # The generated index of the records is generated from them too — it is their own
    # headings in a table — and it lives at the root of the same directory.
    index = directory / BUILT_PAGE
    excluded = set(pages)
    if index.is_file():
        excluded.add(index.relative_to(root).as_posix())

    # The premise, checked rather than assumed: the site authors nothing in there. A
    # hand-written page beside the records does not inherit their exemption. It ends it.
    intruders = sorted(
        path.relative_to(root).as_posix()
        for path in directory.rglob("*.html")
        if path.relative_to(root).as_posix() not in excluded
    )
    if intruders:
        return NotAuthoredHere(
            note=f"{GATE}: {NOT_AUTHORED}: {directory.relative_to(root).as_posix()} holds "
            f"{len(intruders)} page(s) that no record in {source} generated, starting with "
            f"{intruders[0]}, so the records there are no longer the only thing published "
            "verbatim and nothing in that directory is out of scope; every page is checked"
        )

    return NotAuthoredHere(
        paths=frozenset(excluded),
        note=f"{GATE}: {NOT_AUTHORED}: {len(excluded)} page(s) under "
        f"{directory.relative_to(root).as_posix()}/ are generated verbatim from the "
        f"{len(stems)} record(s) in {source} and are out of scope for the first-use rule; "
        "the argument is in this gate's docstring and the remedy that does not edit a "
        "record is a glossary pointer rendered by the publishing hook",
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
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT,
        help="the tree the built site was built from; the real one unless a test says otherwise",
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
        not_authored = generated_record_pages(root, arguments.manifest, arguments.repo_root)
    except RuntimeError as error:
        print(f"{GATE}: cannot run: {error}", file=sys.stdout)
        return EXIT_CANNOT_RUN

    found, notes = findings(root, terms, not_authored.paths)
    # What the run did not look at is printed before what it found, so that a clean run
    # and a dirty one both say what their scope was.
    if not_authored.note:
        print(not_authored.note)
    for line in notes:
        print(line)
    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return EXIT_FINDINGS if found else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
