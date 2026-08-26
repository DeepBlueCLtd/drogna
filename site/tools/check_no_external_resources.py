"""Fail if the built site would fetch anything from another origin.

drogna's repository is public but unadvertised, and the published site must
issue no request to a host outside its own origin: no fonts, no scripts, no
stylesheets, no images, no analytics. Outbound hyperlinks to standards documents
are permitted, because a hyperlink is something a reader chooses to follow
rather than something the page fetches.

The check is deliberately syntactic. It reads the built HTML, CSS and JavaScript
and looks at the attributes and directives that cause a browser to fetch, not at
the ones that merely offer a destination.

Run it against the build directory:

    python site/tools/check_no_external_resources.py site/build
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Attributes whose value causes a fetch. `href` appears here only for <link>,
# which is handled separately, because `href` on an anchor is a hyperlink.
FETCHING_ATTRIBUTES = ("src", "srcset", "data-src", "poster", "formaction")

EXTERNAL = re.compile(r"^(?:https?:)?//", re.IGNORECASE)

PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "fetching attribute",
        re.compile(
            r"""\s(?:%s)\s*=\s*["']([^"']+)["']""" % "|".join(FETCHING_ATTRIBUTES),
            re.IGNORECASE,
        ),
    ),
    ("<link href>", re.compile(r"""<link\b[^>]*?\shref\s*=\s*["']([^"']+)["']""", re.IGNORECASE)),
    ("css url()", re.compile(r"""url\(\s*["']?([^"')]+)["']?\s*\)""", re.IGNORECASE)),
    ("css @import", re.compile(r"""@import\s+(?:url\()?\s*["']([^"')]+)["']""", re.IGNORECASE)),
)

SCANNED_SUFFIXES = {".html", ".css", ".js", ".svg", ".xml"}


def findings(root: Path) -> list[str]:
    """Return one message per external reference found under `root`."""
    out: list[str] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SCANNED_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in PATTERNS:
            for match in pattern.finditer(text):
                value = match.group(1).strip()
                if EXTERNAL.match(value):
                    out.append(f"{path.relative_to(root)}: {label} -> {value}")
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <built-site-directory>", file=sys.stderr)
        return 2
    root = Path(argv[1])
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        return 2

    found = findings(root)
    if found:
        print(f"External sub-resource references found in {root}:", file=sys.stderr)
        for line in found:
            print(f"  {line}", file=sys.stderr)
        return 1

    print(f"No external sub-resource references in {root}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
