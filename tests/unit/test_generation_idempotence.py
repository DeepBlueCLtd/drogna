"""Generation is deterministic, banner-marked, and refuses what it cannot do safely.

The drift check compares bytes, so anything unstable in generation — an embedded
timestamp, a hash-ordered member, a path from the machine that ran it — would show up as a
failure nobody's change caused, and a check that cries wolf is a check that gets moved out
of the default job. The first test here is the one that keeps that from happening.

The rest rehearse the failure modes the specification promises: a colliding type name, a
reference that does not resolve, and a shape written out in an OpenAPI document instead of
referenced. Each must fail loudly, because the alternative in every case is a plausible
wrong answer.
"""

from __future__ import annotations

import filecmp
import json
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CHAIN = REPO_ROOT / "scripts" / "generate_types.py"
MANIFEST = REPO_ROOT / "contracts" / "openapi" / "generators.toml"

GENERATED = (
    REPO_ROOT / "libs" / "harness_types" / "src" / "harness_types",
    REPO_ROOT / "client" / "src" / "generated",
)


def generate(into: Path, root: Path = REPO_ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CHAIN), "--root", str(root), "--into", str(into)],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture
def contracts(tmp_path: Path) -> Path:
    """A repository whose contracts can be broken without breaking the real ones."""
    root = tmp_path / "repository"
    shutil.copytree(REPO_ROOT / "contracts", root / "contracts")
    return root


def _tree(root: Path) -> list[str]:
    return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())


def test_two_runs_over_unchanged_sources_are_byte_identical(tmp_path: Path) -> None:
    first, second = tmp_path / "first", tmp_path / "second"
    assert generate(first).returncode == 0
    assert generate(second).returncode == 0

    assert _tree(first) == _tree(second)
    for relative in _tree(first):
        assert filecmp.cmp(first / relative, second / relative, shallow=False), (
            f"{relative} differs between two runs over identical sources"
        )


def test_every_generated_file_carries_the_banner() -> None:
    """SC-006: the count of generated files without a DO NOT EDIT banner is zero."""
    checked = 0
    for directory in GENERATED:
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.suffix not in {".py", ".ts"}:
                continue
            head = path.read_text(encoding="utf-8").splitlines()[:3]
            assert head, f"{path} is empty"
            assert "DO NOT EDIT" in head[0], f"{path} has no banner"
            assert "generate_types.sh" in " ".join(head), f"{path} does not name its generator"
            assert any("contracts/" in line for line in head), f"{path} does not name its source"
            checked += 1
    assert checked > 0, "no generated files were examined, which is not a passing check"


def test_a_type_name_claimed_by_two_masters_fails(contracts: Path, tmp_path: Path) -> None:
    original = contracts / "contracts" / "schemas" / "clock.schema.json"
    document = json.loads(original.read_text(encoding="utf-8"))
    document["$id"] = "https://schemas.harness.invalid/clock-copy.schema.json"
    (original.parent / "clock-copy.schema.json").write_text(
        json.dumps(document, indent=2) + "\n", encoding="utf-8"
    )

    result = generate(tmp_path / "out", root=contracts)

    assert result.returncode != 0, "two masters were allowed to claim one type name"
    assert "clock.schema.json" in result.stderr
    assert "clock-copy.schema.json" in result.stderr


def test_a_reference_that_does_not_resolve_fails(contracts: Path, tmp_path: Path) -> None:
    master = contracts / "contracts" / "schemas" / "clock.schema.json"
    document = json.loads(master.read_text(encoding="utf-8"))
    document["properties"]["mode"] = {"$ref": "https://schemas.harness.invalid/absent.schema.json"}
    master.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    result = generate(tmp_path / "out", root=contracts)

    assert result.returncode != 0, "an unresolvable reference was accepted"
    assert "absent.schema.json" in result.stderr


def test_a_reference_to_a_document_on_the_network_fails(contracts: Path, tmp_path: Path) -> None:
    """FR-016: every referenced document is in the repository. Nothing is fetched."""
    master = contracts / "contracts" / "schemas" / "clock.schema.json"
    document = json.loads(master.read_text(encoding="utf-8"))
    document["properties"]["mode"] = {"$ref": "https://json-schema.org/draft/2020-12/schema"}
    master.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    result = generate(tmp_path / "out", root=contracts)

    assert result.returncode != 0, "a reference to a document on the network was accepted"
    assert "network" in result.stderr


def test_a_shape_written_out_in_an_openapi_document_fails(contracts: Path, tmp_path: Path) -> None:
    """NFR-02: where a shape appears in both, the OpenAPI document references it."""
    document = contracts / "contracts" / "openapi" / "harness.openapi.yaml"
    document.write_text(
        document.read_text(encoding="utf-8").replace(
            "      $ref: ../schemas/clock.schema.json",
            "      type: object\n      properties:\n        run_id:\n          type: string",
        ),
        encoding="utf-8",
    )

    result = generate(tmp_path / "out", root=contracts)

    assert result.returncode != 0, "a restated shape was accepted"
    assert "referencing one" in result.stderr


def test_the_generators_are_pinned_to_what_is_installed() -> None:
    """FR-010: the manifest's account of what wrote the tree is checked, not assumed."""
    from importlib.metadata import version

    with MANIFEST.open("rb") as handle:
        manifest = tomllib.load(handle)
    pinned = {entry["name"]: entry.get("version") for entry in manifest["tool"]}

    for package in ("datamodel-code-generator", "black", "isort"):
        assert pinned[package] == version(package), (
            f"{package} is pinned at {pinned[package]} and installed at {version(package)}"
        )


def test_the_bundle_is_not_committed() -> None:
    """The bundled intermediates are build artefacts; the masters stay authoritative."""
    assert not (REPO_ROOT / "contracts" / "bundle").exists()
