"""Getting a seeded feature back out of what the harness stored, for AT-03 to score.

AT-03 asks whether the seeded eddy is *recoverable*, and Constitution IX decides what an
answer looks like: a figure, against the generator's ground-truth manifest, never an
adjective. So this module is the half of AT-03 that produces a candidate eddy, and
``harness_env_generator.scoring.score_eddy_recovery`` is the half that says how wrong it
is. Nothing here computes an error and nothing here holds a threshold.

**What the recovery is allowed to see.** Observations, and the manifest's description of
every feature *except* the one being recovered. It never reads the eddy's own manifest
entry — that is the answer — and it is given no starting position, radius, depth or sign;
the initial guess is the largest anomaly in the observations themselves. What it is given
is that the world contains a front, a thermocline and a drifter, with the parameters the
manifest records, which is what any consumer of a run holds
(:func:`harness_env_generator.evaluator.features_from_manifest` — "all a consumer ever
has"). Composition is additive (``harness_env_generator.compose``), so removing the eddy's
entry leaves exactly the rest of the world and the subtraction is arithmetic rather than a
model. Naming this is the point: the measurement below is whether the eddy's signature
survives generation, gridding, float32 storage, interpolation and instrument noise — not
blind source separation of a four-feature field.

**Where the observations come from.** :class:`StoredField` serves the sensors' ``Field``
protocol out of the written NetCDF by trilinear interpolation, so what a sample carries is
the stored grid's answer and not the analytic form's. That is what makes AT-03's figure a
statement about *stored* data: the grid's own discretisation is inside it. The sampling
itself is C-04's real :class:`~harness_sensors.sensor.SensorArray`, with the instruments
from ``config/local/sensors.json`` and therefore the noise those instruments declare — an
invented noise figure would make the recovery error partly invented too. The ``Field``
protocol's own docstring says it is a protocol because a test wants to supply a world, so
this is the seam being used as designed rather than a mock.

**The fit.** Six parameters — centre latitude and longitude, radius, signed strength,
depth of greatest anomaly and depth half-thickness — against the eddy's stated form
(``harness_env_generator.features.eddy``). Strength enters linearly, so it is solved in
closed form for each trial geometry and only five parameters are searched, by Nelder-Mead.
There is no randomness anywhere in the search: the simplex is built from the initial guess
by fixed steps, so two runs of the same survey produce the same eddy (Constitution II
wants seeded randomness, and none at all is the stronger form of it).

Distances use :class:`~harness_env_generator.features.kernels.LocalPlane`, the same map
between degrees and kilometres the manifest records its centre under and the same one
``score_eddy_recovery`` measures with. A second convention here would put the difference
between two coordinate systems into the reported error, which is the failure ADR-0005
argues against in the neighbouring case of sound speed.
"""

from __future__ import annotations

import copy
import json
import math
from array import array
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_core.rng import configure_run
from harness_env_generator.evaluator import Evaluator
from harness_env_generator.features.kernels import LocalPlane, gaussian
from harness_monitor.netcdf import read_netcdf
from harness_sensors.sensor import Instrument, Platform, Position, SensorArray

__all__ = [
    "Observation",
    "RecoveredEddy",
    "StoredField",
    "anomalies",
    "configured_instruments",
    "fit_eddy",
    "lawnmower",
    "observe",
    "stored_depths",
    "without_feature",
]

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = REPO_ROOT / "config"

_MICROS_PER_SECOND = 1_000_000
_TEMPERATURE = "temperature"

_STORED_VARIABLES = {
    _TEMPERATURE: "sea_water_temperature",
    "salinity": "sea_water_practical_salinity",
    "pressure": "sea_water_pressure",
}

_PLATFORM = Platform(
    id="platform-a",
    name="sampling platform A",
    description="A simulated sampling platform. A coordinate and a sampler.",
)


def configured_instruments(destination: str = "local") -> list[Instrument]:
    """The three instruments a destination configures, with the noise they declare.

    Read from the deployed configuration rather than written here, so the recovery error
    below rests on the instrument the harness actually runs. A standard deviation invented
    in a test would make the reported figure partly an invention.
    """
    document = json.loads((CONFIG_DIR / destination / "sensors.json").read_text(encoding="utf-8"))
    return [Instrument.from_config(section) for section in document["sensors"]["datastreams"]]


def stored_depths(
    manifest: Mapping[str, Any], *, shallowest_m: float, deepest_m: float
) -> list[float]:
    """The grid's own depth levels between two depths, which is where a cast samples.

    Not evenly spaced depths of the caller's choosing, and the difference is measured
    rather than asserted (see AT-03's scope test). The stored field is linear between depth
    levels, and the configured grid's 50 m spacing does not resolve the configured
    thermocline's 25 m transition, so a value read halfway between two levels can be half a
    degree from the analytic form. That error has nothing to do with the eddy and would go
    straight into a recovery figure computed from such a cast.
    """
    axis = manifest["grid"]["depth"]
    minimum = float(axis["minimum"])
    maximum = float(axis["maximum"])
    count = int(axis["count"])
    step = (maximum - minimum) / (count - 1)
    levels = [
        minimum + step * index
        for index in range(count)
        if shallowest_m <= minimum + step * index <= deepest_m
    ]
    if len(levels) < 2:
        raise ValueError("a cast of fewer than two depths resolves nothing in the vertical")
    return levels


@dataclass(frozen=True)
class Observation:
    """One stored measurement, reduced to what a recovery needs from it."""

    latitude: float
    longitude: float
    depth_m: float
    time_s: float
    temperature_c: float


class StoredField:
    """The written field, addressed as the sensors' ``Field`` protocol addresses a world.

    Trilinear — quadrilinear, strictly, since time is an axis too — interpolation of the
    stored arrays. Values off the ends of an axis are taken from the end rather than
    extrapolated: a survey is kept inside the domain, and silently inventing water outside
    it is how a recovery error acquires a term nobody can account for.
    """

    def __init__(self, payload: bytes, manifest: Mapping[str, Any]) -> None:
        document = read_netcdf(payload)
        self._latitude = list(document.variables["latitude"].values)
        self._longitude = list(document.variables["longitude"].values)
        self._depth = list(document.variables["depth"].values)
        self._time = list(document.variables["time"].values)
        self._values: dict[str, array] = {
            measured: document.variables[name].values
            for measured, name in _STORED_VARIABLES.items()
        }
        self._origin = SimInstant.from_iso(manifest["grid"]["time"]["origin_sim_time"])

    @staticmethod
    def _span(axis: Sequence[float], value: float) -> tuple[int, int, float]:
        """The bracketing indices and the fraction between them."""
        if value <= axis[0]:
            return 0, 0, 0.0
        if value >= axis[-1]:
            return len(axis) - 1, len(axis) - 1, 0.0
        lower = 0
        while axis[lower + 1] < value:
            lower += 1
        return lower, lower + 1, (value - axis[lower]) / (axis[lower + 1] - axis[lower])

    def at(
        self, *, latitude: float, longitude: float, depth_m: float, instant: SimInstant
    ) -> Mapping[str, float]:
        """The three measured quantities, interpolated from the stored arrays."""
        seconds = (instant - self._origin) / _MICROS_PER_SECOND
        corners = [
            (index, weight)
            for axis, value in (
                (self._time, seconds),
                (self._depth, depth_m),
                (self._latitude, latitude),
                (self._longitude, longitude),
            )
            for index, weight in _corners(*self._span(axis, value))
        ]
        depth_count = len(self._depth)
        latitude_count = len(self._latitude)
        longitude_count = len(self._longitude)
        sampled: dict[str, float] = {}
        for measured, stored in self._values.items():
            total = 0.0
            for time_index, time_weight in corners[0:2]:
                for depth_index, depth_weight in corners[2:4]:
                    for latitude_index, latitude_weight in corners[4:6]:
                        for longitude_index, longitude_weight in corners[6:8]:
                            weight = time_weight * depth_weight * latitude_weight * longitude_weight
                            if weight == 0.0:
                                continue
                            flat = (
                                (time_index * depth_count + depth_index) * latitude_count
                                + latitude_index
                            ) * longitude_count + longitude_index
                            total += weight * stored[flat]
            sampled[measured] = total
        return sampled


def _corners(lower: int, upper: int, fraction: float) -> tuple[tuple[int, float], ...]:
    """One axis's two contributing indices and their weights, always two of them."""
    return ((lower, 1.0 - fraction), (upper, fraction))


def lawnmower(manifest: Mapping[str, Any], side: int) -> list[Position]:
    """A ``side`` by ``side`` boustrophedon over the whole of the manifest's domain.

    Stations are placed at cell centres rather than on the domain's edges, so thinning the
    survey moves every station rather than dropping the interior ones and keeping the
    corners. Where the eddy falls relative to the pattern is then a consequence of the seed
    and not of a coordinate typed here.
    """
    if side < 1:
        raise ValueError("a survey with no stations observes nothing")
    grid = manifest["grid"]
    latitude = grid["latitude"]
    longitude = grid["longitude"]
    positions: list[Position] = []
    for row in range(side):
        northward = (row + 0.5) / side
        for step in range(side):
            column = step if row % 2 == 0 else side - 1 - step
            eastward = (column + 0.5) / side
            positions.append(
                Position(
                    latitude=_between(latitude["minimum"], latitude["maximum"], northward),
                    longitude=_between(longitude["minimum"], longitude["maximum"], eastward),
                )
            )
    return positions


def _between(minimum: float, maximum: float, fraction: float) -> float:
    return float(minimum) + fraction * (float(maximum) - float(minimum))


def observe(
    manifest: Mapping[str, Any],
    field: Any,
    positions: Sequence[Position],
    *,
    depths_m: Sequence[float],
    stream: str,
) -> tuple[Observation, ...]:
    """Sample ``field`` on ``positions`` with C-04's array, and keep the temperatures.

    The run's randomness is configured here, from the root seed the manifest records, so a
    survey is a pure function of that seed and the sampling that came before it in the
    process cannot reach it. That is what makes two identical surveys produce identical
    observations rather than a continuation of one noise sequence.

    One station per tick, and the cadence is whatever divides the manifest's time extent
    into as many ticks as there are stations. It is not a claim about how fast anything
    travels: two positions in sequence make no claim about travel
    (:class:`~harness_sensors.sensor.Position`), and what the eddy is being recovered from
    is a set of located samples, not a track.
    """
    configure_run(int(manifest["seed"]["root"]))
    array_ = SensorArray(
        platform=_PLATFORM,
        instruments=configured_instruments(),
        positions=positions,
        depths_m=depths_m,
        field=field,
        seed_stream=stream,
    )
    time_axis = manifest["grid"]["time"]
    extent = float(time_axis["step_seconds"]) * (int(time_axis["count"]) - 1)
    interval = max(1, int(extent // max(len(positions), 1)))
    origin = SimInstant.from_iso(time_axis["origin_sim_time"])
    clock = ManualClock(
        run_id=str(manifest["run_id"]),
        epoch=origin,
        tick_interval_us=interval * _MICROS_PER_SECOND,
        mode=ClockMode.LOCKSTEP,
    )
    collected: list[Observation] = []
    for _ in positions:
        for message in array_.sample(clock.tick()):
            if message["observed_property"] != _TEMPERATURE:
                continue
            location = message["location"]
            collected.append(
                Observation(
                    latitude=float(location["latitude"]),
                    longitude=float(location["longitude"]),
                    depth_m=float(location["depth_m"]),
                    time_s=(SimInstant.from_iso(message["sim_time"]) - origin) / _MICROS_PER_SECOND,
                    temperature_c=float(message["result"]),
                )
            )
        clock.advance()
    return tuple(collected)


def without_feature(manifest: Mapping[str, Any], feature_id: str) -> dict[str, Any]:
    """The manifest with one feature taken out of it: the rest of the world, and no more.

    Composition is additive, so a document with a feature removed describes exactly the
    world minus that feature — and evaluating it is how the recovery is kept from ever
    seeing the answer. A feature that is not there is a mistake worth a refusal rather than
    a silent no-op, because the no-op would hand the fit a residual with nothing in it.
    """
    document = copy.deepcopy(dict(manifest))
    document["features"] = [entry for entry in manifest["features"] if entry["id"] != feature_id]
    if len(document["features"]) == len(manifest["features"]):
        known = ", ".join(sorted(str(entry["id"]) for entry in manifest["features"]))
        raise KeyError(f"this manifest describes no feature {feature_id!r}; it has {known}")
    return document


def anomalies(
    manifest: Mapping[str, Any],
    observations: Sequence[Observation],
    *,
    feature_id: str,
) -> tuple[float, ...]:
    """What each observation holds over the world with ``feature_id`` taken out of it.

    The manifest handed in need not be the one the observations came from. Pairing a
    survey with another run's manifest is a real mistake with a real consequence, and
    making it expressible here is what lets AT-03 measure the consequence rather than
    assume it.
    """
    rest = Evaluator.from_manifest(without_feature(manifest, feature_id))
    return tuple(
        observation.temperature_c
        - rest.at(
            observation.latitude,
            observation.longitude,
            observation.depth_m,
            observation.time_s,
        ).temperature_c
        for observation in observations
    )


@dataclass(frozen=True)
class RecoveredEddy:
    """A candidate eddy and how well it explains what was observed. Never a verdict."""

    centre_latitude: float
    centre_longitude: float
    radius_km: float
    strength_c: float
    sign: int
    depth_centre_m: float
    depth_half_thickness_m: float
    sample_count: int
    residual_rms_c: float


def _weights(parameters: Sequence[float], observations: Sequence[Observation]) -> tuple[float, ...]:
    """The eddy's membership at each observation, for one trial geometry."""
    latitude, longitude, radius_km, depth_centre_m, half_thickness_m = parameters
    plane = LocalPlane(latitude)
    return tuple(
        gaussian(
            math.hypot(
                plane.east_km(observation.longitude, longitude),
                plane.north_km(observation.latitude, latitude),
            ),
            radius_km,
        )
        * gaussian(observation.depth_m - depth_centre_m, half_thickness_m)
        for observation in observations
    )


def _amplitude(weights: Sequence[float], values: Sequence[float]) -> float:
    """The signed strength that best explains ``values``, in closed form.

    Strength multiplies the membership, so for a fixed geometry the least-squares estimate
    is a ratio of sums. Solving it rather than searching it removes a dimension from the
    search and removes it exactly.
    """
    denominator = sum(weight * weight for weight in weights)
    if denominator <= 0.0:
        return 0.0
    return sum(weight * value for weight, value in zip(weights, values, strict=True)) / denominator


def _sum_of_squares(
    parameters: Sequence[float],
    observations: Sequence[Observation],
    values: Sequence[float],
) -> float:
    """The residual sum of squares, or a refusal expressed as an unreachable cost.

    The refusals are shape, not tuning: a radius or a half-thickness at or below zero is
    not an eddy, and one larger than the world is a plane dressed as one. Returning a huge
    cost keeps the simplex out of those regions without a constrained optimiser.
    """
    _, _, radius_km, _, half_thickness_m = parameters
    if not 1.0 < radius_km < 1000.0 or not 5.0 < half_thickness_m < 5000.0:
        return math.inf
    weights = _weights(parameters, observations)
    amplitude = _amplitude(weights, values)
    return sum(
        (value - amplitude * weight) ** 2 for weight, value in zip(weights, values, strict=True)
    )


def _nelder_mead(
    cost: Callable[[Sequence[float]], float],
    start: Sequence[float],
    step: Sequence[float],
    *,
    iterations: int = 4000,
    tolerance: float = 1e-12,
) -> list[float]:
    """The downhill simplex, with the textbook coefficients and no randomness in it."""
    size = len(start)
    simplex = [list(start)]
    for axis in range(size):
        vertex = list(start)
        vertex[axis] += step[axis]
        simplex.append(vertex)
    costs = [cost(vertex) for vertex in simplex]
    for _ in range(iterations):
        order = sorted(range(size + 1), key=lambda index: costs[index])
        simplex = [simplex[index] for index in order]
        costs = [costs[index] for index in order]
        if abs(costs[-1] - costs[0]) <= tolerance * (abs(costs[0]) + tolerance):
            break
        centroid = [sum(v[axis] for v in simplex[:-1]) / size for axis in range(size)]
        reflected = [centroid[axis] + (centroid[axis] - simplex[-1][axis]) for axis in range(size)]
        reflected_cost = cost(reflected)
        if reflected_cost < costs[0]:
            expanded = [
                centroid[axis] + 2.0 * (centroid[axis] - simplex[-1][axis]) for axis in range(size)
            ]
            expanded_cost = cost(expanded)
            if expanded_cost < reflected_cost:
                simplex[-1], costs[-1] = expanded, expanded_cost
            else:
                simplex[-1], costs[-1] = reflected, reflected_cost
        elif reflected_cost < costs[-2]:
            simplex[-1], costs[-1] = reflected, reflected_cost
        else:
            contracted = [
                centroid[axis] + 0.5 * (simplex[-1][axis] - centroid[axis]) for axis in range(size)
            ]
            contracted_cost = cost(contracted)
            if contracted_cost < costs[-1]:
                simplex[-1], costs[-1] = contracted, contracted_cost
            else:
                for index in range(1, size + 1):
                    simplex[index] = [
                        simplex[0][axis] + 0.5 * (simplex[index][axis] - simplex[0][axis])
                        for axis in range(size)
                    ]
                    costs[index] = cost(simplex[index])
    best = min(range(size + 1), key=lambda index: costs[index])
    return simplex[best]


def fit_eddy(observations: Sequence[Observation], values: Sequence[float]) -> RecoveredEddy:
    """Fit the eddy's stated form to ``values``, and report what it took to explain them.

    The initial guess is the largest anomaly in the survey: its position, its depth and
    nothing else. Radius and half-thickness start at fixed distances that are neither the
    configured ones nor near them, because a search that starts at the answer has not
    found it.
    """
    if not observations:
        raise ValueError("a recovery needs observations; there is nothing to fit")
    peak = max(range(len(observations)), key=lambda index: abs(values[index]))
    start = (
        observations[peak].latitude,
        observations[peak].longitude,
        30.0,
        observations[peak].depth_m,
        100.0,
    )
    step = (0.15, 0.2, 10.0, 40.0, 40.0)
    best = _nelder_mead(lambda trial: _sum_of_squares(trial, observations, values), start, step)
    weights = _weights(best, observations)
    amplitude = _amplitude(weights, values)
    residuals = [value - amplitude * weight for weight, value in zip(weights, values, strict=True)]
    latitude, longitude, radius_km, depth_centre_m, half_thickness_m = best
    return RecoveredEddy(
        centre_latitude=latitude,
        centre_longitude=longitude,
        radius_km=radius_km,
        # Reported as a magnitude and a sign, the way the manifest records it: a recovered
        # eddy of the wrong sign is not a small strength error (``score_eddy_recovery``).
        strength_c=abs(amplitude),
        sign=-1 if amplitude < 0 else 1,
        depth_centre_m=depth_centre_m,
        depth_half_thickness_m=half_thickness_m,
        sample_count=len(observations),
        residual_rms_c=math.sqrt(
            sum(residual * residual for residual in residuals) / len(residuals)
        ),
    )
