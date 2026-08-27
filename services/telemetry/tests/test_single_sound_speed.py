"""Exactly one sound-speed implementation is reachable from this package. SC-010, ADR-0005.

Sound speed is derived at the point of use by one implementation in `harness_core`. A second
copy anywhere would make a recovery error partly an artefact of the disagreement between
copies, which is the failure AT-03 exists to detect — so the count is asserted rather than
assumed, by looking for the equation's coefficients in the source rather than by trusting a
review to notice one being pasted in.
"""

from __future__ import annotations

import re
from pathlib import Path

import harness_core.soundspeed as shared
import harness_telemetry

PACKAGE = Path(harness_telemetry.__file__).resolve().parent

# The leading constant of the Mackenzie (1981) fit, and the salinity reference it is written
# against. Either appearing here would mean the equation had been copied in.
COEFFICIENTS = (re.compile(r"1448\.96"), re.compile(r"4\.591"), re.compile(r"5\.304e-2"))


def sources() -> list[Path]:
    return sorted(PACKAGE.rglob("*.py"))


def test_no_module_in_this_package_carries_the_equation() -> None:
    offending = [
        f"{path.relative_to(PACKAGE)}: {pattern.pattern}"
        for path in sources()
        for pattern in COEFFICIENTS
        if pattern.search(path.read_text(encoding="utf-8"))
    ]

    assert offending == [], "the sound-speed equation has been copied into this package"


def test_the_one_implementation_is_the_shared_one() -> None:
    assert Path(shared.__file__).resolve().parent.name == "harness_core"
    assert shared.EQUATION == "mackenzie-1981"


def test_the_equation_name_this_component_publishes_comes_from_that_module() -> None:
    """The name travels with every skill report, so it must not be spelt out a second time."""
    from harness_telemetry import publish

    assert publish.EQUATION is shared.EQUATION
