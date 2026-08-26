"""The runner behind FR-036's single command, tested where it can be told from a no-op.

Six gates and a drift check are useless behind a runner that reports "clean" whatever they
say. Every test here drives `scripts/gates.sh` at a registry it was given, so a gate that
must fail can be handed to it without planting anything in the real one.

The registry indirection is the whole reason FR-036's second half is satisfiable: the
runner names no gate, so the tests can give it gates that do not exist, and a later
feature can add one by appending a line.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "scripts" / "gates.sh"
REGISTRY = ROOT / "scripts" / "gates.registry"

CLEAN = "python3 -c 'raise SystemExit(0)'"
DIRTY = "python3 -c 'print(\"probe: 1 violation(s).\"); raise SystemExit(1)'"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(RUNNER), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def registry(tmp_path: Path, *lines: str) -> str:
    path = tmp_path / "gates.registry"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(path)


def test_a_failing_gate_fails_the_run(tmp_path: Path) -> None:
    """The assertion the rest depend on: the runner can report a failure."""
    result = run("--registry", registry(tmp_path, f"probe|{DIRTY}"), "--no-inventory")
    assert result.returncode == 1, result.stdout
    assert "1 of 1 failed" in result.stdout
    assert "probe" in result.stdout


def test_a_clean_gate_passes(tmp_path: Path) -> None:
    result = run("--registry", registry(tmp_path, f"probe|{CLEAN}"), "--no-inventory")
    assert result.returncode == 0, result.stdout
    assert "all 1 clean" in result.stdout


def test_one_failure_does_not_hide_the_gates_after_it(tmp_path: Path) -> None:
    """A runner that stopped at the first failure would report one violation per run."""
    listing = registry(
        tmp_path,
        f"first|{DIRTY}",
        f"second|{CLEAN}",
        f"third|{DIRTY}",
    )
    result = run("--registry", listing, "--no-inventory")
    assert result.returncode == 1
    assert "2 of 3 failed" in result.stdout
    assert "  first" in result.stdout
    assert "  third" in result.stdout


def test_fail_fast_stops_at_the_first_failure(tmp_path: Path) -> None:
    listing = registry(tmp_path, f"first|{DIRTY}", f"second|{DIRTY}")
    result = run("--registry", listing, "--no-inventory", "--fail-fast")
    assert result.returncode == 1
    assert "1 of 1 failed" in result.stdout


def test_an_empty_registry_is_a_failure_not_a_pass(tmp_path: Path) -> None:
    """Nothing checked and everything clean must not look the same from outside."""
    result = run("--registry", registry(tmp_path, "# only a comment"), "--no-inventory")
    assert result.returncode == 2, result.stdout
    assert "registers nothing" in result.stderr


def test_a_missing_registry_is_a_failure_not_a_pass(tmp_path: Path) -> None:
    result = run("--registry", str(tmp_path / "absent"), "--no-inventory")
    assert result.returncode == 2
    assert "no registry" in result.stderr


def test_a_registry_line_without_a_command_is_refused(tmp_path: Path) -> None:
    result = run("--registry", registry(tmp_path, "a label and no bar"), "--no-inventory")
    assert result.returncode == 2
    assert "names no command" in result.stderr


def test_comments_and_blank_lines_are_not_gates(tmp_path: Path) -> None:
    listing = registry(tmp_path, "# a comment", "", f"probe|{CLEAN}", "")
    result = run("--registry", listing, "--no-inventory")
    assert result.returncode == 0
    assert "all 1 clean" in result.stdout


def test_the_inventory_is_printed_once(tmp_path: Path) -> None:
    """FR-034 asks for one list, not one per gate."""
    listing = registry(tmp_path, f"first|{CLEAN}", f"second|{CLEAN}")
    result = run("--registry", listing)
    assert result.returncode == 0
    assert result.stdout.count("Exemption inventory:") == 1


def test_an_unknown_option_is_refused(tmp_path: Path) -> None:
    result = run("--not-an-option")
    assert result.returncode == 2
    assert "unknown option" in result.stderr


@pytest.mark.parametrize("line", REGISTRY.read_text(encoding="utf-8").splitlines())
def test_every_registered_gate_names_a_command_that_exists(line: str) -> None:
    """A registry entry pointing at a deleted script would run nothing and say so quietly."""
    if not line.strip() or line.lstrip().startswith("#"):
        pytest.skip("not a gate line")
    label, _, command = line.partition("|")
    assert command.strip(), f"{label}: no command"
    script = next(word for word in command.split() if "scripts/" in word)
    assert (ROOT / script).exists(), f"{label}: {script} does not exist"


def test_the_registry_covers_every_gate_in_the_scripts_directory() -> None:
    """A gate added to scripts/ but never registered is a gate nobody runs."""
    registered = REGISTRY.read_text(encoding="utf-8")
    on_disk = {path.name for path in (ROOT / "scripts").glob("check_*.py")}
    on_disk |= {path.name for path in (ROOT / "scripts").glob("check_*.sh")}
    # check_config.sh validates one destination's configuration on demand; it is not a
    # tree-wide constitution gate and takes a destination argument, so it is not here.
    on_disk -= {"check_config.sh", "check_destination_parity.sh"}
    missing = sorted(name for name in on_disk if name not in registered)
    assert not missing, f"gates in scripts/ that scripts/gates.registry does not run: {missing}"
