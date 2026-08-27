"""Run every publication gate, report all of them, fail if any of them failed (FR-004).

    python site/gates/run_gates.py --site site/build

There is no list of gates in this file, and that is the point. The gates are whatever
``check_*.py`` files sit beside it, so adding one is adding a file and nothing here
changes. ``scripts/gates.sh`` reaches the same property through a registry; here the
directory is the registry, because a gate has no ordering constraints and no command
line of its own to record.

Three decisions worth stating.

**Every gate runs, even after one fails.** A runner that stopped at the first failure
reports one fault per run: fix it, run again, find the next. The exit code aggregates;
the output is the whole picture. ``--fail-fast`` is available for the times you want the
opposite, and is never what continuous integration should use.

**"Could not run" is its own outcome.** A gate exits 2 when something it depends on is
absent — the image-text gate needs an optical character recognition engine that is
present in continuous integration and absent in a development container. That is not a
pass and it is not a finding: it is a run that concluded nothing, and it is reported
under its own heading and dominates the exit code. A gate that cannot run has told you
that this run does not prove what a clean run proves.

A gate that never returns is the same outcome reached more slowly, so every gate is
given a deadline and one that overruns it is reported alongside the gates that said
they could not run. The default is generous because a gate that reads every published
image is legitimately slow; it is there to stop a publication pipeline hanging until
somebody notices, not to hurry anything along. `--timeout 0` removes it.

**No option is forwarded to the gates except the built site.** Each gate defaults to the
documentation manifest's committed location, which every gate that needs one reads for
itself. Forwarding an option that only some gates accept would break the ones that do
not, and the runner cannot know which is which without naming them.

Exit codes, which are the runner's own and not any gate's:

    0   every gate ran and found nothing
    1   every gate ran, at least one found something
    2   at least one gate could not run, or the runner itself could not start
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

GATE_GLOB = "check_*.py"

CLEAN = 0
FINDINGS = 1
CANNOT_RUN = 2

# Not an exit code any gate can return, so it lands among the outcomes that concluded
# nothing without needing a special case in the classification.
OVERRAN = -1

DEFAULT_TIMEOUT = 300


@dataclass(frozen=True)
class Outcome:
    """What one gate did."""

    name: str
    status: int
    output: str
    note: str = ""

    @property
    def cannot_run(self) -> bool:
        # Anything that is not a documented exit code is a gate that crashed, which is
        # a gate that concluded nothing. It is reported with the ones that said so.
        return self.status not in (CLEAN, FINDINGS)


def discover(directory: Path) -> list[Path]:
    """Every gate in ``directory``, in a stable order.

    Sorted so that two runs over the same tree produce the same transcript; a diff
    between two runs should show what changed in the gates, not what changed in the
    order the filesystem happened to hand them over.
    """
    return sorted(path for path in directory.glob(GATE_GLOB) if path.is_file())


def decoded(said: str | bytes | None) -> str:
    """Whatever a process wrote, as text."""
    if said is None:
        return ""
    return said if isinstance(said, str) else said.decode("utf-8", errors="replace")


def run_one(gate: Path, site: Path, *, cwd: Path, timeout: float | None) -> Outcome:
    """Run one gate and capture everything it said."""
    try:
        completed = subprocess.run(
            [sys.executable, str(gate), "--site", str(site)],
            capture_output=True,
            text=True,
            check=False,
            cwd=cwd,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as overran:
        # `text=True` does not reach the exception: what a stopped process managed to
        # write arrives as bytes, and throwing it away would lose the last thing the
        # gate said before it hung, which is usually the whole clue.
        said = decoded(overran.stdout) + decoded(overran.stderr)
        reason = f"did not finish within {timeout:g}s and was stopped"
        return Outcome(name=gate.stem, status=OVERRAN, output=said + reason, note=reason)
    output = completed.stdout + completed.stderr
    return Outcome(name=gate.stem, status=completed.returncode, output=output)


def report(outcomes: list[Outcome], stream: TextIO) -> int:
    """Print the summary and return the runner's exit code."""
    blocked = [outcome for outcome in outcomes if outcome.cannot_run]
    dirty = [outcome for outcome in outcomes if outcome.status == FINDINGS]

    print(f"── {len(outcomes)} gate(s) ran", file=stream)

    if blocked:
        print(f"could not run ({len(blocked)}):", file=stream)
        for outcome in blocked:
            said = outcome.note or f"exited {outcome.status}"
            print(f"  {outcome.name} {said}", file=stream)
    if dirty:
        print(f"findings ({len(dirty)}):", file=stream)
        for outcome in dirty:
            print(f"  {outcome.name}", file=stream)

    if blocked:
        print(
            "gates: this run concluded nothing about the gates above. A gate that could "
            "not run is not a gate that passed.",
            file=stream,
        )
        return CANNOT_RUN
    if dirty:
        print(f"gates: {len(dirty)} of {len(outcomes)} found something.", file=stream)
        return FINDINGS

    print(f"gates: all {len(outcomes)} clean.", file=stream)
    return CLEAN


def parse(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="the built site to run the gates over")
    parser.add_argument(
        "--gates-dir",
        default=None,
        help="where the gates live; defaults to the directory holding this runner",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help="seconds a single gate may take before it is stopped; 0 removes the deadline",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="stop at the first gate that fails instead of reporting all of them",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    arguments = parse(argv)

    here = Path(__file__).resolve().parent
    directory = Path(arguments.gates_dir).resolve() if arguments.gates_dir else here
    if not directory.is_dir():
        print(f"gates: no gate directory at {directory}.", file=sys.stderr)
        return CANNOT_RUN

    gates = discover(directory)
    if not gates:
        print(
            f"gates: {directory} holds no {GATE_GLOB}. Nothing was checked, and an empty "
            "run must not be mistaken for a clean one.",
            file=sys.stderr,
        )
        return CANNOT_RUN

    site = Path(arguments.site)
    # The gates run from the repository root so that a relative path in one of them —
    # the documentation manifest, the requirements document — resolves the same way
    # whichever directory the runner was invoked from.
    root = here.parent.parent

    deadline = arguments.timeout if arguments.timeout > 0 else None

    outcomes: list[Outcome] = []
    for gate in gates:
        outcome = run_one(gate, site, cwd=root, timeout=deadline)
        outcomes.append(outcome)
        print(f"── {outcome.name}")
        if outcome.output.strip():
            print(outcome.output.rstrip())
        print()
        if arguments.fail_fast and outcome.status != CLEAN:
            break

    return report(outcomes, sys.stdout)


if __name__ == "__main__":
    raise SystemExit(main())
