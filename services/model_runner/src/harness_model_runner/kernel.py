"""The model kernel port: initialisation state in, gridded field out.

Constitution VI recognises exactly four genuine ports in drogna and this is one of them.
What makes it genuine rather than decorative is that more than one implementation exists and
is used: the analytic kernel that advects and adds noise, and the persistence kernel that
holds the state still, which is both a second implementation and the reference a forecast
has to beat (SRD FR-38). A test double satisfies the same protocol without either of them
knowing.

The contract is deliberately narrow. A kernel is handed a state — a grid, a background, a
set of seeded features with their recorded drift, and an initialisation instant — and a
generator, and it returns two arrays on that grid. It does not read configuration, does not
publish, does not write files, and does not know what an ensemble is. Everything a kernel
cannot do is something the runner can change without touching a kernel.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from random import Random
from typing import Protocol, runtime_checkable

__all__ = [
    "Background",
    "GriddedField",
    "InitialisationState",
    "ModelKernel",
    "RunGrid",
    "SeededFeature",
]


@dataclass(frozen=True)
class RunGrid:
    """The four axes a run is computed on, values first-class rather than derived."""

    latitudes: tuple[float, ...]
    longitudes: tuple[float, ...]
    depths_m: tuple[float, ...]
    sim_micros: tuple[int, ...]

    @property
    def cells(self) -> int:
        return (
            len(self.sim_micros) * len(self.depths_m) * len(self.latitudes) * len(self.longitudes)
        )

    def offset(self, time: int, depth: int, latitude: int, longitude: int) -> int:
        """Index into a flattened array, in the order time, depth, latitude, longitude."""
        return ((time * len(self.depths_m) + depth) * len(self.latitudes) + latitude) * len(
            self.longitudes
        ) + longitude


@dataclass(frozen=True)
class Background:
    """Exponential relaxation from a surface value to a deep value, per quantity.

    The same form the environment generator authored the world with. It is restated here
    because a forecast has to have a background of its own — it is the runner's model of the
    world, not a copy of the world — and because a kernel that read the generator's
    evaluator would be a kernel with the answer in it.
    """

    surface_temperature_c: float
    deep_temperature_c: float
    temperature_scale_depth_m: float
    surface_salinity_psu: float
    deep_salinity_psu: float
    salinity_scale_depth_m: float


@dataclass(frozen=True)
class SeededFeature:
    """One feature to advect, as the ground-truth manifest recorded it after jitter.

    Drift is zero for the three features the generator holds still, so advection needs no
    special case for them: they are advected by nothing.
    """

    identifier: str
    shape: str
    latitude: float
    longitude: float
    radius_km: float
    temperature_amplitude_c: float
    salinity_amplitude_psu: float
    depth_centre_m: float
    depth_half_thickness_m: float
    east_km_per_day: float = 0.0
    north_km_per_day: float = 0.0
    reference_latitude: float = 0.0
    bearing_degrees: float = 0.0


@dataclass(frozen=True)
class InitialisationState:
    """Everything a kernel is given, and the whole of what it may depend on."""

    grid: RunGrid
    background: Background
    features: tuple[SeededFeature, ...]
    initialisation_micros: int
    noise_temperature_c: float = 0.0
    noise_salinity_psu: float = 0.0


@dataclass(frozen=True)
class GriddedField:
    """What a kernel returns: two quantities on one grid, flattened in the grid's order."""

    grid: RunGrid
    temperature_c: Sequence[float]
    salinity_psu: Sequence[float]

    def __post_init__(self) -> None:
        for name, values in (
            ("temperature", self.temperature_c),
            ("salinity", self.salinity_psu),
        ):
            if len(values) != self.grid.cells:
                raise ValueError(
                    f"the {name} array holds {len(values)} values for a grid of "
                    f"{self.grid.cells} cells; a field and its grid must agree"
                )


@runtime_checkable
class ModelKernel(Protocol):
    """The port. Two implementations live in this package and a third is a test double.

    Runtime-checkable so that a test can assert an implementation satisfies it. The check is
    structural — a name and a method — which is all a port of this shape can promise, and it
    is enough to catch the substitution that would otherwise fail at the first call.
    """

    @property
    def name(self) -> str:
        """The name configuration selects this kernel by, carried on ctl/run-started."""
        ...

    def forecast(self, state: InitialisationState, generator: Random) -> GriddedField:
        """Produce one member's field from the state and that member's own generator."""
        ...
