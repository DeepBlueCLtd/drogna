"""The world the sensors sample: the environment generator's ground truth, evaluated.

The generator writes a field file and a manifest of the seeded parameters that produced it.
This reads the manifest and evaluates the analytic form, rather than reading the field file
and interpolating. That is the interface AT-01 and AT-03 score against, and it matters
here for the same reason it matters there: a sampled value taken from the interpolated
grid would be the truth plus an interpolation, and the difference between a stored
observation and the field at its own coordinates would then be partly an artefact of the
sampling rather than the sensor noise it is supposed to measure.

Sound speed is deliberately not exposed. The evaluator can derive it — one implementation,
in ``libs/harness_core`` — and the monitor calls that at the point of use. A sensor that
could read it here would be one edit away from publishing it (ADR-0005).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path

from harness_core.clock import SimInstant
from harness_env_generator.evaluator import Evaluator

__all__ = ["GeneratedField", "field_from_config"]

_MICROS_PER_SECOND = 1_000_000


class GeneratedField:
    """A generated world, addressed by position and simulation instant.

    The evaluator counts time in seconds from the manifest's own origin, so the conversion
    from a simulation instant happens here and in exactly one place.
    """

    def __init__(self, evaluator: Evaluator) -> None:
        self._evaluator = evaluator
        self._origin = SimInstant.from_iso(evaluator.grid.time.origin_sim_time)

    @classmethod
    def from_manifest_document(cls, document: Mapping[str, object]) -> GeneratedField:
        return cls(Evaluator.from_manifest(document))

    @property
    def origin(self) -> SimInstant:
        """The manifest's time origin. Sampling before it is outside the world it describes."""
        return self._origin

    def at(
        self, *, latitude: float, longitude: float, depth_m: float, instant: SimInstant
    ) -> Mapping[str, float]:
        """The three measured quantities at a point. Not sound speed, and not the timescale."""
        seconds = (instant - self._origin) / _MICROS_PER_SECOND
        truth = self._evaluator.at(latitude, longitude, depth_m, seconds)
        return {
            "temperature": truth.temperature_c,
            "salinity": truth.salinity_psu,
            "pressure": truth.pressure_dbar,
        }


def field_from_config(section: Mapping[str, object]) -> GeneratedField:
    """Build the field from the ``field`` section: a directory and a manifest file name."""
    directory = Path(str(section["directory"]))
    manifest = directory / str(section["manifest_file"])
    document = json.loads(manifest.read_text(encoding="utf-8"))
    return GeneratedField.from_manifest_document(document)
