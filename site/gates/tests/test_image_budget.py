"""The published-image budget gate (015 T044), and the derivations that hold its bounds.

Two bounds, from two places, and the tests here are mostly about which place.

The per-image cap is *read* from ``curated.maximum_bytes`` in the destinations' capture
configuration rather than declared in the manifest, because the curated mechanism is the
only one that commits an image and a second number for one bound is drift waiting to
happen. So there is a test that the gate has no number of its own — point it at a config
tree that declares none and it must refuse to conclude rather than fall back.

The total is declared in the manifest, and its floor is re-derived here on every run:
``images.total_bytes`` may not be lowered to or below the corpus already committed. That
is the same shape ``test_manifest.py`` uses for the per-kind word floors, and it exists
because the cheapest way to make a budget gate green is to raise the budget — or, once it
is red, to lower it until whatever is on disk fits.

Everything below hands the gate a tree it built itself. Nothing here asserts against the
real site's numbers except the floor derivation, which is the one place the real corpus is
the subject.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_image_budget.py"
ROOT = GATES.parents[1]
MANIFEST = ROOT / "docs" / "manifest.yaml"

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2

# A one-pixel PNG, so a fixture can be padded to any size without a rendering library.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000050001" + "0d0a2db4" + "0000000049454e44ae426082"
)


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def manifest_document() -> dict:
    return yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))


def declared_budget() -> int:
    return int(manifest_document()["images"]["total_bytes"])


def declared_suffixes() -> set[str]:
    return {str(s).lower() for s in manifest_document()["images"]["suffixes"]}


def committed_corpus() -> list[Path]:
    """The images actually committed under the documentation source."""
    docs = ROOT / str(manifest_document()["docs_root"])
    suffixes = declared_suffixes()
    return sorted(
        path for path in docs.rglob("*") if path.is_file() and path.suffix.lower() in suffixes
    )


def image_of(path: Path, size: int) -> None:
    """A valid PNG padded to exactly `size` bytes with a trailing comment chunk's worth."""
    path.parent.mkdir(parents=True, exist_ok=True)
    padding = max(0, size - len(PNG))
    path.write_bytes(PNG + b"\0" * padding)


def site_with(tmp_path: Path, sizes: dict[str, int]) -> Path:
    site = tmp_path / "build"
    site.mkdir(parents=True, exist_ok=True)
    for name, size in sizes.items():
        image_of(site / name, size)
    return site


def manifest_at(tmp_path: Path, **overrides: object) -> Path:
    """The real manifest with its images block overridden, so nothing else drifts."""
    document = manifest_document()
    document["images"] = {**document["images"], **overrides}
    path = tmp_path / "probe-manifest.yaml"
    path.write_text(yaml.safe_dump(document), encoding="utf-8")
    return path


# --------------------------------------------------------------------------------------
# The bound that is declared, and the derivation that stops it being lowered
# --------------------------------------------------------------------------------------


def test_the_budget_is_above_the_corpus_already_committed() -> None:
    """The floor is derived from disk, so lowering it to make a run pass fails here.

    This is the `bounded_by: above-the-committed-corpus` claim in the manifest, re-performed
    rather than trusted. A budget at or below what is already published would mean the gate
    was red on the day it was written, and a gate that is red on arrival gets loosened.
    """
    corpus = committed_corpus()
    assert corpus, (
        "no committed images under docs_root, so this derivation examined nothing. A "
        "budget bounded by an empty corpus is bounded by nothing"
    )
    total = sum(path.stat().st_size for path in corpus)
    assert declared_budget() > total, (
        f"images.total_bytes is {declared_budget()} and the {len(corpus)} committed "
        f"image(s) already weigh {total}. Raising the budget is a decision; lowering it "
        f"onto the corpus is how a budget stops being one"
    )


def test_the_real_site_is_inside_its_budget_when_it_has_been_built() -> None:
    site = ROOT / "site" / "build"
    if not site.is_dir():
        pytest.skip("site/build is absent; run mkdocs build first (ADR-0010: outside uv)")
    result = run("--site", str(site))
    assert result.returncode == CLEAN, result.stdout + result.stderr


# --------------------------------------------------------------------------------------
# Watching it fail: the two findings, separately
# --------------------------------------------------------------------------------------


def test_one_image_over_the_capture_cap_is_a_finding(tmp_path: Path) -> None:
    cap = min(
        json.loads((ROOT / "config" / d / "capture.json").read_text(encoding="utf-8"))["curated"][
            "maximum_bytes"
        ]
        for d in ("local", "droplet")
    )
    site = site_with(tmp_path, {"assets/huge.png": cap + 1})
    result = run("--site", str(site), "--manifest", str(manifest_at(tmp_path)))
    assert result.returncode == FINDINGS, result.stdout + result.stderr
    assert "image-budget.oversized" in result.stdout
    assert "huge.png" in result.stdout


def test_many_small_images_over_the_total_are_a_finding(tmp_path: Path) -> None:
    """The accumulation case, which a per-image cap alone would never report.

    Each image here is comfortably legal on its own. That is the whole point of the task:
    a repository does not accumulate screenshots by committing one enormous one.
    """
    budget = 400_000
    sizes = {f"assets/shot-{index}.png": 90_000 for index in range(5)}
    site = site_with(tmp_path, sizes)
    result = run("--site", str(site), "--manifest", str(manifest_at(tmp_path, total_bytes=budget)))
    assert result.returncode == FINDINGS, result.stdout + result.stderr
    assert "image-budget.over-budget" in result.stdout
    assert "image-budget.oversized" not in result.stdout, (
        "no single image here is over the capture cap; reporting one would mean the two "
        "bounds are not being told apart"
    )


def test_a_site_inside_both_bounds_is_clean(tmp_path: Path) -> None:
    site = site_with(tmp_path, {"assets/small.png": 1_000, "assets/other.png": 2_000})
    result = run("--site", str(site), "--manifest", str(manifest_at(tmp_path, total_bytes=400_000)))
    assert result.returncode == CLEAN, result.stdout + result.stderr


def test_a_file_that_is_not_a_declared_image_suffix_is_not_weighed(tmp_path: Path) -> None:
    """The suffix list is what makes the set well defined, so it must actually be applied."""
    site = site_with(tmp_path, {"assets/small.png": 1_000})
    (site / "assets" / "bulky.txt").write_bytes(b"x" * 900_000)
    result = run("--site", str(site), "--manifest", str(manifest_at(tmp_path, total_bytes=400_000)))
    assert result.returncode == CLEAN, result.stdout + result.stderr


# --------------------------------------------------------------------------------------
# Could-not-run is its own outcome, and the gate carries no number of its own
# --------------------------------------------------------------------------------------


def test_an_unbuilt_site_cannot_be_weighed(tmp_path: Path) -> None:
    """Reporting nothing about an unbuilt tree would look exactly like a clean run."""
    result = run("--site", str(tmp_path / "never-built"))
    assert result.returncode == CANNOT_RUN
    assert "mkdocs build" in result.stderr


def test_a_manifest_with_no_images_block_cannot_be_run(tmp_path: Path) -> None:
    document = manifest_document()
    document.pop("images", None)
    path = tmp_path / "no-images.yaml"
    path.write_text(yaml.safe_dump(document), encoding="utf-8")
    site = site_with(tmp_path, {"assets/small.png": 1_000})
    result = run("--site", str(site), "--manifest", str(path))
    assert result.returncode == CANNOT_RUN
    assert "no images block" in result.stderr


def test_an_empty_suffix_list_cannot_be_run(tmp_path: Path) -> None:
    """An empty list would weigh nothing and report clean, which is the worst answer."""
    site = site_with(tmp_path, {"assets/small.png": 1_000})
    result = run("--site", str(site), "--manifest", str(manifest_at(tmp_path, suffixes=[])))
    assert result.returncode == CANNOT_RUN
    assert "images.suffixes" in result.stderr


def test_the_gate_holds_no_per_image_cap_of_its_own(tmp_path: Path, monkeypatch) -> None:
    """Point it at a configuration tree declaring no cap and it must refuse, not default.

    A fallback here would be a number this file invented, and it would silently become the
    authority the day somebody removed `curated.maximum_bytes` from a destination.
    """
    import importlib.util

    specification = importlib.util.spec_from_file_location("check_image_budget", GATE)
    assert specification and specification.loader
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)

    bare = tmp_path / "config"
    (bare / "somewhere").mkdir(parents=True)
    (bare / "somewhere" / "capture.json").write_text('{"curated": {}}', encoding="utf-8")

    with pytest.raises(module.UnrunnableError) as raised:
        module.per_image_cap(bare)
    assert "curated.maximum_bytes" in str(raised.value)


def test_destinations_disagreeing_about_the_cap_is_itself_a_finding(tmp_path: Path) -> None:
    """A bound that depends on which destination you asked is not a bound."""
    import importlib.util

    specification = importlib.util.spec_from_file_location("check_image_budget", GATE)
    assert specification and specification.loader
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)

    split = tmp_path / "config"
    for name, value in (("here", 1_000), ("there", 2_000)):
        (split / name).mkdir(parents=True)
        (split / name / "capture.json").write_text(
            json.dumps({"curated": {"maximum_bytes": value}}), encoding="utf-8"
        )

    cap, disagreements = module.per_image_cap(split)
    assert cap == 1_000, "the strictest destination must win while the two disagree"
    assert disagreements and "cap-disagreement" in disagreements[0]


def test_the_destinations_agree_about_the_cap_today() -> None:
    """Not a property of the gate — a property of the tree, and the reason it reads one."""
    import importlib.util

    specification = importlib.util.spec_from_file_location("check_image_budget", GATE)
    assert specification and specification.loader
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)

    _, disagreements = module.per_image_cap()
    assert not disagreements, disagreements
