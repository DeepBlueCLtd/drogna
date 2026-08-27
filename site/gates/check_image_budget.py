"""Gate: the published images stay inside their budget (015 T044).

    python site/gates/check_image_budget.py --site site/build

The task this implements gives its own reason: "so the repository does not accumulate
screenshots". Accumulation is a property of the set, not of any one file, so a per-image
cap alone would not have caught it — fifty images each comfortably under the cap is
exactly the outcome the task is about. There are therefore two bounds, and they come from
two different places on purpose.

**The per-image cap is read, not declared.** ``curated.maximum_bytes`` in each
destination's ``capture.json`` already caps a single curated image, and the curated
mechanism is the only one of the three that commits anything (``scripts/capture/README``).
Restating that number in the manifest would create two authorities for one bound, and an
image that passed the capture cap and then failed a site gate would be a contradiction
between two files rather than a finding about an image. So this gate reads the capture
configuration. If the destinations ever disagree about the cap, that disagreement is
itself a finding: a bound that depends on which destination you asked is not a bound.

**The total is declared**, under ``images:`` in the manifest, because nothing else in the
repository has an opinion about the size of the set — which is why the set can grow
without anyone deciding to let it. Its floor is derived from the committed corpus and
``site/gates/tests/test_image_budget.py`` re-derives it, so lowering the budget to make a
run green fails a test instead of passing quietly.

**What is measured is the built tree**, not ``site/docs``. What the repository publishes
is what mkdocs emitted, and the theme copies assets into it; measuring the source would
miss anything the build adds and would report on anything the build leaves behind. The
gate reports the source path for an over-budget image where it can find one, because that
is the file somebody has to act on.

Findings are printed one per line as ``<path>:<line>: <rule>: <message>``, and the exit
code is 0 for none, 1 for some, 2 for a run that could not happen.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

GATE = "image-budget"
DEFAULT_MANIFEST = "docs/manifest.yaml"

REPO_ROOT = Path(__file__).resolve().parents[2]

# Where each destination declares what a single curated image may weigh. The directory is
# walked rather than listed, so a destination added later is included without an edit here
# — the same reason the runner discovers gates instead of naming them.
CONFIG_ROOT = REPO_ROOT / "config"
CAPTURE_FILENAME = "capture.json"

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
            f"no manifest at {path}; without it nothing declares the image budget."
        )
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise UnrunnableError(f"{path} is not valid YAML: {error}") from error
    if not isinstance(loaded, dict):
        raise UnrunnableError(f"{path} does not hold a mapping, so it declares nothing.")
    return loaded


def per_image_cap(config_root: Path | None = None) -> tuple[int, list[str]]:
    """The single-image cap the capture mechanism already enforces, and any disagreement.

    Returned rather than raised when the destinations differ, because a disagreement is a
    finding about the configuration and not a reason to conclude nothing about the images.
    The smallest is used in that case: the gate must not be more permissive than the
    strictest destination while the two are being reconciled.
    """
    root = config_root or CONFIG_ROOT
    if not root.is_dir():
        raise UnrunnableError(
            f"no {relative_to_root(root).as_posix()} directory, so nothing declares what a "
            f"single curated image may weigh. This gate does not carry a number of its own."
        )

    declared: dict[str, int] = {}
    for destination in sorted(p for p in root.iterdir() if p.is_dir()):
        capture = destination / CAPTURE_FILENAME
        if not capture.is_file():
            continue
        try:
            document = json.loads(capture.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise UnrunnableError(
                f"{relative_to_root(capture).as_posix()} is not valid JSON: {error}"
            ) from error
        value = (document.get("curated") or {}).get("maximum_bytes")
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            declared[destination.name] = value

    if not declared:
        raise UnrunnableError(
            f"no destination under {relative_to_root(root).as_posix()} declares "
            f"curated.maximum_bytes, which is where the per-image cap is defined. This gate "
            f"deliberately holds no default: a cap nobody declared would be a number this "
            f"file invented."
        )

    disagreements: list[str] = []
    if len(set(declared.values())) > 1:
        shown = ", ".join(f"{name}={size}" for name, size in sorted(declared.items()))
        disagreements.append(
            f"config/:-: {GATE}.cap-disagreement: destinations declare different values for "
            f"curated.maximum_bytes ({shown}). One published image has one size; the "
            f"smallest is applied until they agree."
        )
    return min(declared.values()), disagreements


def published_images(site: Path, suffixes: set[str]) -> list[Path]:
    """Every image in the built tree, in a stable order so two runs report alike."""
    return sorted(
        path for path in site.rglob("*") if path.is_file() and path.suffix.lower() in suffixes
    )


def source_for(image: Path, site: Path, docs_root: Path) -> Path:
    """The file somebody would edit, where the built tree still mirrors the source."""
    candidate = docs_root / image.relative_to(site)
    return candidate if candidate.is_file() else image


def findings(manifest: dict, manifest_path: Path, site: Path) -> list[str]:
    where = relative_to_root(manifest_path).as_posix()

    if not site.is_dir():
        raise UnrunnableError(
            f"no built site at {site}; run `mkdocs build --strict --config-file "
            f"site/mkdocs.yml` first. An unbuilt tree has no published images to weigh, "
            f"and reporting nothing about it would look exactly like a clean run."
        )

    block = manifest.get("images")
    if not isinstance(block, dict):
        raise UnrunnableError(
            f"{where} declares no images block, so nothing bounds the published image set."
        )

    total_budget = block.get("total_bytes")
    if not isinstance(total_budget, int) or isinstance(total_budget, bool) or total_budget <= 0:
        raise UnrunnableError(
            f"{where} declares images.total_bytes as {total_budget!r}, which is not a "
            f"positive whole number of bytes."
        )

    raw_suffixes = block.get("suffixes")
    if not isinstance(raw_suffixes, list) or not raw_suffixes:
        raise UnrunnableError(
            f"{where} declares no images.suffixes, so this gate cannot tell which built "
            f"files are images. An empty list would weigh nothing and report clean."
        )
    suffixes = {str(item).lower() for item in raw_suffixes}

    docs_root_name = manifest.get("docs_root")
    docs_root = REPO_ROOT / str(docs_root_name) if isinstance(docs_root_name, str) else site

    cap, out = per_image_cap()
    images = published_images(site, suffixes)

    total = 0
    for image in images:
        size = image.stat().st_size
        total += size
        if size > cap:
            shown = relative_to_root(source_for(image, site, docs_root)).as_posix()
            out.append(
                f"{shown}:-: {GATE}.oversized: {size} bytes, over the {cap} a curated "
                f"capture may produce (curated.maximum_bytes). Retake it rather than "
                f"raising the cap: the cap is what the capture mechanism itself enforces."
            )

    if total > total_budget:
        out.append(
            f"{where}:-: {GATE}.over-budget: {len(images)} published image(s) weigh {total} "
            f"bytes against a budget of {total_budget}. This is the accumulation the budget "
            f"exists to stop, so the question is which images the site still needs — "
            f"raising images.total_bytes is a decision and belongs in a commit message."
        )

    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="the built site to weigh")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    arguments = parser.parse_args(argv)

    manifest_path = Path(arguments.manifest)
    if not manifest_path.is_absolute():
        manifest_path = REPO_ROOT / manifest_path
    site = Path(arguments.site)
    if not site.is_absolute():
        site = REPO_ROOT / site

    try:
        manifest = load_manifest(manifest_path)
        found = findings(manifest, manifest_path, site)
    except UnrunnableError as error:
        print(f"{GATE}: could not run: {error}", file=sys.stderr)
        return CANNOT_RUN

    for line in found:
        print(line)
    print(f"{GATE}: {len(found)} findings")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
