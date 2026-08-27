"""The site gate runner, tested where it can be told from a no-op (T007).

Five gates behind a runner that reports "clean" whatever they say are five gates that do
nothing. Every test here drives `site/gates/run_gates.py` at a gate directory it was
given, so a gate that must fail, or must be unable to run, can be handed to it without
planting anything among the real ones. That indirection is the same trick
`scripts/tests/test_gates_runner.py` plays with `--registry`, and it exists for the same
reason.

The control gates live in `site/gates/fixtures/failing_gate/` and are committed rather
than written into a temporary directory, so that the thing the runner is tested against
is reviewable and cannot drift into agreeing with the runner by accident.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

GATES = Path(__file__).resolve().parents[1]
RUNNER = GATES / "run_gates.py"
FIXTURES = GATES / "fixtures" / "failing_gate"
ROOT = GATES.parents[1]

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(RUNNER), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def gate_directory(tmp_path: Path, *names: str) -> str:
    """A directory holding only the named control gates.

    A name may be given as `control:as`, which copies the control gate `control` under
    the name `as`. That is how a test places a failing gate somewhere other than last in
    the discovery order — a runner that stopped at the first failure would otherwise
    pass, because the gate it skipped was the one after the end.
    """
    directory = tmp_path / "gates"
    directory.mkdir(exist_ok=True)
    for name in names:
        control, _, alias = name.partition(":")
        shutil.copy(
            FIXTURES / ("check_" + control + ".py"),
            directory / ("check_" + (alias or control) + ".py"),
        )
    return str(directory)


def test_a_gate_that_finds_something_fails_the_run(tmp_path: Path) -> None:
    """The assertion every other test here leans on: the runner can report a failure."""
    result = run("--site", str(tmp_path), "--gates-dir", gate_directory(tmp_path, "beta"))
    assert result.returncode == FINDINGS, result.stdout
    assert "check_beta" in result.stdout
    assert "beta.planted" in result.stdout
    assert "1 of 1 found something" in result.stdout


def test_a_gate_that_finds_nothing_passes(tmp_path: Path) -> None:
    result = run("--site", str(tmp_path), "--gates-dir", gate_directory(tmp_path, "alpha"))
    assert result.returncode == CLEAN, result.stdout
    assert "all 1 clean" in result.stdout


def test_every_gate_runs_even_after_one_fails(tmp_path: Path) -> None:
    """A runner that stopped at the first failure would report one fault per run."""
    # The failing gate is placed first in the discovery order, so a runner that stopped
    # at the first failure would never reach `zulu` and this test would say so.
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "beta:aardvark", "alpha:zulu"),
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "check_aardvark" in result.stdout
    assert "check_zulu" in result.stdout
    assert result.stdout.count("beta.planted") == 2
    assert "2 gate(s) ran" in result.stdout


def test_a_gate_that_never_returns_is_stopped_and_reported(tmp_path: Path) -> None:
    """A gate that hangs is a run that concluded nothing, reached more slowly.

    Without a deadline the publication pipeline waits for a gate that will never answer,
    and nothing distinguishes that from a gate still working. One of the gates in this
    directory has hung in practice, which is why this exists.
    """
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "delta"),
        "--timeout",
        "2",
    )
    assert result.returncode == CANNOT_RUN, result.stdout
    assert "could not run (1)" in result.stdout
    assert "did not finish within 2s" in result.stdout
    # What it managed to say before it hung is not thrown away.
    assert "delta: about to hang" in result.stdout


def test_a_deadline_does_not_stop_a_gate_that_answers(tmp_path: Path) -> None:
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "alpha"),
        "--timeout",
        "30",
    )
    assert result.returncode == CLEAN, result.stdout


def test_a_gate_that_could_not_run_is_reported_as_its_own_outcome(tmp_path: Path) -> None:
    result = run("--site", str(tmp_path), "--gates-dir", gate_directory(tmp_path, "gamma"))
    assert result.returncode == CANNOT_RUN, result.stdout
    assert "could not run (1)" in result.stdout
    assert "check_gamma exited 2" in result.stdout
    # The reason the gate gave has to survive to the transcript, or exit 2 is a shrug.
    assert "engine this control stands in for is absent" in result.stdout


def test_could_not_run_is_not_folded_into_findings(tmp_path: Path) -> None:
    """Both outcomes are listed, and the run that concluded nothing sets the code."""
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "alpha", "beta", "gamma"),
    )
    assert result.returncode == CANNOT_RUN, result.stdout
    assert "could not run (1)" in result.stdout
    assert "findings (1)" in result.stdout
    assert "3 gate(s) ran" in result.stdout


def test_could_not_run_is_never_a_pass(tmp_path: Path) -> None:
    """The outcome this runner exists to keep loud."""
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "alpha", "gamma"),
    )
    assert result.returncode != CLEAN, result.stdout
    assert "clean" not in result.stdout


def test_fail_fast_stops_at_the_first_failure(tmp_path: Path) -> None:
    result = run(
        "--site",
        str(tmp_path),
        "--gates-dir",
        gate_directory(tmp_path, "beta", "gamma"),
        "--fail-fast",
    )
    assert result.returncode == FINDINGS, result.stdout
    assert "1 gate(s) ran" in result.stdout
    assert "check_gamma" not in result.stdout


def test_an_empty_gate_directory_cannot_be_mistaken_for_a_clean_run(tmp_path: Path) -> None:
    empty = tmp_path / "gates"
    empty.mkdir()
    result = run("--site", str(tmp_path), "--gates-dir", str(empty))
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "Nothing was checked" in result.stderr


def test_a_missing_gate_directory_cannot_run(tmp_path: Path) -> None:
    result = run("--site", str(tmp_path), "--gates-dir", str(tmp_path / "nowhere"))
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "no gate directory" in result.stderr


def test_a_gate_nobody_wrote_down_is_discovered(tmp_path: Path) -> None:
    """Adding a gate is adding a file. Nothing registers it and nothing has to."""
    directory = tmp_path / "gates"
    directory.mkdir()
    leaf = directory / ("check_" + "quenelle" + ".py")
    leaf.write_text(
        "import argparse\n"
        "p = argparse.ArgumentParser()\n"
        "p.add_argument('--site', required=True)\n"
        "p.parse_args()\n"
        "print('quenelle: 1 findings')\n"
        "raise SystemExit(1)\n",
        encoding="utf-8",
    )
    result = run("--site", str(tmp_path), "--gates-dir", str(directory))
    assert result.returncode == FINDINGS, result.stdout
    assert "check_quenelle" in result.stdout


def test_a_file_that_is_not_a_gate_is_not_run(tmp_path: Path) -> None:
    directory = tmp_path / "gates"
    directory.mkdir()
    shutil.copy(FIXTURES / "check_alpha.py", directory / "check_alpha.py")
    helper = directory / "shared_helpers.py"
    helper.write_text("raise SystemExit(2)\n", encoding="utf-8")
    result = run("--site", str(tmp_path), "--gates-dir", str(directory))
    assert result.returncode == CLEAN, result.stdout + result.stderr


def test_the_runner_names_no_gate() -> None:
    """FR-004's second half, and the reason a new gate is a new file and nothing else.

    Every gate that exists is read off disk and looked for in the runner's own source. A
    hardcoded list would spell a gate the way its file is spelt, so that is what is
    searched for. If this ever fails, the runner has acquired knowledge of a particular
    gate and adding the next one will mean editing it.
    """
    discovered = sorted(path.stem for path in GATES.glob("check_*.py"))
    assert discovered, "no gates on disk, so this test would prove nothing"
    source = RUNNER.read_text(encoding="utf-8")
    named = [stem for stem in discovered if stem in source]
    assert named == [], f"the runner names {named}"


def test_the_real_gate_directory_is_what_the_runner_defaults_to(tmp_path: Path) -> None:
    """With no --gates-dir the runner uses the directory it lives in.

    Asserted through the transcript rather than by reading the code: every gate on disk
    appears in the output of a default run. The run's exit code is deliberately not
    asserted — that is the real site's business and it changes as pages are written.

    A short deadline is given because this test is about discovery and not about any
    gate's answer: a gate stopped at the deadline is still a gate that was found and
    run, and one of the gates in this directory currently takes minutes.
    """
    result = run("--site", str(tmp_path), "--timeout", "20")
    for path in sorted(GATES.glob("check_*.py")):
        assert path.stem in result.stdout, result.stdout
