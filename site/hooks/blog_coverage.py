"""Generate the blog's coverage table of features against entries, at build time.

The table exists to make a gap visible: the features that have no entry yet. A table
maintained by hand would state the gap on the day it was written and then quietly stop,
which is the failure this repository has already reconciled its way out of once. So the
two sets are counted from the tree on every build — the feature directories under
``specs/`` on one side, and the ``feature:`` front matter of the published entries on
the other — and the table is the difference between them.

The table replaces a marker in ``site/docs/blog/index.md``. The page around it is
hand-written; only the table is generated, and the marker says so.

``coverage_table`` takes the repository root as an argument and imports nothing from
MkDocs, so it can be exercised without a build.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

MARKER = "<!-- generated: feature coverage table -->"

BLOG_INDEX_URI = "blog/index.md"

FEATURE_DIR = re.compile(r"^\d{3}-[a-z0-9-]+$")
HEADING = re.compile(r"^#\s+(?P<title>.+?)\s*$", re.MULTILINE)
FRONT_MATTER = re.compile(r"\A---\r?\n(?P<block>.*?)\r?\n---\r?\n", re.DOTALL)

NO_ENTRY = "_no entry yet_"


@dataclass(frozen=True)
class Entry:
    """One published blog entry, as its front matter describes itself."""

    src_name: str
    title: str
    feature: str


def front_matter(text: str) -> dict:
    """The entry's front matter as a mapping, or an empty one if it has none."""
    match = FRONT_MATTER.search(text)
    if match is None:
        return {}
    loaded = yaml.safe_load(match.group("block"))
    return loaded if isinstance(loaded, dict) else {}


def feature_directories(repo_root: Path) -> list[str]:
    """Every feature directory name under ``specs/``, in order."""
    specs = repo_root / "specs"
    if not specs.is_dir():
        return []
    return sorted(
        child.name for child in specs.iterdir() if child.is_dir() and FEATURE_DIR.match(child.name)
    )


def entries(repo_root: Path) -> list[Entry]:
    """Every published blog entry, in file order."""
    posts = repo_root.joinpath("site", "docs", "blog", "posts")
    if not posts.is_dir():
        return []
    found: list[Entry] = []
    for path in sorted(posts.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        meta = front_matter(text)
        feature = str(meta.get("feature", "")).strip().strip("/")
        title = HEADING.search(text)
        found.append(
            Entry(
                src_name=path.name,
                title=title.group("title").strip() if title else path.stem,
                # `feature:` names the directory as `specs/<name>`; the table is indexed
                # by the directory name alone.
                feature=feature.split("/")[-1],
            )
        )
    return found


def coverage_table(repo_root: Path = REPO_ROOT) -> str:
    """The coverage table, as markdown.

    Every feature gets a row whether or not it has an entry, because a table that
    listed only the covered features would hide exactly what it exists to show.
    """
    features = feature_directories(repo_root)
    published = entries(repo_root)

    by_feature: dict[str, list[Entry]] = {}
    for entry in published:
        by_feature.setdefault(entry.feature, []).append(entry)

    covered = [name for name in features if by_feature.get(name)]
    unplaced = sorted(set(by_feature) - set(features))

    rows = []
    for name in features:
        found = by_feature.get(name, [])
        cell = (
            ", ".join(f"[{entry.title}](posts/{entry.src_name})" for entry in found)
            if found
            else NO_ENTRY
        )
        rows.append(f"| `{name}` | {cell} |")
    for name in unplaced:
        cell = ", ".join(f"[{entry.title}](posts/{entry.src_name})" for entry in by_feature[name])
        rows.append(f"| `{name}` — no such feature directory | {cell} |")

    body = "\n".join(rows)
    summary = (
        f"{len(covered)} of the {len(features)} features have an entry; "
        f"{len(features) - len(covered)} have none. "
        f"There are {len(published)} entries in all: a feature with two things worth "
        "saying gets two entries, and the count of entries is not the count of features."
    )
    return (
        f"{MARKER}\n\n"
        "## Which features have an entry\n\n"
        f"{summary}\n\n"
        "This table is generated when the site is built, by counting the feature\n"
        "directories in the repository against the front matter of the entries below.\n"
        "It cannot fall out of date without the build falling out of date with it.\n\n"
        "| Feature | Entry |\n"
        "|---|---|\n"
        f"{body}\n"
    )


def on_page_markdown(markdown: str, page, config, files):  # the MkDocs hook signature
    """Replace the marker in the blog index with the generated table."""
    if page.file.src_uri != BLOG_INDEX_URI or MARKER not in markdown:
        return markdown
    return markdown.replace(MARKER, coverage_table())
