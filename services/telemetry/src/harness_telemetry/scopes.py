"""What each running statistic is about, and which forecast run it belongs to.

Two scopes and one attribution rule.

The scopes are the scenario and a cell of a fixed grid. The grid is fixed deliberately: a
grid that grew a cell wherever a residual first appeared would make the number of
aggregates a function of where the sampling platform went, and FR-003 forbids memory that
grows with the scenario. Rows times columns is therefore the hard bound on region scopes,
declared in configuration before the run starts. A residual outside the grid is counted at
scenario level and nowhere else — counted, because a sample that could not be placed is not
a sample that did not happen.

The attribution rule is FR-004. A residual belongs to the forecast run it was *scored
against*, never to whichever run happens to be current when it arrives, so a report that
crosses a publication boundary in flight lands in the record it describes. When a new run
is published the superseded run's record is closed and kept as it stood; merging two runs'
residuals would produce a figure describing neither.

Closed records are kept for a bounded number of publications, because keeping every one
would make memory a function of how many runs a scenario contained, which is the same
unbounded growth by another route. A record is retained long enough to be published and to
absorb residuals still in flight for it; a residual arriving for a run older than that is
counted as unattributable rather than folded into a run it says nothing about.
"""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from harness_telemetry.accumulator import RunningStatistic
from harness_telemetry.freshness import FreshnessTracker

__all__ = [
    "RegionCell",
    "RegionGrid",
    "RunRecord",
    "ScopeLevel",
    "ScopeStatistic",
    "StatisticsBook",
]


class ScopeLevel(StrEnum):
    """What one running statistic covers."""

    SCENARIO = "scenario"
    REGION = "region"


@dataclass(frozen=True)
class RegionCell:
    """One cell of the declared grid: its index, and the water it covers."""

    row: int
    column: int
    minimum_latitude: float
    maximum_latitude: float
    minimum_longitude: float
    maximum_longitude: float

    @property
    def identifier(self) -> str:
        """The grid index, row then column, as the contract spells it."""
        return f"r{self.row}c{self.column}"


@dataclass(frozen=True)
class RegionGrid:
    """A fixed grid of cells, sized before the run starts and never grown."""

    origin_latitude: float
    origin_longitude: float
    cell_latitude_degrees: float
    cell_longitude_degrees: float
    rows: int
    columns: int

    @classmethod
    def from_config(cls, regions: Any) -> RegionGrid:
        """Build from the generated configuration model, which has already checked it."""
        return cls(
            origin_latitude=regions.origin_latitude,
            origin_longitude=regions.origin_longitude,
            cell_latitude_degrees=regions.cell_latitude_degrees,
            cell_longitude_degrees=regions.cell_longitude_degrees,
            rows=regions.rows,
            columns=regions.columns,
        )

    @property
    def cell_count(self) -> int:
        """The hard bound on how many region scopes one run's record can hold."""
        return self.rows * self.columns

    def cell_for(self, latitude: float, longitude: float) -> RegionCell | None:
        """The cell this position falls in, or nothing when it falls outside the grid."""
        row = int((latitude - self.origin_latitude) // self.cell_latitude_degrees)
        column = int((longitude - self.origin_longitude) // self.cell_longitude_degrees)
        if not (0 <= row < self.rows and 0 <= column < self.columns):
            return None
        return RegionCell(
            row=row,
            column=column,
            minimum_latitude=self.origin_latitude + row * self.cell_latitude_degrees,
            maximum_latitude=self.origin_latitude + (row + 1) * self.cell_latitude_degrees,
            minimum_longitude=self.origin_longitude + column * self.cell_longitude_degrees,
            maximum_longitude=self.origin_longitude + (column + 1) * self.cell_longitude_degrees,
        )


class ScopeStatistic:
    """One scope's aggregate, the simulation-time window it covers, and its freshness."""

    __slots__ = (
        "_first_sim_micros",
        "_last_sim_micros",
        "cell",
        "freshness",
        "level",
        "statistic",
    )

    def __init__(self, level: ScopeLevel, cell: RegionCell | None, window_micros: int) -> None:
        self.level = level
        self.cell = cell
        self.statistic = RunningStatistic()
        self.freshness = FreshnessTracker(window_micros)
        self._first_sim_micros: int | None = None
        self._last_sim_micros: int | None = None

    @property
    def region_id(self) -> str | None:
        return None if self.cell is None else self.cell.identifier

    @property
    def first_sim_micros(self) -> int | None:
        return self._first_sim_micros

    @property
    def last_sim_micros(self) -> int | None:
        return self._last_sim_micros

    def note(self, sim_micros: int) -> None:
        """Extend the covered window and record a real update at this instant."""
        if self._first_sim_micros is None or sim_micros < self._first_sim_micros:
            self._first_sim_micros = sim_micros
        if self._last_sim_micros is None or sim_micros > self._last_sim_micros:
            self._last_sim_micros = sim_micros
        self.freshness.updated(sim_micros)


class RunRecord:
    """Every scope's statistics for one forecast run, open or closed."""

    def __init__(self, run_id: str, *, grid: RegionGrid, window_micros: int) -> None:
        self.run_id = run_id
        self.closed = False
        self._grid = grid
        self._window_micros = window_micros
        self._scopes: dict[tuple[ScopeLevel, str | None], ScopeStatistic] = {}

    def scope(self, level: ScopeLevel, region_id: str | None) -> ScopeStatistic | None:
        """The scope's statistics, or nothing when no residual has landed in it."""
        return self._scopes.get((level, region_id))

    def scopes(self) -> Iterator[ScopeStatistic]:
        """Every scope that has seen a residual, scenario first then the cells in order."""
        for key in sorted(self._scopes, key=lambda item: (item[0].value, item[1] or "")):
            yield self._scopes[key]

    def _obtain(self, level: ScopeLevel, cell: RegionCell | None) -> ScopeStatistic:
        region_id = None if cell is None else cell.identifier
        existing = self._scopes.get((level, region_id))
        if existing is not None:
            return existing
        created = ScopeStatistic(level, cell, self._window_micros)
        self._scopes[(level, region_id)] = created
        return created

    def add_sample(
        self, *, residual: float, sim_micros: int, latitude: float, longitude: float
    ) -> None:
        """Fold one signed residual into the scenario scope and, where it falls, a cell."""
        scenario = self._obtain(ScopeLevel.SCENARIO, None)
        scenario.statistic.add_sample(residual)
        scenario.note(sim_micros)

        cell = self._grid.cell_for(latitude, longitude)
        if cell is None:
            return
        region = self._obtain(ScopeLevel.REGION, cell)
        region.statistic.add_sample(residual)
        region.note(sim_micros)

    def add_summary(self, *, count: int, mean_absolute_m_per_s: float, sim_micros: int) -> None:
        """Fold a producer's interval summary into the scenario scope only.

        A summary carries no position. Attributing it to a cell would be an invention, and
        spreading it across every cell would be the same invention repeated.
        """
        scenario = self._obtain(ScopeLevel.SCENARIO, None)
        scenario.statistic.add_summary(count, mean_absolute_m_per_s)
        if count > 0:
            scenario.note(sim_micros)


class StatisticsBook:
    """Every forecast run's statistics: one open record and a bounded tail of closed ones."""

    RETAINED_RECORDS = 8
    """How many superseded runs are kept. Bounded, so memory does not follow the run count."""

    def __init__(self, *, grid: RegionGrid, staleness_window_micros: int) -> None:
        self._grid = grid
        self._window_micros = staleness_window_micros
        self._records: OrderedDict[str, RunRecord] = OrderedDict()
        self._open_run_id: str | None = None
        self._unattributable = 0

    @property
    def open_run_id(self) -> str | None:
        """The run residuals are currently expected against, or nothing before the first."""
        return self._open_run_id

    @property
    def unattributable(self) -> int:
        """Residuals for a run no longer held. Counted, never folded into another run."""
        return self._unattributable

    def records(self) -> list[RunRecord]:
        """Every record held, oldest first."""
        return list(self._records.values())

    def record_for(self, run_id: str) -> RunRecord | None:
        return self._records.get(run_id)

    def supersede(self, run_id: str) -> None:
        """A new run has been published: close what was open and open a record for this one.

        Idempotent in the run identifier, because a republished announcement of the run
        already current is not a new boundary and must not close a record that is still
        being written to.
        """
        if run_id == self._open_run_id:
            return
        if self._open_run_id is not None:
            existing = self._records.get(self._open_run_id)
            if existing is not None:
                existing.closed = True
        self._open_run_id = run_id
        self._obtain(run_id)

    def observe_sample(
        self,
        forecast_run_id: str,
        *,
        residual: float,
        sim_micros: int,
        latitude: float,
        longitude: float,
    ) -> None:
        """Fold one residual into the record of the run it was scored against."""
        record = self._for_attribution(forecast_run_id)
        if record is None:
            return
        record.add_sample(
            residual=residual, sim_micros=sim_micros, latitude=latitude, longitude=longitude
        )

    def observe_summary(
        self, forecast_run_id: str, *, count: int, mean_absolute_m_per_s: float, sim_micros: int
    ) -> None:
        """Fold one interval summary into the record of the run it describes."""
        record = self._for_attribution(forecast_run_id)
        if record is None:
            return
        record.add_summary(
            count=count, mean_absolute_m_per_s=mean_absolute_m_per_s, sim_micros=sim_micros
        )

    def _for_attribution(self, run_id: str) -> RunRecord | None:
        existing = self._records.get(run_id)
        if existing is not None:
            return existing
        if self._open_run_id is None:
            # Nothing has been announced yet, so the residual's own attribution is the only
            # statement of which run it was scored against, and it is believed.
            self._open_run_id = run_id
            return self._obtain(run_id)
        self._unattributable += 1
        return None

    def _obtain(self, run_id: str) -> RunRecord:
        record = RunRecord(run_id, grid=self._grid, window_micros=self._window_micros)
        self._records[run_id] = record
        self._release()
        return record

    def _release(self) -> None:
        """Drop the oldest closed records once more than the retained tail is held."""
        while len(self._records) > self.RETAINED_RECORDS + 1:
            oldest, _ = next(iter(self._records.items()))
            if oldest == self._open_run_id:
                return
            self._records.pop(oldest)
