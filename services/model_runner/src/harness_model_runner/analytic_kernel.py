"""The analytic kernel: advect what the generator seeded, add seeded noise, and stop there.

SRD FR-28 says the model runner advects the seeded features forward analytically and adds
noise, and that it implements no real numerics. This module is that sentence. Every feature
centre moves by its recorded drift velocity times the elapsed simulation time, the anomalies
are evaluated in closed form at every grid point, and a seeded generator adds the noise that
makes two ensemble members differ.

The forms are stated here because the run's field is the runner's model of the world and not
a copy of it:

- **eddy and moving feature** — a Gaussian bump in horizontal distance from the centre,
  times a Gaussian in depth about the feature's centre depth;
- **front** — a hyperbolic tangent across the line through the anchor at its bearing, times
  an exponential decay with depth;
- **thermocline** — a hyperbolic tangent in depth alone, horizontally uniform.

None of this is oceanography and none of it is claimed to be. What is being demonstrated is
the seam: a kernel behind a port, producing a field with a spread, from an initialisation
state and a seed.

Advection is computed on a local plane about the feature's recorded reference latitude, so
the displacement is an exact affine map rather than something that depends on where it is
evaluated — which is the same convention the ground-truth manifest records it under.
"""

from __future__ import annotations

import math
from random import Random

from harness_model_runner.kernel import (
    Background,
    GriddedField,
    InitialisationState,
    SeededFeature,
)

__all__ = [
    "AnalyticKernel",
    "PersistenceKernel",
    "advected_centre",
    "background_at",
    "kernel_for",
]

_KM_PER_DEGREE_LATITUDE = 111.195
_SECONDS_PER_DAY = 86_400.0
_MICROS_PER_SECOND = 1_000_000


def background_at(background: Background, depth_m: float) -> tuple[float, float]:
    """Temperature and salinity of the water with no feature in it, at this depth."""
    temperature = background.deep_temperature_c + (
        background.surface_temperature_c - background.deep_temperature_c
    ) * math.exp(-depth_m / background.temperature_scale_depth_m)
    salinity = background.deep_salinity_psu + (
        background.surface_salinity_psu - background.deep_salinity_psu
    ) * math.exp(-depth_m / background.salinity_scale_depth_m)
    return temperature, salinity


def advected_centre(feature: SeededFeature, elapsed_seconds: float) -> tuple[float, float]:
    """Where this feature's centre is after ``elapsed_seconds`` of simulation time.

    Displacement is drift velocity times elapsed time, which is the whole of the advection
    and is what makes the position analytic: nothing has to be stepped through the field to
    find out where a feature went.
    """
    days = elapsed_seconds / _SECONDS_PER_DAY
    north_km = feature.north_km_per_day * days
    east_km = feature.east_km_per_day * days
    latitude = feature.latitude + north_km / _KM_PER_DEGREE_LATITUDE
    reference = feature.reference_latitude or feature.latitude
    km_per_degree_longitude = _KM_PER_DEGREE_LATITUDE * math.cos(math.radians(reference))
    longitude = feature.longitude + east_km / max(km_per_degree_longitude, 1e-6)
    return latitude, longitude


def _horizontal_km(
    latitude: float, longitude: float, centre_latitude: float, centre_longitude: float
) -> float:
    north_km = (latitude - centre_latitude) * _KM_PER_DEGREE_LATITUDE
    east_km = (
        (longitude - centre_longitude)
        * _KM_PER_DEGREE_LATITUDE
        * math.cos(math.radians(centre_latitude))
    )
    return math.hypot(north_km, east_km)


def _anomaly(
    feature: SeededFeature,
    latitude: float,
    longitude: float,
    depth_m: float,
    elapsed_seconds: float,
) -> tuple[float, float]:
    """This feature's contribution to temperature and salinity at one point."""
    if feature.shape == "thermocline":
        share = -math.tanh(
            (depth_m - feature.depth_centre_m) / max(feature.depth_half_thickness_m, 1e-6)
        )
        return feature.temperature_amplitude_c * share, feature.salinity_amplitude_psu * -share

    centre_latitude, centre_longitude = advected_centre(feature, elapsed_seconds)

    if feature.shape == "front":
        bearing = math.radians(feature.bearing_degrees)
        north_km = (latitude - centre_latitude) * _KM_PER_DEGREE_LATITUDE
        east_km = (
            (longitude - centre_longitude)
            * _KM_PER_DEGREE_LATITUDE
            * math.cos(math.radians(centre_latitude))
        )
        across_km = east_km * math.cos(bearing) - north_km * math.sin(bearing)
        share = math.tanh(across_km / max(feature.radius_km, 1e-6))
        decay = math.exp(-depth_m / max(feature.depth_half_thickness_m, 1e-6))
        return (
            feature.temperature_amplitude_c * share * decay,
            feature.salinity_amplitude_psu * share * decay,
        )

    distance_km = _horizontal_km(latitude, longitude, centre_latitude, centre_longitude)
    horizontal = math.exp(-((distance_km / max(feature.radius_km, 1e-6)) ** 2))
    vertical = math.exp(
        -(((depth_m - feature.depth_centre_m) / max(feature.depth_half_thickness_m, 1e-6)) ** 2)
    )
    share = horizontal * vertical
    return (
        feature.temperature_amplitude_c * share,
        feature.salinity_amplitude_psu * share,
    )


class AnalyticKernel:
    """Advection plus seeded noise. No real numerics, as FR-28 requires."""

    name = "analytic"

    def forecast(self, state: InitialisationState, generator: Random) -> GriddedField:
        grid = state.grid
        temperature = [0.0] * grid.cells
        salinity = [0.0] * grid.cells
        for time_index, instant in enumerate(grid.sim_micros):
            elapsed = (instant - state.initialisation_micros) / _MICROS_PER_SECOND
            for depth_index, depth in enumerate(grid.depths_m):
                base_temperature, base_salinity = background_at(state.background, depth)
                for latitude_index, latitude in enumerate(grid.latitudes):
                    for longitude_index, longitude in enumerate(grid.longitudes):
                        warm = base_temperature
                        salt = base_salinity
                        for feature in state.features:
                            anomaly = _anomaly(feature, latitude, longitude, depth, elapsed)
                            warm += anomaly[0]
                            salt += anomaly[1]
                        offset = grid.offset(
                            time_index, depth_index, latitude_index, longitude_index
                        )
                        temperature[offset] = warm + _noise(generator, state.noise_temperature_c)
                        salinity[offset] = salt + _noise(generator, state.noise_salinity_psu)
        return GriddedField(grid=grid, temperature_c=temperature, salinity_psu=salinity)


class PersistenceKernel:
    """The forecast that says conditions stay as they are.

    A second implementation of the port, and not a straw one: SRD FR-38 requires forecast
    skill to be reported against a persistence reference, so this is the field the analytic
    kernel has to beat. It advects nothing and adds no noise, which is precisely what makes
    it the reference.
    """

    name = "persistence"

    def forecast(self, state: InitialisationState, generator: Random) -> GriddedField:
        del generator  # a persistence forecast draws nothing; the argument is the port's
        held = InitialisationState(
            grid=state.grid,
            background=state.background,
            features=state.features,
            initialisation_micros=state.initialisation_micros,
        )
        grid = state.grid
        temperature = [0.0] * grid.cells
        salinity = [0.0] * grid.cells
        for time_index in range(len(grid.sim_micros)):
            for depth_index, depth in enumerate(grid.depths_m):
                base_temperature, base_salinity = background_at(held.background, depth)
                for latitude_index, latitude in enumerate(grid.latitudes):
                    for longitude_index, longitude in enumerate(grid.longitudes):
                        warm = base_temperature
                        salt = base_salinity
                        for feature in held.features:
                            anomaly = _anomaly(feature, latitude, longitude, depth, 0.0)
                            warm += anomaly[0]
                            salt += anomaly[1]
                        offset = grid.offset(
                            time_index, depth_index, latitude_index, longitude_index
                        )
                        temperature[offset] = warm
                        salinity[offset] = salt
        return GriddedField(grid=grid, temperature_c=temperature, salinity_psu=salinity)


def _noise(generator: Random, deviation: float) -> float:
    """A draw through the RNG port. Zero deviation draws nothing, so a run stays comparable."""
    if deviation <= 0:
        return 0.0
    return generator.gauss(0.0, deviation)


def kernel_for(name: str) -> AnalyticKernel | PersistenceKernel:
    """The implementation configuration names. An unknown name is a startup failure."""
    for implementation in (AnalyticKernel(), PersistenceKernel()):
        if implementation.name == name:
            return implementation
    raise ValueError(f"no model kernel is registered under {name!r}")
