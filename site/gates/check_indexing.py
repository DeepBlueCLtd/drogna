#!/usr/bin/env python3
"""Site gate: the published site declines indexing, on every page (FR-008, SRD PR-01).

drogna's repository is public but unadvertised, and PR-01's "unadvertised" is read here as
not indexed as well as not promoted. Two mechanisms say so and they are independent on
purpose: ``robots.txt`` answers a crawler that asks for it first, and a ``robots`` meta tag
on the page answers one that arrived by a link and never asked.

Until this gate existed the property was two greps in ``.github/workflows/pages.yml``,
against ``index.html`` and ``robots.txt``. That is the landing page and the file. **The
site has more than one page**, and the meta tag reaches the others through a theme override
— which is to say through a template that a theme upgrade, a `custom_dir` change or a
`extrahead` block moved by hand could stop applying, on every page except the one the grep
looked at. So this gate reads every built page rather than the first one.

**The rule.** Every HTML page in the built output carries a ``robots`` meta tag whose
content declines indexing, and ``robots.txt`` exists and disallows the whole site for every
user agent.

Two scoping decisions:

- **Every page, not a sample.** The failure this gate is written against is a mechanism
  that stops applying somewhere rather than everywhere, so a sample is exactly the wrong
  shape. Findings are reported per page and the count is what makes a partial failure
  legible.
- **"Declines indexing" means the tag says ``noindex``.** ``nofollow`` is about links out
  and is not required here; the page currently sends both, and a page sending only
  ``nofollow`` would be a finding, because it is the one that reads like compliance without
  being it.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

GATE = "indexing"
GATES = Path(__file__).resolve().parent
REPO_ROOT = GATES.parents[1]

EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN = 0, 1, 2

# The robots exclusion standard fixes this name: a crawler asks for it at the root of an
# origin and nowhere else, so it is not a location anything could configure.
ROBOTS_TXT = "robots.txt"  # harness:allow-literal-path fixed by the standard, not a location

ROBOTS_META = re.compile(r"""<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>""", re.IGNORECASE)
CONTENT = re.compile(r"""\bcontent\s*=\s*["']([^"']*)["']""", re.IGNORECASE)
USER_AGENT_ALL = re.compile(r"^\s*user-agent\s*:\s*\*\s*$", re.IGNORECASE | re.MULTILINE)
DISALLOW_ALL = re.compile(r"^\s*disallow\s*:\s*/\s*$", re.IGNORECASE | re.MULTILINE)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int | str
    rule: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.rule}: {self.message}"


def pages(site: Path) -> list[Path]:
    return sorted(path for path in site.rglob("*.html") if path.is_file())


def check_pages(site: Path) -> list[Finding]:
    findings: list[Finding] = []
    for page in pages(site):
        relative = page.relative_to(site).as_posix()
        tag = ROBOTS_META.search(page.read_text(encoding="utf-8", errors="replace"))
        if tag is None:
            findings.append(
                Finding(
                    relative,
                    "-",
                    "page-indexable",
                    "no robots meta tag, so a crawler that arrived by a link is not "
                    "told to stay away",
                )
            )
            continue
        content = CONTENT.search(tag.group(0))
        directives = content.group(1).lower() if content else ""
        if "noindex" not in directives:
            findings.append(
                Finding(
                    relative,
                    "-",
                    "page-indexable",
                    f"the robots meta tag says {directives.strip()!r}, which does not "
                    "decline indexing",
                )
            )
    return findings


def check_robots_txt(site: Path) -> list[Finding]:
    robots = site / ROBOTS_TXT
    if not robots.is_file():
        return [
            Finding(
                ROBOTS_TXT,
                "-",
                "robots-missing",
                "the built site carries no robots.txt, so a crawler that asks first is "
                "told nothing",
            )
        ]
    text = robots.read_text(encoding="utf-8")
    findings: list[Finding] = []
    if not USER_AGENT_ALL.search(text):
        findings.append(
            Finding(
                ROBOTS_TXT,
                "-",
                "robots-permissive",
                "no `User-agent: *` record, so whatever follows binds no crawler",
            )
        )
    if not DISALLOW_ALL.search(text):
        findings.append(
            Finding(
                ROBOTS_TXT,
                "-",
                "robots-permissive",
                "no `Disallow: /`, so the file permits indexing rather than declining it",
            )
        )
    return findings


def run(site: Path) -> list[Finding]:
    return check_robots_txt(site) + check_pages(site)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path, help="the built site")
    args = parser.parse_args(argv)

    if not args.site.is_dir():
        print(f"{GATE}: cannot run: no built site at {args.site}", file=sys.stderr)
        return EXIT_CANNOT_RUN
    if not pages(args.site):
        print(
            f"{GATE}: cannot run: no HTML pages under {args.site}, so this run would "
            "report every page compliant by having read none",
            file=sys.stderr,
        )
        return EXIT_CANNOT_RUN

    findings = run(args.site)
    for finding in findings:
        print(finding, file=sys.stderr)
    print(f"{GATE}: {len(findings)} findings")
    return EXIT_FINDINGS if findings else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
