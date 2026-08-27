"""Gate: every component identifier in the SRD is accounted for on the site (FR-012).

    python site/gates/check_subsystem_coverage.py --site site/build

FR-012 asks that the subsystem reference account for every component identifier in the
requirements document's component table, either with a page or with an explicit
statement that the component is not yet built. SC-006 states it as C-01 to C-18.

**The eighteen are not written down here.** They are read out of the component table in
``harness-srd.md``, which is where they are defined. A gate that counted to eighteen
would be satisfied by eighteen of the wrong ones, and would say nothing at all on the
day a C-19 is added — which is the day the gate is most needed. What is checked is the
correspondence between two documents, in both directions: an identifier the SRD names
and the manifest does not account for, and an identifier the manifest accounts for that
the SRD no longer names.

**"Not yet built" has to be typed.** A component with no page is accounted for by an
entry under ``components:`` in the manifest, carrying a reason. Silence is not an
accounting, which is the whole of the difference between this gate and no gate.

``--site`` is accepted because the runner passes it to every gate uniformly. The
correspondence this gate checks is between the SRD and the manifest, and neither is
built.

Findings are printed one per line as ``<path>:<line>: <rule>: <message>``, and the exit
code is 0 for none, 1 for some, 2 for a run that could not happen.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

GATE = "subsystem-coverage"
DEFAULT_MANIFEST = "docs/manifest.yaml"
DEFAULT_REQUIREMENTS = "harness-srd.md"

REPO_ROOT = Path(__file__).resolve().parents[2]

# A row of the SRD's component table: `| C-07 | Feature store | ... |`. The identifier
# is matched as it is written there, so a table that starts spelling them differently
# stops being recognised rather than being silently reinterpreted.
COMPONENT_ROW = re.compile(r"^\|\s*(C-\d{2})\s*\|\s*([^|]+?)\s*\|", re.MULTILINE)

CANNOT_RUN = 2


class UnrunnableError(Exception):
    """The gate cannot reach a conclusion, and must say what is missing."""


def relative_to_root(path: Path) -> Path:
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def load_manifest(path: Path) -> dict:
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


def components_in(requirements: Path) -> dict[str, str]:
    """Every component identifier the requirements document defines, with its name."""
    if not requirements.is_file():
        raise UnrunnableError(
            f"no requirements document at {requirements}; the component identifiers are "
            f"defined there and are deliberately not repeated in this gate."
        )
    text = requirements.read_text(encoding="utf-8")
    found = {identifier: name for identifier, name in COMPONENT_ROW.findall(text)}
    if not found:
        raise UnrunnableError(
            f"{requirements} holds no component table row this gate recognises, so it "
            f"has nothing to check against. An empty run is not a clean one."
        )
    return found


def findings(manifest: dict, manifest_path: Path, requirements: Path) -> list[str]:
    where = relative_to_root(manifest_path).as_posix()
    defined = components_in(requirements)

    docs_root = manifest.get("docs_root")
    if not isinstance(docs_root, str):
        raise UnrunnableError(f"{where} declares no docs_root, so no page path can be resolved.")
    root = REPO_ROOT / docs_root

    pages = manifest.get("pages")
    if not isinstance(pages, dict):
        raise UnrunnableError(f"{where} declares no pages.")
    declared = manifest.get("components")
    declared = {} if declared is None else declared
    if not isinstance(declared, dict):
        raise UnrunnableError(f"{where} has a components entry that is not a mapping.")

    out: list[str] = []

    # Which page claims which identifier, and whether two of them claim the same one.
    claimed: dict[str, list[str]] = {}
    for relative, raw in pages.items():
        entry = raw or {}
        identifier = entry.get("component")
        if identifier is None:
            continue
        claimed.setdefault(str(identifier), []).append(str(relative))

    for identifier, claimants in sorted(claimed.items()):
        if identifier not in defined:
            out.append(
                f"{where}:-: {GATE}.unknown: {', '.join(claimants)} claims {identifier}, "
                f"which {relative_to_root(requirements).as_posix()} does not define."
            )
            continue
        if len(claimants) > 1:
            out.append(
                f"{where}:-: {GATE}.duplicate: {identifier} is claimed by "
                f"{', '.join(sorted(claimants))}."
            )
        for claimant in claimants:
            page = root / claimant
            if not page.is_file():
                out.append(
                    f"{relative_to_root(page).as_posix()}:-: {GATE}.missing: accounts for "
                    f"{identifier} and does not exist."
                )

    for identifier, reason in sorted(declared.items()):
        identifier = str(identifier)
        if identifier not in defined:
            out.append(
                f"{where}:-: {GATE}.unknown: components declares {identifier}, which "
                f"{relative_to_root(requirements).as_posix()} does not define."
            )
        elif identifier in claimed:
            out.append(
                f"{where}:-: {GATE}.contradiction: {identifier} is recorded as not yet "
                f"built and is also claimed by {', '.join(sorted(claimed[identifier]))}."
            )
        elif not str(reason or "").strip():
            out.append(
                f"{where}:-: {GATE}.unreasoned: {identifier} is recorded as not yet built "
                f"with no reason. An entry nobody had to justify justifies nothing."
            )

    for identifier in sorted(defined):
        if identifier in claimed or identifier in declared:
            continue
        out.append(
            f"{where}:-: {GATE}.unaccounted: {identifier} {defined[identifier]!r} has "
            f"neither a page nor a components entry saying it is not yet built."
        )

    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="the built site; unused, see the docstring")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--requirements", default=DEFAULT_REQUIREMENTS)
    arguments = parser.parse_args(argv)

    manifest_path = Path(arguments.manifest)
    if not manifest_path.is_absolute():
        manifest_path = REPO_ROOT / manifest_path
    requirements = Path(arguments.requirements)
    if not requirements.is_absolute():
        requirements = REPO_ROOT / requirements

    try:
        manifest = load_manifest(manifest_path)
        found = findings(manifest, manifest_path, requirements)
    except UnrunnableError as error:
        print(f"{GATE}: could not run: {error}", file=sys.stderr)
        return CANNOT_RUN

    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
