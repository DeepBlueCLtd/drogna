"""Reading the ground-truth manifest into an initialisation state.

FR-018 has the kernel advect "the drift parameters recorded in the environment generator's
ground-truth manifest". This module is the reading of that document and the only place in
the runner that knows its shape: the manifest belongs to feature 004, this feature consumes
it, and one function to reconcile is better than a shape spread through a package.

What is taken: the spatial grid, the background parameters, and the four features with the
parameters that produced them after jitter. What is not taken: the field itself. A runner
that read the generator's arrays would be a runner with the answer in it, and its forecast
error against truth would be zero by construction — which would make Constitution IX's
scoring meaningless.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from harness_model_runner.kernel import Background, RunGrid, SeededFeature

__all__ = [
    "GroundTruthError",
    "background_from",
    "features_from",
    "grid_for",
    "spatial_axes_from",
]


class GroundTruthError(ValueError):
    """The manifest is missing something the runner cannot proceed without."""


def _axis(document: Mapping[str, Any], name: str) -> tuple[float, ...]:
    try:
        axis = document["grid"][name]
        minimum = float(axis["minimum"])
        maximum = float(axis["maximum"])
        count = int(axis["count"])
    except (KeyError, TypeError, ValueError) as exc:
        raise GroundTruthError(f"the ground-truth manifest has no usable {name} axis") from exc
    if count < 2:
        raise GroundTruthError(f"the {name} axis has fewer than two points")
    step = (maximum - minimum) / (count - 1)
    return tuple(minimum + step * index for index in range(count))


def spatial_axes_from(
    document: Mapping[str, Any],
) -> tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]:
    """Latitude, longitude and depth, as extent and count rather than as accumulated steps."""
    return _axis(document, "latitude"), _axis(document, "longitude"), _axis(document, "depth")


def background_from(document: Mapping[str, Any]) -> Background:
    """The background the run initialises from."""
    try:
        parameters = document["background"]["parameters"]
        return Background(
            surface_temperature_c=float(parameters["surface_temperature_c"]),
            deep_temperature_c=float(parameters["deep_temperature_c"]),
            temperature_scale_depth_m=float(parameters["temperature_scale_depth_m"]),
            surface_salinity_psu=float(parameters["surface_salinity_psu"]),
            deep_salinity_psu=float(parameters["deep_salinity_psu"]),
            salinity_scale_depth_m=float(parameters["salinity_scale_depth_m"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise GroundTruthError("the ground-truth manifest has no usable background") from exc


def features_from(document: Mapping[str, Any]) -> tuple[SeededFeature, ...]:
    """The seeded features, with the drift the generator recorded for each.

    Three of the four kinds do not drift, and are read with a drift of zero rather than
    with a special case. Advecting them by nothing is the same arithmetic.
    """
    listed = document.get("features")
    if not isinstance(listed, Sequence) or not listed:
        raise GroundTruthError("the ground-truth manifest records no features to advect")
    return tuple(_feature(entry) for entry in listed)


def _feature(entry: Mapping[str, Any]) -> SeededFeature:
    try:
        kind = str(entry["kind"])
        identifier = str(entry["id"])
        parameters = entry["parameters"]
    except (KeyError, TypeError) as exc:
        raise GroundTruthError(f"a feature in the manifest is unreadable: {exc}") from exc

    if kind == "thermocline":
        return SeededFeature(
            identifier=identifier,
            shape="thermocline",
            latitude=0.0,
            longitude=0.0,
            radius_km=1.0,
            temperature_amplitude_c=float(parameters["temperature_drop_c"]) / 2.0,
            salinity_amplitude_psu=float(parameters["salinity_rise_psu"]) / 2.0,
            depth_centre_m=float(parameters["depth_m"]),
            depth_half_thickness_m=max(float(parameters["thickness_m"]) / 2.0, 1e-6),
        )
    if kind == "front":
        return SeededFeature(
            identifier=identifier,
            shape="front",
            latitude=float(parameters["anchor_latitude"]),
            longitude=float(parameters["anchor_longitude"]),
            radius_km=float(parameters["sharpness_km"]),
            temperature_amplitude_c=float(parameters["amplitude_c"]),
            salinity_amplitude_psu=float(parameters["salinity_amplitude_psu"]),
            depth_centre_m=0.0,
            depth_half_thickness_m=float(parameters["depth_scale_m"]),
            bearing_degrees=float(parameters["bearing_degrees"]),
        )
    if kind in {"eddy", "moving"}:
        sign = float(parameters["sign"])
        return SeededFeature(
            identifier=identifier,
            shape=kind,
            latitude=float(parameters["centre_latitude"]),
            longitude=float(parameters["centre_longitude"]),
            radius_km=float(parameters["radius_km"]),
            temperature_amplitude_c=sign * float(parameters["strength_c"]),
            salinity_amplitude_psu=sign * float(parameters["salinity_strength_psu"]),
            depth_centre_m=float(parameters["depth_centre_m"]),
            depth_half_thickness_m=float(parameters["depth_half_thickness_m"]),
            east_km_per_day=float(parameters.get("drift_east_km_per_day", 0.0)),
            north_km_per_day=float(parameters.get("drift_north_km_per_day", 0.0)),
            reference_latitude=float(
                parameters.get("reference_latitude", parameters["centre_latitude"])
            ),
        )
    raise GroundTruthError(f"the manifest records a feature of unknown kind {kind!r}")


def grid_for(
    document: Mapping[str, Any], *, initialisation_micros: int, step_seconds: float, steps: int
) -> RunGrid:
    """The run's grid: the manifest's space, and the run's own forward time axis.

    A forecast is initialised now and is valid forward, so its time axis is the run's and not
    the generated world's. Everything else is the world's, because a forecast on a different
    grid from the field it is scored against would need regridding to compare, and the
    comparison is the point.
    """
    latitudes, longitudes, depths = spatial_axes_from(document)
    step_micros = round(step_seconds * 1_000_000)
    return RunGrid(
        latitudes=latitudes,
        longitudes=longitudes,
        depths_m=depths,
        sim_micros=tuple(initialisation_micros + step_micros * index for index in range(steps)),
    )
