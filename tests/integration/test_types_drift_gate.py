"""The drift check is handed each way the generated trees can disagree with their masters.

A check that has never failed is not a check, and a generated tree is only trustworthy
because something proves it is current. Each case below plants one divergence in a copy of
the repository — a schema edited without regenerating, a generated file edited by hand, one
deleted, one invented — and asserts the check reports it and leaves the tree alone.

The copy matters. The check regenerates into a scratch directory and compares; pointing it
at the real repository would prove only that the repository is currently clean, which is
what the last line of this file asserts on purpose and separately.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CHAIN = REPO_ROOT / "scripts" / "generate_types.py"
MANIFEST = REPO_ROOT / "contracts" / "openapi" / "generators.toml"

COPIED = (
    Path("contracts"),
    Path("libs") / "harness_types" / "src" / "harness_types",
    Path("client") / "src" / "generated",
)


def _copy_targets() -> tuple[Path, ...]:
    with MANIFEST.open("rb") as handle:
        manifest = tomllib.load(handle)
    return tuple(Path(entry["target"]) for entry in manifest.get("copy", []))


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    """A copy of everything the chain reads and writes, and nothing else."""
    root = tmp_path / "repository"
    for relative in COPIED:
        shutil.copytree(REPO_ROOT / relative, root / relative)
    for relative in _copy_targets():
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO_ROOT / relative, destination)
    return root


def fingerprint(root: Path) -> dict[str, str]:
    """Every file under the sandbox, by content, so a check that writes is caught."""
    digests: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            digests[path.relative_to(root).as_posix()] = digest
    return digests


def check(root: Path, **environment: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CHAIN), "--check", "--root", str(root)],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, **environment},
    )


def generated_python(root: Path) -> Path:
    return root / "libs" / "harness_types" / "src" / "harness_types" / "messages" / "clock.py"


def generated_typescript(root: Path) -> Path:
    return root / "client" / "src" / "generated" / "messages" / "clock.ts"


def test_a_matching_tree_passes(sandbox: Path) -> None:
    result = check(sandbox)

    assert result.returncode == 0, result.stdout + result.stderr


def test_a_schema_edited_without_regenerating_fails(sandbox: Path) -> None:
    master = sandbox / "contracts" / "schemas" / "clock.schema.json"
    document = json.loads(master.read_text(encoding="utf-8"))
    document["properties"]["cadence_note"] = {"type": "string", "description": "Added by a test."}
    master.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    result = check(sandbox)

    assert result.returncode != 0, "a schema changed without regeneration was accepted"
    assert "clock.py" in result.stdout
    assert "cadence_note" in result.stdout


def test_a_hand_edited_python_model_fails(sandbox: Path) -> None:
    path = generated_python(sandbox)
    path.write_text(
        path.read_text(encoding="utf-8").replace("run_id: str", "run_id: str | None"),
        encoding="utf-8",
    )

    result = check(sandbox)

    assert result.returncode != 0, "a hand-edited generated file was accepted"
    assert "clock.py" in result.stdout


def test_a_hand_edited_typescript_type_fails(sandbox: Path) -> None:
    path = generated_typescript(sandbox)
    path.write_text(
        path.read_text(encoding="utf-8").replace("run_id: string;", "run_id?: string;"),
        encoding="utf-8",
    )

    result = check(sandbox)

    assert result.returncode != 0, "a hand-edited generated file was accepted"
    assert "clock.ts" in result.stdout


def test_a_deleted_generated_file_fails(sandbox: Path) -> None:
    generated_typescript(sandbox).unlink()

    result = check(sandbox)

    assert result.returncode != 0
    assert "missing" in result.stdout


def test_a_generated_file_no_master_accounts_for_fails(sandbox: Path) -> None:
    invented = sandbox / "client" / "src" / "generated" / "messages" / "invented.ts"
    invented.write_text("export interface Invented { a: string }\n", encoding="utf-8")

    result = check(sandbox)

    assert result.returncode != 0
    assert "invented.ts" in result.stdout


def test_a_packaged_schema_copy_that_has_drifted_fails(sandbox: Path) -> None:
    """The copies inside component packages are an output of the chain, and are checked."""
    copy = sandbox / _copy_targets()[0]
    document = json.loads(copy.read_text(encoding="utf-8"))
    document["description"] = "Edited in the copy rather than in the master."
    copy.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    result = check(sandbox)

    assert result.returncode != 0
    assert copy.name in result.stdout


@pytest.mark.parametrize("planted", [False, True], ids=["passing", "failing"])
def test_the_check_leaves_the_tree_unmodified(sandbox: Path, planted: bool) -> None:
    if planted:
        generated_python(sandbox).write_text("# hand edited\n", encoding="utf-8")
    before = fingerprint(sandbox)

    check(sandbox)

    assert fingerprint(sandbox) == before


def test_the_check_passes_with_the_network_unreachable(sandbox: Path) -> None:
    """FR-009: the check reads the repository and nothing else.

    Every proxy variable is pointed at a closed port, so anything that tried to fetch a
    referenced document would fail rather than quietly succeed on a machine that happens
    to be online.
    """
    dead = "http://127.0.0.1:1"
    result = check(
        sandbox,
        http_proxy=dead,
        https_proxy=dead,
        HTTP_PROXY=dead,
        HTTPS_PROXY=dead,
        no_proxy="",
        NO_PROXY="",
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_the_repository_itself_is_current() -> None:
    """The case CI cares about: what is committed matches what the masters generate."""
    result = subprocess.run(
        [sys.executable, str(CHAIN), "--check"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
