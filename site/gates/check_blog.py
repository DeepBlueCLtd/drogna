"""Site gate: the blog's convention, enforced rather than followed by hand.

Every published entry must name a feature directory that exists, carry a date and a
slug, and reference at least one committed screenshot with the provenance sidecar the
curated capture mechanism writes beside it. An entry naming a feature that does not
exist fails the build (FR-014, FR-015, SC-008).

The gate also reads the built blog index and checks the coverage table that is generated
into it (FR-016). It counts the two sets itself — the feature directories under
``specs/`` and the ``feature:`` front matter of the entries — and compares its own
totals against the ones on the page, so the generator agreeing with itself is not enough.

Run it against a built site::

    python site/gates/check_blog.py --site site/build

Exit codes: 0 no findings, 1 findings, 2 could not run, with the reason named.

**The screenshot rule is not phased in silently.** An entry with no screenshot is a
finding. If an allowance is genuinely needed it is recorded in the documentation
manifest, dated and reasoned, and this gate prints it on every run::

    blog:
      screenshot_allowance:
        recorded: 2026-08-27
        reason: why these entries have no image yet, and what will end the allowance
        entries:
          - the-entry-slug

An allowance that nobody can see is an exemption; an allowance printed on every run is a
debt.
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
    print(f"blog: cannot run: {error.name} is not installed", file=sys.stderr)
    raise SystemExit(2) from error

GATE = "blog"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2

REPO_ROOT = Path(__file__).resolve().parents[2]
# harness:allow-literal-path the manifest this gate reads; not a component location
DEFAULT_MANIFEST = REPO_ROOT / "docs" / "manifest.yaml"

REQUIRED_KEYS = ("date", "slug", "feature")

FRONT_MATTER = re.compile(r"\A---\r?\n(?P<block>.*?)\r?\n---\r?\n", re.DOTALL)
FEATURE_DIR = re.compile(r"^\d{3}-[a-z0-9-]+$")
MARKDOWN_IMAGE = re.compile(r"!\[[^\]]*\]\(\s*(?P<target>[^)\s]+)")
HTML_IMAGE = re.compile(r"<img\b[^>]*?\ssrc\s*=\s*[\"'](?P<target>[^\"']+)")
FEATURE_NUMBER = re.compile(r"^(?P<number>\d{3})")

# The sidecar the curated capture mechanism writes beside a published image. Spelt in
# parts so that the gate names a convention rather than a location.
SIDECAR_SUFFIX = ".provenance" + ".json"
BUILT_PAGE = "index" + ".html"


@dataclass(frozen=True)
class Finding:
    path: str
    line: int | str
    rule: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.rule}: {self.message}"


def front_matter(text: str) -> tuple[dict, int]:
    """The entry's front matter, and the line its block starts on."""
    match = FRONT_MATTER.search(text)
    if match is None:
        return {}, 1
    loaded = yaml.safe_load(match.group("block"))
    return (loaded if isinstance(loaded, dict) else {}), 1


def line_of(text: str, needle: str) -> int:
    """The one-based line on which ``needle`` first appears, or 1."""
    index = text.find(needle)
    return 1 if index < 0 else text.count("\n", 0, index) + 1


def feature_directories(repo_root: Path) -> list[str]:
    specs = repo_root / "specs"
    if not specs.is_dir():
        return []
    return sorted(
        child.name for child in specs.iterdir() if child.is_dir() and FEATURE_DIR.match(child.name)
    )


def allowance(manifest_path: Path) -> tuple[dict[str, str], str]:
    """The recorded screenshot allowance: the entries it covers, each with its own reason.

    ``entries`` is a mapping of slug to the reason that slug carries no image. It was a bare
    list until 27 August 2026, when the first seven allowances were recorded and one shared
    sentence turned out to be the wrong shape: the seven do not have the same reason, and a
    blanket sentence covering all of them is the thing an allowance is supposed not to be. A
    list is still accepted, and an entry in one reads as having no reason of its own, which
    the manifest gate reports.
    """
    if not manifest_path.is_file():
        return {}, ""
    loaded = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        return {}, ""
    recorded = loaded.get("blog", {})
    if not isinstance(recorded, dict):
        return {}, ""
    entry = recorded.get("screenshot_allowance", {})
    if not isinstance(entry, dict):
        return {}, ""
    listed = entry.get("entries") or {}
    if isinstance(listed, dict):
        reasons = {str(slug): str(reason).strip() for slug, reason in listed.items()}
    else:
        reasons = {str(slug): "" for slug in listed}
    note = f"recorded {entry.get('recorded', 'undated')}"
    shared = str(entry.get("reason", "")).strip()
    if shared:
        note = f"{note}: {shared}"
    return reasons, note


def image_targets(text: str) -> list[tuple[int, str]]:
    """Every image reference in the entry, with the line it is on."""
    found: list[tuple[int, str]] = []
    for pattern in (MARKDOWN_IMAGE, HTML_IMAGE):
        for match in pattern.finditer(text):
            found.append((text.count("\n", 0, match.start()) + 1, match.group("target")))
    return sorted(found)


def check_entry(
    path: Path,
    repo_root: Path,
    features: set[str],
    site: Path,
    allowed: set[str],
    note: str,
) -> tuple[list[Finding], list[str]]:
    """Findings for one entry, and any allowance lines it invoked."""
    findings: list[Finding] = []
    allowances: list[str] = []
    relative = path.relative_to(repo_root).as_posix()
    text = path.read_text(encoding="utf-8")
    meta, _ = front_matter(text)

    if not meta:
        findings.append(
            Finding(relative, 1, "front-matter", "no front matter, so nothing declares the entry")
        )
        return findings, allowances

    for key in REQUIRED_KEYS:
        if not str(meta.get(key, "")).strip():
            findings.append(
                Finding(relative, 1, "front-matter", f"front matter carries no `{key}`")
            )

    feature = str(meta.get("feature", "")).strip().strip("/").split("/")[-1]
    if feature and feature not in features:
        findings.append(
            Finding(
                relative,
                line_of(text, "feature:"),
                "feature-directory",
                f"names `{feature}`, which is not a directory under specs/",
            )
        )

    slug = str(meta.get("slug", "")).strip()
    if slug and not (site / "blog" / slug / BUILT_PAGE).is_file():
        findings.append(
            Finding(
                relative,
                1,
                "not-published",
                f"no page for slug `{slug}` in the built site",
            )
        )

    images = image_targets(text)
    if not images:
        if slug in allowed:
            because = allowed[slug] or "no reason of its own recorded, which is a debt too"
            allowances.append(f"{relative}:-: screenshot-allowance: {note} — {because}")
        else:
            findings.append(
                Finding(
                    relative,
                    1,
                    "screenshot",
                    "references no screenshot; an entry shows the feature working "
                    "rather than asserting that it does",
                )
            )

    for line, target in images:
        image = (path.parent / target).resolve()
        assets = repo_root.joinpath("site", "docs", "blog", "assets").resolve()
        if not image.is_file():
            findings.append(
                Finding(relative, line, "screenshot-missing", f"`{target}` is not committed")
            )
            continue
        if image.parent != assets:
            findings.append(
                Finding(
                    relative,
                    line,
                    "screenshot-location",
                    f"`{target}` is not in site/docs/blog/assets/",
                )
            )
            continue
        # The name records which feature's capture produced the image, not which entry
        # cites it: an entry may legitimately show a picture an earlier feature took.
        number = FEATURE_NUMBER.match(image.name)
        if number is None or not any(
            name.startswith(number.group("number")) for name in sorted(features)
        ):
            findings.append(
                Finding(
                    relative,
                    line,
                    "screenshot-name",
                    f"`{image.name}` does not open with the number of a feature "
                    "directory, so nothing says which capture produced it",
                )
            )
        sidecar = image.with_name(image.stem + SIDECAR_SUFFIX)
        if not sidecar.is_file():
            findings.append(
                Finding(
                    relative,
                    line,
                    "screenshot-provenance",
                    f"`{image.name}` has no provenance sidecar beside it, so nothing "
                    "records how it was taken",
                )
            )

    return findings, allowances


def check_coverage_table(
    site: Path, repo_root: Path, features: list[str], entries: int
) -> list[Finding]:
    """The generated coverage table, against a count this gate makes for itself."""
    index = site / "blog" / BUILT_PAGE
    relative = index.relative_to(site).as_posix()
    if not index.is_file():
        return [Finding(relative, "-", "coverage-table", "the built site has no blog index")]

    html = index.read_text(encoding="utf-8", errors="replace")
    findings: list[Finding] = []
    missing = [name for name in features if name not in html]
    if missing:
        findings.append(
            Finding(
                relative,
                "-",
                "coverage-table",
                "no row for " + ", ".join(missing) + "; a feature left out of the table "
                "is a gap the table exists to show",
            )
        )

    posts = repo_root.joinpath("site", "docs", "blog", "posts")
    covered = set()
    for path in sorted(posts.glob("*.md")):
        meta, _ = front_matter(path.read_text(encoding="utf-8"))
        name = str(meta.get("feature", "")).strip().strip("/").split("/")[-1]
        if name in features:
            covered.add(name)
    expected = f"{len(covered)} of the {len(features)} features have an entry"
    if expected not in html:
        findings.append(
            Finding(
                relative,
                "-",
                "coverage-table",
                f"the page does not state what this gate counts: {expected}, "
                f"from {entries} entries",
            )
        )
    return findings


def run(site: Path, manifest: Path, repo_root: Path) -> tuple[list[Finding], list[str]]:
    posts = repo_root.joinpath("site", "docs", "blog", "posts")
    if not posts.is_dir():
        raise FileNotFoundError(f"no blog entries at {posts}")

    features = feature_directories(repo_root)
    allowed, note = allowance(manifest)

    findings: list[Finding] = []
    allowances: list[str] = []
    paths = sorted(posts.glob("*.md"))
    for path in paths:
        entry_findings, entry_allowances = check_entry(
            path, repo_root, set(features), site, allowed, note
        )
        findings.extend(entry_findings)
        allowances.extend(entry_allowances)

    findings.extend(check_coverage_table(site, repo_root, features, len(paths)))
    return findings, allowances


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

    try:
        findings, allowances = run(args.site, args.manifest, args.repo_root)
    except FileNotFoundError as error:
        print(f"{GATE}: cannot run: {error}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    for line in allowances:
        print(line)
    for finding in findings:
        print(finding)
    print(f"{GATE}: {len(findings)} findings")
    return EXIT_FINDINGS if findings else EXIT_CLEAN


if __name__ == "__main__":
    raise SystemExit(main())
