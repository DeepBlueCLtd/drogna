"""Recovery error, reported with units and without a verdict.

Constitution IX: recovery error is computed and reported, never asserted. "The eddy is
recoverable" is meaningless without the error figure beside it, and AT-03 has to be able to
quote figures rather than adjectives. So everything here returns numbers with units and
none of it returns a judgement — no boolean, no threshold, no grade. Whether an error is
small enough is a question about what the harness is being used for, and it belongs to
whoever is using it, not to the thing that measured it.

Errors are computed against :mod:`~harness_env_generator.evaluator`, not against the stored
grid. Scoring against the file would fold the field's own discretisation into the figure:
an eddy centre recovered perfectly would still show an error of up to half a grid cell, and
the report would be measuring the grid. The manifest's analytic form has no such floor.

Two shapes of report:

- **A feature's parameters.** For the eddy of SRD FR-03, the three figures AT-03 names: the
  distance between the recovered and true centres in kilometres, the radius error in
  kilometres, and the strength error in the strength's own units.
- **A field or a route.** For AT-01, per-variable mean absolute error, root mean square
  error and largest absolute error over whatever sample of points was supplied, with the
  count, because an error figure without its sample size is not a figure.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_env_generator.evaluator import VARIABLES, Evaluator
from harness_env_generator.features.kernels import LocalPlane

__all__ = [
    "ErrorFigure",
    "RecoveryReport",
    "score_eddy_recovery",
    "score_point_recovery",
]

_UNITS_BY_ATTRIBUTE = {spec.attribute: spec.units for spec in VARIABLES}


@dataclass(frozen=True)
class ErrorFigure:
    """One number, what it measures, and what it is in. Never a verdict."""

    quantity: str
    value: float
    units: str

    def as_document(self) -> dict[str, Any]:
        return {"quantity": self.quantity, "value": self.value, "units": self.units}

    def __str__(self) -> str:
        return f"{self.quantity}: {self.value:.6g} {self.units}"


@dataclass(frozen=True)
class RecoveryReport:
    """What was compared, how many points it rested on, and the figures. No conclusion."""

    subject: str
    sample_count: int
    figures: tuple[ErrorFigure, ...]

    def as_document(self) -> dict[str, Any]:
        return {
            "subject": self.subject,
            "sample_count": self.sample_count,
            "figures": [figure.as_document() for figure in self.figures],
        }

    def figure(self, quantity: str) -> ErrorFigure:
        for figure in self.figures:
            if figure.quantity == quantity:
                return figure
        raise KeyError(f"this report carries no figure named {quantity!r}")


def _feature_entry(manifest: Mapping[str, Any], feature_id: str) -> Mapping[str, Any]:
    for entry in manifest["features"]:
        if entry["id"] == feature_id:
            return entry
    known = ", ".join(sorted(str(entry["id"]) for entry in manifest["features"]))
    raise KeyError(f"this manifest describes no feature {feature_id!r}; it has {known}")


def score_eddy_recovery(
    manifest: Mapping[str, Any],
    *,
    feature_id: str,
    centre_latitude: float,
    centre_longitude: float,
    radius_km: float,
    strength_c: float,
) -> RecoveryReport:
    """The three figures AT-03 quotes for an eddy, against the manifest's ground truth.

    ``strength_c`` is compared as a magnitude, because the manifest records the sign
    separately: a recovered eddy of the wrong sign is not a small strength error, and
    folding the two together would report it as one.
    """
    entry = _feature_entry(manifest, feature_id)
    truth = entry["parameters"]
    plane = LocalPlane(float(truth["centre_latitude"]))
    east = plane.east_km(centre_longitude, float(truth["centre_longitude"]))
    north = plane.north_km(centre_latitude, float(truth["centre_latitude"]))
    return RecoveryReport(
        subject=f"{entry['kind']} {feature_id}",
        sample_count=1,
        figures=(
            ErrorFigure("centre_error", math.hypot(east, north), "km"),
            ErrorFigure("radius_error", abs(radius_km - float(truth["radius_km"])), "km"),
            ErrorFigure("strength_error", abs(strength_c - float(truth["strength_c"])), "degree_C"),
        ),
    )


def score_point_recovery(
    manifest: Mapping[str, Any],
    samples: Iterable[tuple[Sequence[float], Mapping[str, float]]],
    *,
    subject: str = "field",
) -> RecoveryReport:
    """Per-variable error over a set of points, for a recovered field or a queried route.

    Each sample is a point ``(latitude, longitude, depth_m, time_s)`` and a mapping from
    the evaluator's attribute names to the recovered values. Variables absent from a sample
    are not scored for that sample, so a route carrying only temperature reports only
    temperature rather than reporting zeros for everything else.
    """
    evaluator = Evaluator.from_manifest(manifest)
    residuals: dict[str, list[float]] = {}
    count = 0
    for point, recovered in samples:
        latitude, longitude, depth_m, time_s = point
        truth = evaluator.at(latitude, longitude, depth_m, time_s).as_mapping()
        count += 1
        for attribute, value in recovered.items():
            residuals.setdefault(attribute, []).append(value - truth[attribute])

    figures: list[ErrorFigure] = []
    for attribute in sorted(residuals):
        errors = residuals[attribute]
        units = _UNITS_BY_ATTRIBUTE.get(attribute, "unknown")
        mean_absolute = sum(abs(error) for error in errors) / len(errors)
        root_mean_square = math.sqrt(sum(error * error for error in errors) / len(errors))
        figures.extend(
            (
                ErrorFigure(f"{attribute}.mean_absolute_error", mean_absolute, units),
                ErrorFigure(f"{attribute}.root_mean_square_error", root_mean_square, units),
                ErrorFigure(
                    f"{attribute}.max_absolute_error", max(abs(error) for error in errors), units
                ),
            )
        )
    return RecoveryReport(subject=subject, sample_count=count, figures=tuple(figures))
