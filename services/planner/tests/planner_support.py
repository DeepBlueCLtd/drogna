"""Hand-built fields, geometries and footprints whose right answers are known.

The value function, the collapse model, the selection and the projection are pure functions
over a field, and every one of them can be proved correct before feature 009 has published
anything at all. That is what these helpers are for: fields written down rather than read,
with an analytic form the test can differentiate by hand.

The field here is deliberately a *function of the instant asked about*, not a snapshot. A
snapshot would make every test pass against a planner that scored the present, which is the
one failure this component cannot afford.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from math import exp

from harness_planner.cells import CellGeometry, DepthBand, PlanningCell
from harness_planner.sensing import SensingFootprint
from harness_planner.traversal import TraversalCost

MICROS_PER_SECOND = 1_000_000

# A simulation epoch to hang the tests off. Any instant would do; a fixed one makes a
# failure message readable.
EPOCH_MICROS = 1_788_000_000 * MICROS_PER_SECOND


def geometry(
    *, resolution: int = 6, bands: int = 1, band_thickness_m: float = 50.0
) -> CellGeometry:
    """A geometry with a stated resolution and a stated number of equal depth bands."""
    return CellGeometry(
        resolution=resolution,
        bands=[
            DepthBand(
                index=index,
                minimum_depth_m=index * band_thickness_m,
                maximum_depth_m=(index + 1) * band_thickness_m,
            )
            for index in range(bands)
        ],
    )


def footprint(
    grid: CellGeometry,
    *,
    horizontal_decay_m: float = 5000.0,
    vertical_decay_m: float = 40.0,
    peak_reduction: float = 0.9,
    maximum_rings: int = 1,
    maximum_band_separation: int = 0,
) -> SensingFootprint:
    return SensingFootprint(
        grid,
        horizontal_decay_m=horizontal_decay_m,
        vertical_decay_m=vertical_decay_m,
        peak_reduction=peak_reduction,
        maximum_rings=maximum_rings,
        maximum_band_separation=maximum_band_separation,
    )


def traversal(
    grid: CellGeometry,
    *,
    horizontal_speed_m_per_s: float = 2.0,
    vertical_speed_m_per_s: float = 0.5,
) -> TraversalCost:
    return TraversalCost(
        geometry=grid,
        horizontal_speed_m_per_s=horizontal_speed_m_per_s,
        vertical_speed_m_per_s=vertical_speed_m_per_s,
    )


@dataclass
class HandField:
    """A field whose spread and timescale are written down as functions of place and time.

    Both callables take the same four arguments the real field is addressed by — latitude,
    longitude, depth and elapsed seconds from the epoch — so a test that wants a field that
    moves writes a function of the fourth argument and a test that wants one that stands
    still ignores it.
    """

    grid: CellGeometry
    spread: Callable[[float, float, float, float], float]
    tau: Callable[[float, float, float, float], float]
    run_id: str = "run-000000-000000000000"
    digest: str | None = None
    reads: list[tuple[PlanningCell, int]] = dataclass_field(default_factory=list)

    def saturated(self, cell: PlanningCell, micros: int) -> float:
        self.reads.append((cell, micros))
        latitude, longitude, depth_m = self.grid.centre(cell)
        return self.spread(latitude, longitude, depth_m, self.elapsed(micros))

    def timescale(self, cell: PlanningCell, micros: int) -> float:
        latitude, longitude, depth_m = self.grid.centre(cell)
        return self.tau(latitude, longitude, depth_m, self.elapsed(micros))

    @staticmethod
    def elapsed(micros: int) -> float:
        return (micros - EPOCH_MICROS) / MICROS_PER_SECOND


def drifting_patch(
    *,
    background: float,
    amplitude: float,
    start_longitude: float,
    end_longitude: float,
    over_seconds: float,
    width_degrees: float,
    latitude: float,
    latitude_width_degrees: float = 0.25,
) -> Callable[[float, float, float, float], float]:
    """A patch of high spread that drifts east, reaching ``end_longitude`` at ``over_seconds``.

    With ``start_longitude == end_longitude`` the same construction stands still, which is
    how a test gets a static field and a moving one that are otherwise identical.
    """
    speed = (end_longitude - start_longitude) / over_seconds if over_seconds else 0.0

    def spread(cell_latitude: float, longitude: float, _depth_m: float, seconds: float) -> float:
        centre = start_longitude + speed * seconds
        east = ((longitude - centre) / width_degrees) ** 2
        north = ((cell_latitude - latitude) / latitude_width_degrees) ** 2
        return background + amplitude * exp(-(east + north))

    return spread


def gentle_tau(
    *, background_seconds: float = 36_000.0
) -> Callable[[float, float, float, float], float]:
    """A timescale field that varies with place and is defined everywhere.

    Defined everywhere is the point. ADR-0002 makes tau a field with a domain-wide
    background, so there is no cell a test can build that the planner may refuse to score,
    and no fallback constant for it to fall back to.
    """

    def tau(latitude: float, longitude: float, depth_m: float, _seconds: float) -> float:
        variation = 1.0 + 0.25 * exp(-(((latitude - 49.0) ** 2 + (longitude + 4.5) ** 2) / 0.02))
        return background_seconds / variation + 10.0 * depth_m

    return tau


@dataclass
class Recorder:
    """A publisher that keeps what it was given. The transport, minus the transport."""

    messages: list[tuple[str, bytes]] = dataclass_field(default_factory=list)

    def publish(self, topic: str, payload: bytes) -> None:
        self.messages.append((topic, payload))

    def on(self, topic: str) -> list[dict]:
        import json

        return [json.loads(payload) for name, payload in self.messages if name == topic]


def configuration(**overrides: object) -> dict:
    """The destination-independent planner configuration, with sections overridden.

    Read from the repository's own local configuration rather than written out here, so a
    test cannot pass against a shape the deployed component does not carry.
    """
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    document = json.loads((root / "config" / "local" / "planner.json").read_text(encoding="utf-8"))
    for section, value in overrides.items():
        if isinstance(value, dict) and isinstance(document["planner"].get(section), dict):
            document["planner"][section] = {**document["planner"][section], **value}
        else:
            document["planner"][section] = value
    return document


def settings(**overrides: object):
    """The configuration parsed into the generated model, as the component holds it."""
    from harness_types.config.planner import DrognaPlannerConfiguration

    return DrognaPlannerConfiguration.model_validate(configuration(**overrides))


def manual_clock(*, run_id: str = "run-20260901-a", tick_interval_us: int = 60_000_000):
    """A deterministic clock starting at the epoch these helpers are written around."""
    from harness_core.clock import ManualClock, SimInstant

    return ManualClock(
        run_id=run_id,
        epoch=SimInstant(EPOCH_MICROS),
        tick_interval_us=tick_interval_us,
    )


@dataclass
class OneField:
    """A field source holding whatever field it was handed. The coverage port, in memory."""

    field: object | None = None

    def current(self):
        return self.field


FIELD_RUN_ID = "run-000000-7f80b47c7b91"


class Spread:
    """A published spread field, hand-built, standing in for the coverage store's bytes."""

    def __init__(self, level: float, *, run_id: str = FIELD_RUN_ID) -> None:
        self.run_id = run_id
        self.variable = "temperature_spread"
        self.level = level

    def bounds(self):
        from harness_planner.cells import GridBounds

        return GridBounds(
            minimum_latitude=48.95,
            maximum_latitude=49.05,
            minimum_longitude=-4.60,
            maximum_longitude=-4.40,
            minimum_depth_m=0.0,
            maximum_depth_m=150.0,
        )

    def at(self, *_args: float) -> float:
        return self.level


class Timescales:
    """tau as a field, defined at every point, as ADR-0002 requires."""

    def __init__(self, seconds: float = 5400.0) -> None:
        self.seconds = seconds

    def timescale_at(self, *, latitude: float, longitude: float, depth_m: float, micros: int):
        return self.seconds + 0.5 * depth_m


def announcement() -> dict:
    """One ``ctl/run-published`` message, in the shape feature 009's publisher sends."""
    return {
        "component": "publisher",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T00:00:00.000000Z",
        "tick": 0,
        "run_id": FIELD_RUN_ID,
        "current": True,
        "valid_time": {
            "start_sim_time": "2026-09-01T00:00:00.000000Z",
            "end_sim_time": "2026-09-01T06:00:00.000000Z",
        },
        "grid_bounds": {
            "minimum_latitude": 48.95,
            "maximum_latitude": 49.05,
            "minimum_longitude": -4.60,
            "maximum_longitude": -4.40,
            "minimum_depth_m": 0.0,
            "maximum_depth_m": 150.0,
        },
        "collections": {"forecast": "forecast", "uncertainty": "uncertainty"},
        "digests": {"forecast": "sha256:" + "a" * 64, "uncertainty": "sha256:" + "b" * 64},
    }


def observation() -> dict:
    """One observation, in the shape feature 007's sensors publish on the obs branch."""
    return {
        "observation_id": "obs-3f2a91c40e7b5d68",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T00:10:00.000000Z",
        "tick": 10,
        "thing_id": "platform-a",
        "datastream_id": "ds-temperature",
        "sensor_id": "sensor-temperature",
        "feature_of_interest_id": "foi-6b1d0c2e",
        "observed_property": "temperature",
        "result": 12.4,
        "location": {"latitude": 49.02, "longitude": -4.47, "depth_m": 30.0},
        "context": {},
    }
