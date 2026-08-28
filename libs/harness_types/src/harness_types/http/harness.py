# DO NOT EDIT.
# Generated from contracts/openapi/harness.openapi.yaml by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from collections.abc import Mapping
from typing import Final, Literal

from ..messages.clock import DrognaSimulationTimeSample

HarnessPath = Literal[
    "/clock/control",
    "/clock/snapshot",
]

HARNESS_PATHS: Final[tuple[HarnessPath, ...]] = (
    "/clock/control",
    "/clock/snapshot",
)

HARNESS_OPERATIONS: Final[Mapping[HarnessPath, Mapping[str, str]]] = {
    "/clock/control": {"post": "clockControl"},
    "/clock/snapshot": {"get": "clockSnapshot"},
}

__all__ = ["DrognaSimulationTimeSample", "HARNESS_OPERATIONS", "HARNESS_PATHS", "HarnessPath"]
