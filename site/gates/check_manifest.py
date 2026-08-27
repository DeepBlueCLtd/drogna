"""Gate: every page the documentation manifest requires exists and is not a stub.

    python site/gates/check_manifest.py --site site/build

FR-011 asks for the required set of documentation pages to be declared, and for the
build to fail when a page named there is missing or is a stub below the declared length.
SC-002 adds that the failure names the file. This is that gate.

**Why it reads the source and not the built site.** The built page is the source
wrapped in several thousand words of theme: navigation, search index, footer. A length
measured there measures the theme, and a page emptied to a single sentence still clears
any threshold worth setting. The property FR-011 describes is a property of what was
written, so what was written is what is counted. ``--site`` is accepted because the
runner passes it to every gate uniformly; this gate has no use for it, and says so here
rather than pretending otherwise.

**Two rules, because length alone cannot do it.** When this gate was written the
self-declared stubs on this site were *longer* than the shortest page the project
accepted as finished — the manifest's comment carries the measurements. So a page that
announces itself a stub is a stub whatever its length, and the length is a floor for the
page that is a stub without saying so.

Findings are printed one per line as ``<path>:<line>: <rule>: <message>``, and the exit
code is 0 for none, 1 for some, 2 for a run that could not happen.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

GATE = "manifest"
DEFAULT_MANIFEST = "docs/manifest.yaml"

REPO_ROOT = Path(__file__).resolve().parents[2]

FRONT_MATTER = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)

CANNOT_RUN = 2


class UnrunnableError(Exception):
    """The gate cannot reach a conclusion, and must say what is missing."""


def relative_to_root(path: Path) -> Path:
    """The path as a reader of this repository would write it, where that is possible.

    A test points the gate at a manifest in a temporary directory, which is nowhere
    under the repository; the absolute path is the honest thing to print then.
    """
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def load_manifest(path: Path) -> dict:
    """Read the manifest, or explain what stopped us."""
    try:
        import yaml
    except ModuleNotFoundError as error:  # pragma: no cover - exercised by hand, not CI
        raise UnrunnableError(
            f"PyYAML is not installed, so the manifest cannot be read ({error})."
        ) from error

    if not path.is_file():
        raise UnrunnableError(
            f"no manifest at {path}; without it nothing declares what must exist."
        )

    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise UnrunnableError(f"{path} is not valid YAML: {error}") from error

    if not isinstance(loaded, dict):
        raise UnrunnableError(f"{path} does not hold a mapping, so it declares nothing.")
    return loaded


def body_of(text: str) -> str:
    """The page without its YAML front matter.

    Front matter is metadata for the build, not prose for a reader, and counting it
    would let a page reach its floor by growing its title.
    """
    return FRONT_MATTER.sub("", text)


def word_count(body: str) -> int:
    return len(body.split())


def stub_line(text: str, marker: re.Pattern[str]) -> int | None:
    """The line the stub marker sits on, if the page carries one.

    Counted in the file rather than in the body, so the number an author is given is the
    number their editor shows them.
    """
    for number, line in enumerate(text.splitlines(), start=1):
        if marker.search(line):
            return number
    return None


def adr_findings(manifest: dict, where: str) -> list[str]:
    """FR-021: the decision is recorded here, so check the record against the tree.

    The shallow half of it, deliberately. ``site/hooks/publish_adrs.py`` reads
    ``adrs.published`` at build time and ``site/gates/check_adr.py`` checks the built
    output against it in both directions. What is left for this gate is that the
    manifest is not recording a decision the source tree cannot honour — records
    published with no records to publish. Checking the destination would prove nothing:
    the records are rendered into the build and never written back into the source.
    """
    block = manifest.get("adrs")
    if not isinstance(block, dict) or "published" not in block:
        return [
            f"{where}:-: {GATE}.adrs: no adrs.published entry. FR-021 asks for the "
            f"decision to be recorded, not inferred from what the build globbed."
        ]
    if not block.get("published"):
        return []

    source = block.get("source")
    if not isinstance(source, str):
        return [f"{where}:-: {GATE}.adrs: adrs.published is true and no source is named."]
    records = REPO_ROOT / source
    if not records.is_dir() or not any(records.glob("*.md")):
        shown = relative_to_root(records).as_posix()
        return [
            f"{shown}:-: {GATE}.adrs: the manifest records ADRs as published and there is "
            f"no record here to publish."
        ]
    return []


def findings(manifest: dict, manifest_path: Path) -> list[str]:
    """One message per fault, in the order the manifest declares its pages."""
    out: list[str] = []
    where = relative_to_root(manifest_path).as_posix()

    docs_root = manifest.get("docs_root")
    if not isinstance(docs_root, str):
        raise UnrunnableError(f"{where} declares no docs_root, so no page path can be resolved.")
    root = REPO_ROOT / docs_root

    marker_source = manifest.get("stub_marker")
    if not isinstance(marker_source, str):
        raise UnrunnableError(
            f"{where} declares no stub_marker, so no page can be told from a stub."
        )
    marker = re.compile(marker_source, re.MULTILINE)

    kinds = manifest.get("kinds")
    if not isinstance(kinds, dict) or not kinds:
        raise UnrunnableError(f"{where} declares no kinds, so no page has a floor to clear.")

    pages = manifest.get("pages")
    if not isinstance(pages, dict) or not pages:
        raise UnrunnableError(f"{where} declares no pages, and an empty run is not a clean one.")

    for relative, raw in pages.items():
        entry = raw or {}
        declared = entry.get("kind")
        if declared not in kinds:
            out.append(
                f"{where}:-: {GATE}.kind: page {relative!r} declares kind {declared!r}, "
                f"which the manifest does not define."
            )
            continue

        floor = entry.get("min_words", kinds[declared].get("min_words"))
        if not isinstance(floor, int):
            out.append(
                f"{where}:-: {GATE}.kind: kind {declared!r} declares no integer min_words, "
                f"so {relative!r} has no floor to clear."
            )
            continue

        page = root / relative
        shown = relative_to_root(page).as_posix()
        if not page.is_file():
            out.append(
                f"{shown}:-: {GATE}.missing: the manifest requires this page and it does not exist."
            )
            continue

        text = page.read_text(encoding="utf-8")
        body = body_of(text)

        line = stub_line(text, marker)
        if line is not None:
            out.append(
                f"{shown}:{line}: {GATE}.stub: the page declares itself a stub. "
                f"The manifest requires it written."
            )

        words = word_count(body)
        if words < floor:
            out.append(
                f"{shown}:-: {GATE}.short: {words} words, below the {floor} a "
                f"{declared} page must carry."
            )

    out.extend(adr_findings(manifest, where))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="the built site; unused, see the docstring")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    arguments = parser.parse_args(argv)

    manifest_path = Path(arguments.manifest)
    if not manifest_path.is_absolute():
        manifest_path = REPO_ROOT / manifest_path

    try:
        manifest = load_manifest(manifest_path)
        found = findings(manifest, manifest_path)
    except UnrunnableError as error:
        print(f"{GATE}: could not run: {error}", file=sys.stderr)
        return CANNOT_RUN

    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
