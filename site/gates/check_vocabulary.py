#!/usr/bin/env python3
"""Site gate: nothing PR-01 forbids reaches the built artefact, images included.

The repository already polices its *source*. Nothing has ever read what the build
*emits*: the theme's stylesheets and scripts, the generated search index, the published
assets, or a single pixel of a published image. This gate reads all of it.

Run it against a built site::

    python site/gates/check_vocabulary.py --site site/build

Exit 0 with no findings, 1 with findings, 2 when it could not run — and on 2 it names
what is missing. A gate that reports "no findings" because it never looked is the exact
failure this repository has twice been burned by, so an absent OCR engine is a refusal to
run and never a pass.

Reusing the rule set rather than restating it
---------------------------------------------
The tracked-entity nouns come from :mod:`check_forbidden_vocabulary` by import —
``FORBIDDEN``, ``permitted`` and its message. Two copies of a vocabulary list drift, and
the drifted copy would be the one on the public site.

``permitted`` is applied to a window around the match rather than to the whole line. The
built tree contains documents that are one line long — a minified stylesheet, the search
index — and asking a whole-file line whether it is permitted hands a blanket pass to
every match in the file the moment one permitted phrase appears anywhere in it.

What counts as what: prose, emitted, asset, reference, image text
-----------------------------------------------------------------
A match in prose is a claim drogna makes. A match inside a minified theme script is
upstream's text. A match inside a PNG is neither: nobody writes an essay into an image, so
text found there is leaked screen content. A match in an `href` is a destination offered,
not a page's own words. Those are four different claims, so the rules are applied by zone:

===================== ===== ======= ===== ========= ==========
rule                  prose emitted asset reference image text
===================== ===== ======= ===== ========= ==========
tracked-entity        no[1] yes     yes   no[1]     yes
personal-identifier   yes   yes     yes   yes       yes
host-path             yes   yes     yes   yes       yes
address-bar           no[2] no[2]   no[2] no[2]     yes
===================== ===== ======= ===== ========= ==========

`reference` is the attributes that name somewhere — `href`, `src` and their kin — kept
apart from `prose` because a hyperlink is something PR-01 permits and an address bar is
not. It is `mailto:` that makes it worth reading at all. Attributes outside both lists are
not read: `d`, `viewBox`, `transform`. An SVG path is a run of dotted decimals, and every
page of this site carries `2.41.44.82` inside one.

[1] ``_gate_lib.GATE_EXCLUSIONS["forbidden-vocabulary"]`` excludes ``site`` from the
    source scan, and records the reason: documentation must be able to discuss the
    prohibition in order to state it. The built pages are that same prose rendered, and
    six lines of the site today are exactly that — "no tracked-entity vocabulary", "it is
    not a contact", "admits no tracked entity of any kind". Re-running the noun list over
    the rendering would re-litigate a decision already taken and recorded, and would be
    permanently red. So the ruling is inherited rather than re-argued — and inherited
    *by reading it*: :data:`SOURCE_SCAN_EXCLUDES_SITE` is computed from ``_gate_lib``, and
    ``tests/test_vocabulary.py`` fails if it is ever lifted, so the scope is revisited
    rather than silently kept. The nouns are still hunted everywhere the source scan does
    not reach, which is everything else in the table.
[2] A URL on a page is a hyperlink, which PR-01 permits (FR-007 permits outbound links to
    standards documents). A URL inside a screenshot is an address bar, which is the edge
    case the specification names.

Documents whose content *is* page prose in another encoding — the search index, the
sitemap, the blog feeds — carry the prose ruling, because they are the same words. They
are named in :data:`PROSE_DERIVED`.

Acknowledgements
----------------
:data:`ACKNOWLEDGED` is one declared list, in one place, in the shape
``check_forbidden_vocabulary.PERMITTED_PHRASES`` established: each entry carries the
reason it exists, and an entry with no reason acknowledges nothing. It holds one entry
today, and adding a second means writing down why.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

GATE = "vocabulary"

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _gate_lib import GATE_EXCLUSIONS  # noqa: E402
from check_forbidden_vocabulary import FORBIDDEN  # noqa: E402
from check_forbidden_vocabulary import MESSAGE as TRACKED_ENTITY_MESSAGE  # noqa: E402
from check_forbidden_vocabulary import permitted as permitted_english  # noqa: E402

# Read, not restated: the source-side decision this gate inherits for prose. If `site`
# ever leaves that list the documentation is being scanned for these nouns again, and the
# zone table above has to be argued afresh rather than quietly left as it is.
SOURCE_SCAN_EXCLUDES_SITE = "site" in GATE_EXCLUSIONS["forbidden-vocabulary"]

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2

PROSE = "prose"
EMITTED = "emitted"
ASSET = "asset"
REFERENCE = "reference"
IMAGE_TEXT = "image text"

TEXT_SUFFIXES = frozenset({".html", ".htm", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".svg"})
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"})
EMITTED_SUFFIXES = frozenset({".css", ".js", ".mjs"})

# Generated documents that are the pages' own words in another encoding. They carry the
# prose ruling because they *are* the prose: scanning them for the nouns would report the
# same six documentation sentences a second time, in JSON.
PROSE_DERIVED: tuple[str, ...] = (
    "search/",
    "sitemap.xml",  # harness:allow-literal-path an emitted document this gate must name
    "feed_rss_created.xml",  # harness:allow-literal-path likewise, should the blog gain a feed
    "feed_rss_updated.xml",  # harness:allow-literal-path likewise, should the blog gain a feed
)

# Attributes a reader sees, and attributes that name somewhere. Everything else — `d`,
# `class`, `viewBox`, `transform` — is machinery, and reading it is how a gate reports an
# SVG path as an IP address: `d="...2.41-3.44...2.41.44.82..."` is on every page of this
# site today. The reference attributes are collected separately because a hyperlink is
# something PR-01 permits and an address bar is not, and the two must not be one zone.
VISIBLE_ATTRIBUTES = frozenset({"alt", "title"})
REFERENCE_ATTRIBUTES = frozenset(
    {"href", "src", "srcset", "action", "formaction", "poster", "content", "data-src"}
)

# Deliberately flat. The first draft nested a quantifier inside a repeated group, which is
# how a pattern runs for hours against one 400 KB line of minified theme JavaScript — and
# the built tree is full of those. Every pattern in this module is kept nesting-free for
# that reason; an over-broad match here costs a false finding, which is visible, and
# backtracking costs a gate that never answers, which is not.
EMAIL = re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HOST_PATH = re.compile(
    r"(?:(?:/home|/Users|/root|/export/home)/[A-Za-z0-9._-]+"
    r"|[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+"
    r"|(?<![A-Za-z0-9])~/[A-Za-z0-9._-]+)"
)
ADDRESS_BAR = re.compile(
    r"(?<![A-Za-z0-9])(?:https?|ftp|file)://[A-Za-z0-9.\-]+(?::\d{2,5})?(?:/\S*)?",
    re.IGNORECASE,
)

PERSONAL_MESSAGE = (
    "personal identifier in published output; PR-01 admits no personal identifier on the "
    "site, and a published branch keeps its history"
)
HOST_PATH_MESSAGE = (
    "host path in published output; a path naming somebody's account is an access surface "
    "and PR-01 forbids it (Constitution IV names the same construct in source)"
)
ADDRESS_BAR_MESSAGE = (
    "an address bar, a window title or a location visible inside a published image; a "
    "screenshot publishes whatever was on the screen, not only its subject"
)

# Tesseract's OpenMP pool is why this gate once did not return at all. On a four-CPU box
# with other work on it, `tesseract` on the one published screenshot — 2880 by 1800 — ran
# for over 200 seconds at almost no CPU, its worker threads spinning rather than
# progressing; the same file with the pool off reads in 2. So the pool is off. The measured
# pair is written down because "it hung" is not a thing anybody can check later.
SINGLE_THREADED = {"OMP_THREAD_LIMIT": "1"}

# And a bound on top, because a fix nobody can see fail is not a fix. Whatever the reason —
# a bigger screenshot, a slower runner, an engine that wedges — this gate stops and says
# which file it gave up on. It never sits there looking like a gate still working, which is
# the one outcome worse than a finding: not 0, not 1, not even a loud 2.
OCR_DEADLINE = 120.0

# The window `permitted_english` is asked about. Wide enough to hold the phrase it looks
# for, narrow enough that a one-line document is not one permission.
CONTEXT = 120


@dataclass(frozen=True)
class Acknowledgement:
    """One accepted match, with the reason it is accepted. No reason, no acknowledgement."""

    location: str
    rule: str
    text: str
    reason: str

    @property
    def stands(self) -> bool:
        return bool(self.reason.strip())


ACKNOWLEDGED: tuple[Acknowledgement, ...] = (
    Acknowledgement(
        location="assets/javascripts/lunr/tinyseg.js",
        rule="personal-identifier",
        text="taku@chasen.org",
        reason=(
            "the address in the copyright header of the theme's vendored Japanese "
            "tokenizer. It is the upstream author's attribution, not drogna's material, "
            "and removing it from a vendored file would strip an attribution the licence "
            "requires. It is acknowledged rather than hidden: the rule still applies to "
            "every other emitted file."
        ),
    ),
)


@dataclass(frozen=True)
class Finding:
    """One hit: where it is, which rule caught it, and what it says."""

    location: str
    line: int | None
    rule: str
    zone: str
    matched: str
    message: str

    def render(self) -> str:
        where = str(self.line) if self.line is not None else "-"
        return (
            f"{self.location}:{where}: {self.rule}: {self.matched!r} in {self.zone} — "
            f"{self.message}"
        )


@dataclass(frozen=True)
class Fragment:
    """A piece of a built file, with the zone that decides which rules apply to it."""

    location: str
    line: int | None
    zone: str
    text: str


class _Split(HTMLParser):
    """Separate a built page into prose and the script and style blobs beside it.

    Attribute values are dropped apart from the handful a reader sees. That is not
    fastidiousness: Material inlines its icons as SVG, and an SVG path is a run of dotted
    decimals that any address-shaped rule reads as an IP address.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.fragments: list[tuple[int, str, str]] = []
        self._blob: str | None = None

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._blob = EMITTED
        line = self.getpos()[0]
        for name, value in attributes:
            if not value:
                continue
            if name in VISIBLE_ATTRIBUTES:
                self.fragments.append((line, PROSE, value))
            elif name in REFERENCE_ATTRIBUTES:
                self.fragments.append((line, REFERENCE, value))

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._blob = None

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.fragments.append((self.getpos()[0], self._blob or PROSE, data))

    def handle_comment(self, data: str) -> None:
        if data.strip():
            self.fragments.append((self.getpos()[0], PROSE, data))


def _zone_for(relative: str, suffix: str) -> str:
    if any(relative == name or relative.startswith(name) for name in PROSE_DERIVED):
        return PROSE
    if suffix in EMITTED_SUFFIXES:
        return EMITTED
    return ASSET


def text_fragments(path: Path, relative: str) -> Iterator[Fragment]:
    """Every readable piece of one built text file, in its zone."""
    body = path.read_text(encoding="utf-8", errors="replace")
    suffix = path.suffix.lower()
    if suffix in {".html", ".htm"}:
        split = _Split()
        split.feed(body)
        split.close()
        for line, zone, text in split.fragments:
            yield Fragment(relative, line, zone, text)
        return
    zone = _zone_for(relative, suffix)
    for number, line in enumerate(body.splitlines(), start=1):
        if line.strip():
            yield Fragment(relative, number, zone, html.unescape(line))


# OCR puts a space after a full stop, so `j.doe@example. invalid` is what a leaked address
# looks like once it has been through an engine. Matching the raw output would let exactly
# the thing this check exists for walk past, so the stop is closed up before matching. The
# raw excerpt is what gets reported.
_OCR_SENTENCE_SPACE = re.compile(r"(?<=[A-Za-z0-9])\.[ \t]+(?=[A-Za-z0-9])")


def repair_ocr(text: str) -> str:
    return _OCR_SENTENCE_SPACE.sub(".", text)


class CannotReadError(RuntimeError):
    """The images were not read: no engine, or one that did not finish. A refusal, not a pass."""


def ocr(path: Path, engine: str, deadline: float = OCR_DEADLINE) -> str:
    """Read one published image, under a bound, with the engine's thread pool disabled.

    Both of those are load-bearing and neither was there at first. See
    :data:`SINGLE_THREADED` and :data:`OCR_DEADLINE`.
    """
    environment = dict(os.environ)
    environment.update(SINGLE_THREADED)
    try:
        result = subprocess.run(
            [engine, str(path), "stdout"],
            capture_output=True,
            text=True,
            check=False,
            env=environment,
            timeout=deadline,
        )
    except subprocess.TimeoutExpired as expired:
        raise CannotReadError(
            f"{engine} did not finish reading {path.name} within {deadline:.0f}s. It is "
            "not reported clean: an image nothing could read is an image nothing checked. "
            "Shrink the image, or raise the bound deliberately"
        ) from expired
    if result.returncode != 0:
        raise CannotReadError(
            f"{engine} could not read {path.name}: {result.stderr.strip() or 'no reason given'}"
        )
    return result.stdout


def _matches(rule: str, pattern: re.Pattern[str], text: str) -> Iterator[tuple[str, str]]:
    for found in pattern.finditer(text):
        yield rule, found.group(0)


def rule_hits(fragment: Fragment) -> Iterator[tuple[str, str, str]]:
    """Yield (rule, matched text, message) for one fragment, by zone."""
    subject = repair_ocr(fragment.text) if fragment.zone == IMAGE_TEXT else fragment.text

    if fragment.zone not in {PROSE, REFERENCE}:
        for label, pattern in FORBIDDEN:
            for found in pattern.finditer(subject):
                start, end = found.span()
                window = subject[max(0, start - CONTEXT) : end + CONTEXT]
                if permitted_english(window):
                    continue
                yield "tracked-entity", found.group(0), f"{label}; {TRACKED_ENTITY_MESSAGE}"

    for _, matched in _matches("personal-identifier", EMAIL, subject):
        yield "personal-identifier", matched, PERSONAL_MESSAGE

    for _, matched in _matches("host-path", HOST_PATH, subject):
        yield "host-path", matched, HOST_PATH_MESSAGE

    if fragment.zone == IMAGE_TEXT:
        for _, matched in _matches("address-bar", ADDRESS_BAR, subject):
            yield "address-bar", matched, ADDRESS_BAR_MESSAGE


def acknowledged(location: str, rule: str, matched: str) -> bool:
    for entry in ACKNOWLEDGED:
        if not entry.stands:
            continue
        if entry.rule == rule and entry.location == location and entry.text in matched:
            return True
    return False


def iter_fragments(root: Path, engine: str | None) -> Iterator[Fragment]:
    """Every fragment of the built tree, text and image alike.

    Raises :class:`CannotReadError` if there are images and nothing to read them with.
    """
    images: list[tuple[Path, str]] = []
    for path in sorted(root.rglob("*")):
        # A symlink is not followed. A built tree that contains itself, or points at one
        # that does, is a walk that does not end, and this gate must always end.
        if path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        suffix = path.suffix.lower()
        if suffix in TEXT_SUFFIXES:
            yield from text_fragments(path, relative)
        elif suffix in IMAGE_SUFFIXES:
            images.append((path, relative))

    if not images:
        return
    if engine is None:
        raise CannotReadError(
            f"{len(images)} published image(s) and no OCR engine: `tesseract` is not on "
            "PATH. Install it (apt-get install -y tesseract-ocr) and run again. This gate "
            "will not report a clean site it did not read."
        )
    for path, relative in images:
        yield Fragment(relative, None, IMAGE_TEXT, ocr(path, engine))


def findings(root: Path, engine: str | None) -> list[Finding]:
    found: list[Finding] = []
    for fragment in iter_fragments(root, engine):
        for rule, matched, message in rule_hits(fragment):
            if acknowledged(fragment.location, rule, matched):
                continue
            found.append(
                Finding(fragment.location, fragment.line, rule, fragment.zone, matched, message)
            )
    return sorted(found, key=lambda item: (item.location, item.line or 0, item.rule, item.matched))


def parse(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f"drogna site gate: {GATE}")
    parser.add_argument("--site", required=True, type=Path, help="the built site to read")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("docs/manifest.yaml"),
        help=(
            "accepted for uniformity with the site gate contract; this gate reads nothing "
            "from it, and says so rather than pretending to"
        ),
    )
    return parser.parse_args(argv)


def report(found: Iterable[Finding], stream: object = None) -> None:
    out = stream or sys.stdout
    listed = list(found)
    for finding in listed:
        print(finding.render(), file=out)
    print(f"{GATE}: {len(listed)} findings", file=out)


def main(argv: Sequence[str] | None = None, stream: object = None) -> int:
    arguments = parse(argv)
    out = stream or sys.stdout
    root: Path = arguments.site

    if not root.is_dir():
        print(f"{GATE}: cannot run: {root} is not a built site directory", file=out)
        return EXIT_CANNOT_RUN

    engine = shutil.which("tesseract")
    try:
        found = findings(root, engine)
    except CannotReadError as missing:
        print(f"{GATE}: cannot run: {missing}", file=out)
        return EXIT_CANNOT_RUN

    report(found, out)
    return EXIT_FINDINGS if found else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
