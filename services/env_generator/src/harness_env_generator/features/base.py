"""What every seeded feature is, and how randomness reaches one.

A feature answers two questions about a point: what it does to the water there
(:meth:`Feature.anomaly`) and how much of that point belongs to it
(:meth:`Feature.membership`). The first composes onto the background; the second blends
the feature's decorrelation timescale with the background's. Both come from the same
kernel and the same parameters (see :mod:`.kernels`).

**Authoring against evaluation.** A feature is *authored* from configuration, with jitter
drawn through the RNG port, and the jittered parameters are what the ground-truth manifest
records. A feature is then *evaluated* at points. ADR-0002 requires that the authored
per-feature representation does not leak to consumers, and this is where the line is
drawn: :meth:`Feature.parameters` is manifest content and scorable ground truth, while
:meth:`Feature.membership` is internal to the timescale field's evaluation and is not part
of what any consumer is handed. A consumer receives an evaluated field, never a list of
which feature it is standing in.

**The draw order is load-bearing.** Randomness enters as jitter on authored parameters and
nowhere else — there is no noise field, because a noise field would be content the
manifest could not carry, and a manifest that cannot reproduce its own field is not
evidence of anything. :class:`Draws` takes every value from one named stream in one fixed
order and records the name of each, so the manifest states the order rather than leaving a
reader to infer it from a diff.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from random import Random
from typing import Any

__all__ = ["Anomaly", "Draws", "Feature"]


@dataclass(frozen=True)
class Anomaly:
    """What one feature adds to the background at a point."""

    temperature_c: float = 0.0
    salinity_psu: float = 0.0


class Draws:
    """Every random value the generator takes, in order, from one named stream.

    Each draw is uniform on ``[-amplitude, +amplitude]``. An amplitude of zero still takes
    a draw and discards it, so switching jitter off for one parameter does not shift the
    sequence for every parameter after it — which would make two configurations that
    differ in one zero produce unrelated worlds.
    """

    def __init__(self, generator: Random) -> None:
        self._generator = generator
        self._order: list[str] = []

    @property
    def order(self) -> tuple[str, ...]:
        """The names of the draws taken, in the order they were taken."""
        return tuple(self._order)

    def symmetric(self, name: str, amplitude: float) -> float:
        """Draw a value uniform on ``[-amplitude, +amplitude]`` and record its name."""
        self._order.append(name)
        return self._generator.uniform(-1.0, 1.0) * amplitude


class Feature(ABC):
    """One of the four seeded features of SRD FR-03."""

    kind: str

    def __init__(self, identifier: str, timescale_seconds: float) -> None:
        self.id = identifier
        self.timescale_seconds = timescale_seconds

    @abstractmethod
    def anomaly(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Anomaly:
        """What this feature adds to the background at a point."""

    @abstractmethod
    def membership(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> float:
        """How much of this point belongs to the feature, between zero and one."""

    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        """The parameters as the ground-truth manifest records them, after jitter."""

    @abstractmethod
    def characteristic_scale(self) -> tuple[float, str]:
        """The scale a grid has to resolve, and its units, for the resolution ratio."""

    def as_manifest(self, *, resolution: Mapping[str, Any], time_step_seconds: float) -> dict:
        """This feature's entry in the manifest: identity, parameters and timescale."""
        return {
            "id": self.id,
            "kind": self.kind,
            "parameters": self.parameters(),
            "timescale_seconds": self.timescale_seconds,
            "timescale_to_time_step_ratio": self.timescale_seconds / time_step_seconds,
            "resolution": dict(resolution),
        }
