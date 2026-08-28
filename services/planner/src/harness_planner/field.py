"""What the planner plans against: the published spread, and the timescale that governs it.

Two quantities are needed at every planning cell and at every simulation instant the
planner reasons about, and they come from two different places for two different reasons.

**The saturated uncertainty** is the per-cell ensemble spread published by the model runner
(SRD FR-29), read through the coverage read port. The planner does not go out through the
query layer for it: the query layer is the external read path and this component sits
inside the boundary SRD §2.2 draws, so routing an internal consumer out through it and back
would claim a seam that is not there. The planner learns that a new field exists from the
announcement on the control namespace and reads it through the port; nothing polls anything
for freshness.

**The decorrelation timescale** is a field, tau(latitude, longitude, depth, time), authored
per feature over a domain-wide background and evaluated per location (ADR-0002). It is not
in the coverage store, because it is ground truth rather than a forecast. The planner reads
the generator's manifest and asks the generator's own evaluation for a number at a point.
It does not blend background and feature timescales itself: ADR-0002's last consequence is
that the authored per-feature representation must not reach a consumer, and a consumer that
reimplemented the blend would be exactly that leak. The consequence worth stating is that
every planning cell has a defined tau, background water included, and this package has no
fallback constant anywhere for a cell outside a feature.

The two are combined behind :class:`PlanningField`, which is what everything downstream
takes. It is a protocol rather than a class hierarchy because the tests need fields whose
right answers are known by construction, and because those hand-built fields are the only
way the value function can be proved correct before feature 009 has published anything.
"""

from __future__ import annotations

from array import array
from bisect import bisect_right
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from harness_core.clock import SimInstant
from harness_core.netcdf import NetcdfError, read_netcdf
from harness_env_generator.evaluator import Evaluator

from harness_planner.cells import CellGeometry, GridBounds, PlanningCell

__all__ = [
    "SPREAD_AXES",
    "SPREAD_VARIABLES",
    "FieldSource",
    "GriddedPlanningField",
    "ManifestTimescale",
    "PlanningField",
    "SpreadField",
    "StoredUncertainty",
    "TimescaleSource",
    "spread_from_netcdf",
]

SPREAD_AXES = ("time", "depth", "latitude", "longitude")
SPREAD_VARIABLES = ("temperature_spread", "salinity_spread")

_TIME_ORIGIN_ATTRIBUTE = "time_origin_sim_time"
_RUN_ATTRIBUTE = "run_id"
_MICROS_PER_SECOND = 1_000_000


class TimescaleSource(Protocol):
    """tau at a point. One method, because ADR-0002 leaves a consumer nothing else to ask."""

    def timescale_at(
        self, *, latitude: float, longitude: float, depth_m: float, micros: int
    ) -> float:
        """The decorrelation timescale in seconds, evaluated here and now."""
        ...


class PlanningField(Protocol):
    """The field a recommendation is computed from, addressed by planning cell and instant.

    Both methods take the instant they are asked about rather than reading a current state,
    and that is the whole discipline this protocol exists to impose. A route is valued
    against the field **as it will be when each vertex is reached**, not as it stands when
    the recommendation is computed. On a field that does not move the two agree, which is
    why the second is so easy to write by accident and so hard to see.
    """

    @property
    def run_id(self) -> str:
        """The model run whose spread this is."""
        ...

    @property
    def digest(self) -> str | None:
        """The digest the announcement carried, or nothing where it carried none."""
        ...

    def saturated(self, cell: PlanningCell, micros: int) -> float:
        """The published ensemble spread at this cell at this instant."""
        ...

    def timescale(self, cell: PlanningCell, micros: int) -> float:
        """The decorrelation timescale in seconds at this cell at this instant."""
        ...


class ManifestTimescale:
    """tau from the generator's ground-truth manifest, evaluated by the generator.

    The manifest is sufficient on its own: with the generator version it names, the analytic
    field can be reconstructed at any point in the domain without the field file. That is
    what makes SC-009 a measurement rather than an assertion — the tau the planner scores
    with and the tau the manifest records are the same number by construction, so the test
    that compares them is checking the interpolation and nothing else.
    """

    def __init__(self, evaluator: Evaluator) -> None:
        self._evaluator = evaluator
        self._origin = SimInstant.from_iso(evaluator.grid.time.origin_sim_time)

    @classmethod
    def from_manifest_document(cls, document: Mapping[str, Any]) -> ManifestTimescale:
        return cls(Evaluator.from_manifest(document))

    @property
    def origin(self) -> SimInstant:
        return self._origin

    def timescale_at(
        self, *, latitude: float, longitude: float, depth_m: float, micros: int
    ) -> float:
        seconds = (micros - self._origin.micros) / _MICROS_PER_SECOND
        return float(
            self._evaluator.timescale_at(
                latitude=latitude, longitude=longitude, depth_m=depth_m, time_s=seconds
            )
        )


@dataclass(frozen=True)
class SpreadField:
    """One published uncertainty field, sampled at a four-dimensional position.

    Held in memory rather than re-read per cell: a search evaluates thousands of cells
    against it, and a file open per cell would make the planning budget a property of the
    filesystem. A new publication replaces the whole object, which is also what makes a
    superseded field impossible to plan against — there is nothing left of it to plan
    against.
    """

    run_id: str
    variable: str
    latitudes: tuple[float, ...]
    longitudes: tuple[float, ...]
    depths_m: tuple[float, ...]
    sim_micros: tuple[int, ...]
    values: Sequence[float]

    def bounds(self) -> GridBounds:
        """The field's extent, in the shape the run announcement states it in.

        The announcement's own model, not a second one: the planner learns where the domain
        is from ``ctl/run-published`` and reads the field that announcement names, so the two
        had better agree about what an extent is (Constitution III).
        """
        return GridBounds(
            minimum_latitude=min(self.latitudes),
            maximum_latitude=max(self.latitudes),
            minimum_longitude=min(self.longitudes),
            maximum_longitude=max(self.longitudes),
            minimum_depth_m=min(self.depths_m),
            maximum_depth_m=max(self.depths_m),
        )

    def at(self, latitude: float, longitude: float, depth_m: float, micros: int) -> float:
        """The spread here, multilinear in all four axes and clamped at the edges.

        Clamped rather than refused, unlike the monitor's read of the forecast. A residual
        against a field that does not cover the sample would be a claim about water nobody
        modelled, so the monitor drops it; a planning cell partly outside the grid is still
        a cell in the domain that has to be scored, and reporting nothing there would leave
        a hole in a projection that FR-020 requires to be complete.
        """
        time_index, time_weight = _bracket(self.sim_micros, micros)
        depth_index, depth_weight = _bracket(self.depths_m, depth_m)
        latitude_index, latitude_weight = _bracket(self.latitudes, latitude)
        longitude_index, longitude_weight = _bracket(self.longitudes, longitude)

        depth_count = len(self.depths_m)
        latitude_count = len(self.latitudes)
        longitude_count = len(self.longitudes)

        total = 0.0
        for time_step, time_share in ((0, 1.0 - time_weight), (1, time_weight)):
            if time_share == 0.0:
                continue
            for depth_step, depth_share in ((0, 1.0 - depth_weight), (1, depth_weight)):
                if depth_share == 0.0:
                    continue
                for latitude_step, latitude_share in (
                    (0, 1.0 - latitude_weight),
                    (1, latitude_weight),
                ):
                    if latitude_share == 0.0:
                        continue
                    for longitude_step, longitude_share in (
                        (0, 1.0 - longitude_weight),
                        (1, longitude_weight),
                    ):
                        if longitude_share == 0.0:
                            continue
                        offset = (
                            (
                                min(time_index + time_step, len(self.sim_micros) - 1) * depth_count
                                + min(depth_index + depth_step, depth_count - 1)
                            )
                            * latitude_count
                            + min(latitude_index + latitude_step, latitude_count - 1)
                        ) * longitude_count + min(
                            longitude_index + longitude_step, longitude_count - 1
                        )
                        total += (
                            time_share * depth_share * latitude_share * longitude_share
                        ) * float(self.values[offset])
        return max(0.0, total)


class GriddedPlanningField:
    """A published spread field and an evaluated timescale field, indexed on planning cells.

    The two are joined here and nowhere else, so that everything downstream asks one object
    one question per cell per instant. Cell centres are resolved once: a search asks for the
    same cell thousands of times, and recomputing an H3 centre inside the innermost loop was
    measurably the largest cost in the first version of the selection.
    """

    def __init__(
        self,
        spread: SpreadField,
        *,
        geometry: CellGeometry,
        timescales: TimescaleSource,
        digest: str | None = None,
    ) -> None:
        self._spread = spread
        self._geometry = geometry
        self._timescales = timescales
        self._digest = digest
        self._centres: dict[PlanningCell, tuple[float, float, float]] = {}

    @property
    def run_id(self) -> str:
        return self._spread.run_id

    @property
    def digest(self) -> str | None:
        return self._digest

    @property
    def variable(self) -> str:
        return self._spread.variable

    def bounds(self) -> GridBounds:
        return self._spread.bounds()

    def saturated(self, cell: PlanningCell, micros: int) -> float:
        latitude, longitude, depth_m = self._centre(cell)
        return self._spread.at(latitude, longitude, depth_m, micros)

    def timescale(self, cell: PlanningCell, micros: int) -> float:
        latitude, longitude, depth_m = self._centre(cell)
        return self._timescales.timescale_at(
            latitude=latitude, longitude=longitude, depth_m=depth_m, micros=micros
        )

    def _centre(self, cell: PlanningCell) -> tuple[float, float, float]:
        """Where this cell is asked about: its centre, held inside the field's domain.

        A cover by overlap necessarily contains cells whose *centre* lies outside the domain
        — that is the whole point of it (``CellGeometry.cover``, FR-020): taking cells by
        centre containment would leave the water along the domain's edge in no cell at all.
        The consequence is that some cell in every cover is centred in water the field does
        not describe, and the two halves of this object disagreed about what to do there.

        ``SpreadField.at`` clamps, and its docstring gives the argument: "a planning cell
        partly outside the grid is still a cell in the domain that has to be scored, and
        reporting nothing there would leave a hole in a projection that FR-020 requires to be
        complete". The timescale did not. It comes from the generator's own evaluator, which
        refuses a point outside the manifest — correctly, and by ADR-0002's design, since
        there is no constant to substitute for a decorrelation timescale. So the refusal came
        back as ``OutOfDomainError`` out of ``handle`` and stopped the process:

            OutOfDomainError: latitude 47.9743 is outside [48, 50]

        Clamping here makes the two halves ask about the same point, which is the nearest
        water in the domain to the cell's centre and is the part of that cell the field
        actually describes. Found by running the planner against a real environment; every
        timescale double in the suite is defined everywhere, so no test could see it.
        """
        cached = self._centres.get(cell)
        if cached is None:
            cached = self._inside(self._geometry.centre(cell))
            self._centres[cell] = cached
        return cached

    def _inside(self, centre: tuple[float, float, float]) -> tuple[float, float, float]:
        latitude, longitude, depth_m = centre
        bounds = self._spread.bounds()
        return (
            min(max(latitude, bounds.minimum_latitude), bounds.maximum_latitude),
            min(max(longitude, bounds.minimum_longitude), bounds.maximum_longitude),
            min(max(depth_m, bounds.minimum_depth_m), bounds.maximum_depth_m),
        )


class FieldSource(Protocol):
    """Where the current uncertainty field comes from. One method, which is all this needs."""

    def current(self) -> SpreadField | None:
        """The current published spread, or nothing if none has been published yet."""
        ...


def spread_from_netcdf(payload: bytes, *, variable: str) -> SpreadField:
    """Read one uncertainty field written into the coverage store.

    A field missing an axis, the requested variable, or the two global attributes that say
    which run it is and where its time axis begins is refused. A field the planner half
    understood would produce a recommendation nobody could interpret, and Constitution VIII
    makes an uninterpretable recommendation worse than none.
    """
    if variable not in SPREAD_VARIABLES:
        raise NetcdfError(
            f"{variable!r} is not a published spread variable; the field carries "
            f"{' and '.join(SPREAD_VARIABLES)}"
        )
    document = read_netcdf(payload)
    missing = [name for name in (*SPREAD_AXES, variable) if name not in document.variables]
    if missing:
        raise NetcdfError(f"the uncertainty field has no {', '.join(missing)}")
    for attribute in (_RUN_ATTRIBUTE, _TIME_ORIGIN_ATTRIBUTE):
        if attribute not in document.attributes:
            raise NetcdfError(f"the uncertainty field declares no {attribute}")

    origin = SimInstant.from_iso(str(document.attributes[_TIME_ORIGIN_ATTRIBUTE]))
    offsets = document.variables["time"].values
    return SpreadField(
        run_id=str(document.attributes[_RUN_ATTRIBUTE]),
        variable=variable,
        latitudes=tuple(document.variables["latitude"].values),
        longitudes=tuple(document.variables["longitude"].values),
        depths_m=tuple(document.variables["depth"].values),
        sim_micros=tuple(
            origin.plus_micros(round(offset * _MICROS_PER_SECOND)).micros for offset in offsets
        ),
        values=document.variables[variable].values,
    )


class StoredUncertainty:
    """The coverage store's read side for the uncertainty field.

    The same pointer discipline the monitor reads the forecast under, applied to the other
    file in a run's directory: the pointer is a text file holding one run identifier on one
    line (ADR-0011), and two identifiers means two runs claim to be current, so nothing is
    returned and the caller reports no field rather than choosing one.

    Every name here — the root, the pointer, the file inside a run's directory — arrives
    from configuration. Nothing in this module knows where a coverage store is
    (Constitution IV).
    """

    def __init__(
        self,
        root: Path,
        *,
        pointer: str,
        runs_dirname: str,
        uncertainty_file: str,
        variable: str,
    ) -> None:
        self._root = root
        self._pointer = pointer
        self._runs_dirname = runs_dirname
        self._uncertainty_file = uncertainty_file
        self._variable = variable
        self._resolved: Path | None = None
        self._field: SpreadField | None = None

    def _resolve(self) -> Path | None:
        try:
            text = (self._root / self._pointer).read_text(encoding="utf-8")
        except OSError:
            return None
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if len(lines) != 1:
            return None
        return self._root / self._runs_dirname / lines[0]

    def current(self) -> SpreadField | None:
        """The current uncertainty field, or nothing when no run has been published yet."""
        resolved = self._resolve()
        if resolved is None:
            return None
        if self._field is not None and resolved == self._resolved:
            return self._field
        try:
            payload = (resolved / self._uncertainty_file).read_bytes()
        except OSError:
            return None
        self._field = spread_from_netcdf(payload, variable=self._variable)
        self._resolved = resolved
        return self._field

    def refresh(self) -> SpreadField | None:
        """Forget what was read and resolve the pointer again."""
        self._field = None
        self._resolved = None
        return self.current()


def _bracket(axis: Sequence[float] | Sequence[int] | array, value: float) -> tuple[int, float]:
    """The lower index and the share of the upper one, clamped at both ends."""
    count = len(axis)
    if count == 1:
        return 0, 0.0
    if value <= axis[0]:
        return 0, 0.0
    if value >= axis[count - 1]:
        return count - 2, 1.0
    index = bisect_right(list(axis), value) - 1
    lower = float(axis[index])
    upper = float(axis[index + 1])
    if upper == lower:
        return index, 0.0
    return index, (value - lower) / (upper - lower)
