#!/usr/bin/env python3
"""Gate: every bundle the offload packager produces conforms to the CF version it declares.

    scripts/check_cf_conformance.py                # package the fixture run and check it
    scripts/check_cf_conformance.py --report FILE  # write the findings as JSON

SRD FR-43 asks for a CF-conforming export and this feature's FR-007 asks for the check to
be a build gate rather than something someone remembers to run. So it runs here, on every
build, over bundles produced by the packager's own code path — not over a committed file
that was conforming on the day it was committed.

**Why the check is in this repository rather than off the shelf.** The specification assumed
an off-the-shelf compliance checker and two things rule one out. The checkers worth having
read the file through a NetCDF library, and drogna writes the classic format directly and on
purpose so that byte-identity does not depend on a library version — adding the library back
to check the file reintroduces exactly the dependency the writer exists to avoid. And they
resolve the CF standard-name table over the network at run time, which FR-016 forbids and
which would make a build gate depend on the internet.

What runs instead is ``harness_offload.conformance``, which examines every rule the primer
says the file follows: the declared conventions and feature type, both instance variables'
``cf_role``, the ragged row counts summing to the sample dimension, the depth coordinate's
sign convention, the time coordinate's reference instant, every data variable's
``standard_name``, ``units`` and ``coordinates``, and the attribute allow-list. A test
asserts the primer and the check agree, so widening one without the other is visible.

The convention version comes from ``config/<destination>/offload.json``, and the check
refuses to run against a file declaring anything else: a conformance claim without a version
is a claim about nothing.

Nothing here needs a deployment, a network or a service. The fixture run is generated from a
seed, packaged into a temporary directory, and thrown away.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OFFLOAD_TESTS = REPO_ROOT / "services" / "offload" / "tests"

sys.path.insert(0, str(OFFLOAD_TESTS))

from harness_offload.conformance import check_conformance  # noqa: E402
from offload_support import (  # noqa: E402
    DEFAULT_PROFILES,
    ProfileSpec,
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    write_run,
)

GATE = "cf-conformance"

DESTINATIONS = ("local", "droplet")

# The shapes a bundle can take, each one packaged and checked. The boundary cases are here
# rather than only in the unit tests because they are the ones a writer breaks by accident:
# a single profile has no second row to reveal a row-count error, and a single level has no
# second depth to reveal an axis one.
CASES: dict[str, tuple[ProfileSpec, ...]] = {
    "ragged": DEFAULT_PROFILES,
    "one-profile": (ProfileSpec(0, 50.0, -4.0, (0.0, 10.0, 20.0)),),
    "one-level": (ProfileSpec(0, 50.0, -4.0, (12.5,)),),
    "truncated": (
        ProfileSpec(0, 50.0, -4.0, (0.0, 10.0, 20.0, 30.0)),
        ProfileSpec(600, 50.1, -4.1, (0.0,)),
    ),
}


def bundles_for(root: Path, specs: tuple[ProfileSpec, ...]) -> list[tuple[str, bytes, tuple]]:
    """Package a fixture run through the packager and hand back what it wrote."""
    write_run(root / "run", specs)
    document = configuration(root)
    packager = packager_for(
        root, destination=StubDestination(), clock=manual_clock(), document=document
    )
    report = packager.cycle()
    allowlist = tuple(document["offload"]["attributes"]["allowlist"])
    return [
        (bundle_id, packager.settings.staging.bundle_path(bundle_id).read_bytes(), allowlist)
        for bundle_id in report.staged
    ]


def declared_version(destination: str) -> str:
    document = json.loads(
        (REPO_ROOT / "config" / destination / "offload.json").read_text(encoding="utf-8")
    )
    return str(document["offload"]["compliance"]["convention_version"])


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="write the findings as JSON")
    arguments = parser.parse_args(argv)

    versions = {destination: declared_version(destination) for destination in DESTINATIONS}
    complaints: list[str] = []
    report: dict[str, object] = {"versions": versions, "cases": {}}

    if len(set(versions.values())) != 1:
        complaints.append(
            "the destinations pin different convention versions "
            f"({versions}); a bundle would be checked against one and read as the other"
        )
    version = sorted(versions.values())[0]

    with tempfile.TemporaryDirectory() as scratch:
        for name, specs in CASES.items():
            produced = bundles_for(Path(scratch) / name, specs)
            if not produced:
                complaints.append(f"{name}: the packager produced no bundle to check")
                continue
            faults: list[str] = []
            for bundle_id, payload, allowlist in produced:
                for fault in check_conformance(
                    payload, allowlist=allowlist, convention_version=version
                ):
                    faults.append(f"{bundle_id}: {fault}")
            report["cases"][name] = {"bundles": len(produced), "faults": faults}
            complaints.extend(f"{name}: {fault}" for fault in faults)
            print(f"{GATE}: {name}: {len(produced)} bundle(s), {len(faults)} error(s)")

    if arguments.report is not None:
        arguments.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if complaints:
        print(f"\n{GATE}: {len(complaints)} finding(s):", file=sys.stderr)
        for complaint in complaints:
            print(f"  {complaint}", file=sys.stderr)
        return 1

    print(f"{GATE}: clean, against {version}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
