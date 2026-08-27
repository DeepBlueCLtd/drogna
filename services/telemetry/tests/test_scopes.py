"""Scoping, run attribution, and what happens to a run's statistics when it is superseded.

Three properties, and the third is the one that is easy to get wrong. Scenario and region
scopes accumulate independently; a residual is attributed to the forecast run it was
*scored against* rather than to whichever run happens to be current when it arrives; and a
new publication closes the superseded run's record rather than merging it, because merging
two runs' residuals produces a figure that describes neither.

The grid is fixed before the run starts. A grid that grew a cell wherever a sample first
appeared would make memory a function of where the platform went, which is the unbounded
growth FR-003 forbids, so a residual outside the declared grid is counted at scenario level
and nowhere else — counted, not dropped.
"""

from __future__ import annotations

import pytest
from harness_telemetry.accumulator import Basis
from harness_telemetry.scopes import RegionGrid, ScopeLevel, StatisticsBook
from telemetry_support import settings

SECOND = 1_000_000
WINDOW = 600 * SECOND


def grid() -> RegionGrid:
    return RegionGrid.from_config(settings().telemetry.regions)


def book() -> StatisticsBook:
    return StatisticsBook(grid=grid(), staleness_window_micros=WINDOW)


def test_the_grid_is_bounded_before_the_run_starts() -> None:
    assert grid().cell_count == 4


def test_a_position_inside_the_grid_lands_in_one_cell() -> None:
    cell = grid().cell_for(48.5, -5.5)

    assert cell is not None
    assert cell.identifier == "r0c0"
    assert cell.minimum_latitude == pytest.approx(48.0)
    assert cell.maximum_latitude == pytest.approx(49.0)


def test_a_position_outside_the_grid_belongs_to_no_cell() -> None:
    assert grid().cell_for(80.0, 0.0) is None


def test_scenario_and_region_scopes_accumulate_independently() -> None:
    held = book()
    held.observe_sample("forecast-1", residual=2.0, sim_micros=0, latitude=48.5, longitude=-5.5)
    held.observe_sample(
        "forecast-1", residual=-4.0, sim_micros=SECOND, latitude=49.5, longitude=-4.5
    )

    record = held.record_for("forecast-1")
    assert record is not None
    scenario = record.scope(ScopeLevel.SCENARIO, None)
    first = record.scope(ScopeLevel.REGION, "r0c0")
    second = record.scope(ScopeLevel.REGION, "r1c1")

    assert scenario is not None and first is not None and second is not None
    assert scenario.statistic.count == 2
    assert first.statistic.count == 1
    assert second.statistic.count == 1
    assert first.statistic.mean_m_per_s == pytest.approx(2.0)
    assert second.statistic.mean_m_per_s == pytest.approx(-4.0)


def test_a_residual_outside_the_grid_is_counted_at_scenario_level_only() -> None:
    held = book()
    held.observe_sample("forecast-1", residual=1.0, sim_micros=0, latitude=80.0, longitude=0.0)

    record = held.record_for("forecast-1")
    assert record is not None
    scenario = record.scope(ScopeLevel.SCENARIO, None)

    assert scenario is not None
    assert scenario.statistic.count == 1
    assert [scope for scope in record.scopes() if scope.level is ScopeLevel.REGION] == []


def test_a_summary_reaches_the_scenario_scope_and_no_region() -> None:
    """A summary carries no position, so claiming one for it would be an invention."""
    held = book()
    held.observe_summary("forecast-1", count=12, mean_absolute_m_per_s=0.5, sim_micros=SECOND)

    record = held.record_for("forecast-1")
    assert record is not None
    scenario = record.scope(ScopeLevel.SCENARIO, None)

    assert scenario is not None
    assert scenario.statistic.count == 12
    assert scenario.statistic.basis is Basis.SUMMARIES
    assert [scope for scope in record.scopes() if scope.level is ScopeLevel.REGION] == []


def test_a_new_publication_closes_the_old_record_rather_than_merging_it() -> None:
    held = book()
    held.observe_sample("forecast-1", residual=2.0, sim_micros=0, latitude=48.5, longitude=-5.5)
    held.supersede("forecast-2")
    held.observe_sample(
        "forecast-2", residual=6.0, sim_micros=SECOND, latitude=48.5, longitude=-5.5
    )

    old = held.record_for("forecast-1")
    new = held.record_for("forecast-2")
    assert old is not None and new is not None
    old_scenario = old.scope(ScopeLevel.SCENARIO, None)
    new_scenario = new.scope(ScopeLevel.SCENARIO, None)

    assert old.closed is True
    assert new.closed is False
    assert old_scenario is not None and new_scenario is not None
    assert old_scenario.statistic.count == 1
    assert old_scenario.statistic.mean_m_per_s == pytest.approx(2.0)
    assert new_scenario.statistic.count == 1
    assert new_scenario.statistic.mean_m_per_s == pytest.approx(6.0)


def test_a_late_residual_is_attributed_to_the_run_it_was_scored_against() -> None:
    held = book()
    held.observe_sample("forecast-1", residual=2.0, sim_micros=0, latitude=48.5, longitude=-5.5)
    held.supersede("forecast-2")
    held.observe_sample(
        "forecast-1", residual=4.0, sim_micros=SECOND, latitude=48.5, longitude=-5.5
    )

    old = held.record_for("forecast-1")
    new = held.record_for("forecast-2")
    assert old is not None and new is not None
    old_scenario = old.scope(ScopeLevel.SCENARIO, None)

    assert old_scenario is not None
    assert old_scenario.statistic.count == 2
    assert old_scenario.statistic.mean_m_per_s == pytest.approx(3.0)
    assert new.scope(ScopeLevel.SCENARIO, None) is None


def test_the_covered_window_spans_the_residuals_folded_in() -> None:
    held = book()
    held.observe_sample(
        "forecast-1", residual=1.0, sim_micros=5 * SECOND, latitude=48.5, longitude=-5.5
    )
    held.observe_sample(
        "forecast-1", residual=1.0, sim_micros=90 * SECOND, latitude=48.5, longitude=-5.5
    )

    record = held.record_for("forecast-1")
    assert record is not None
    scenario = record.scope(ScopeLevel.SCENARIO, None)

    assert scenario is not None
    assert scenario.first_sim_micros == 5 * SECOND
    assert scenario.last_sim_micros == 90 * SECOND
    assert scenario.freshness.last_update_micros == 90 * SECOND


def test_the_number_of_records_held_is_bounded_however_many_runs_there_are() -> None:
    held = book()
    for index in range(200):
        run = f"forecast-{index}"
        held.supersede(run)
        held.observe_sample(
            run, residual=1.0, sim_micros=index * SECOND, latitude=48.5, longitude=-5.5
        )

    assert len(held.records()) <= StatisticsBook.RETAINED_RECORDS + 1


def test_a_residual_for_a_run_long_since_released_is_counted_and_not_misattributed() -> None:
    held = book()
    for index in range(StatisticsBook.RETAINED_RECORDS + 3):
        held.supersede(f"forecast-{index}")
    current = held.open_run_id
    held.observe_sample(
        "forecast-0", residual=9.0, sim_micros=SECOND, latitude=48.5, longitude=-5.5
    )

    assert held.unattributable == 1
    assert current is not None
    record = held.record_for(current)
    assert record is None or record.scope(ScopeLevel.SCENARIO, None) is None
