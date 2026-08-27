"""Memory is a function of the grid, not of the scenario. SC-002 measured, not asserted.

FR-003 is the reason the aggregates are incremental at all. A statistic that held its
samples would cost ten times as much over a scenario ten times as long, for a report that is
the same handful of numbers either way — and the harness would quietly stop being able to
run the long scenario it exists to demonstrate.

The footprint is measured by walking the object graph rather than by sampling the process,
because a process measurement is dominated by the interpreter and by whatever the garbage
collector happened to be doing. What is walked is the book of running statistics itself,
which is the only thing this component retains.
"""

from __future__ import annotations

import gc
import sys
from typing import Any

from harness_telemetry.scopes import RegionGrid, StatisticsBook
from telemetry_support import settings

SECOND = 1_000_000
REFERENCE_SAMPLES = 500


def deep_size(root: Any) -> int:
    """Bytes reachable from ``root``, counting each object once.

    ``gc.get_referents`` rather than a hand-written walk, so a container this test does not
    know about still has its contents counted. Types and modules are not followed: they are
    shared by every object in the process and are not part of anyone's footprint.
    """
    seen: set[int] = set()
    pending = [root]
    total = 0
    while pending:
        item = pending.pop()
        if id(item) in seen or isinstance(item, type | type(sys)):
            continue
        seen.add(id(item))
        total += sys.getsizeof(item, 0)
        pending.extend(gc.get_referents(item))
    return total


def book_over(samples: int) -> StatisticsBook:
    """One book fed a stream of the given length, spread over the whole grid."""
    telemetry = settings().telemetry
    held = StatisticsBook(
        grid=RegionGrid.from_config(telemetry.regions), staleness_window_micros=600 * SECOND
    )
    held.supersede("forecast-1")
    for index in range(samples):
        held.observe_sample(
            "forecast-1",
            residual=(index % 17) - 8.0,
            sim_micros=index * SECOND,
            latitude=48.5 + (index % 2),
            longitude=-5.5 + (index % 2),
        )
    return held


def test_a_scenario_ten_times_as_long_costs_the_same_memory() -> None:
    reference = deep_size(book_over(REFERENCE_SAMPLES))
    tenfold = deep_size(book_over(REFERENCE_SAMPLES * 10))

    assert tenfold <= reference * 1.10, (
        f"the footprint grew from {reference} to {tenfold} bytes over ten times the stream, "
        "which means something is being retained per sample"
    )


def test_the_number_of_scopes_is_bounded_by_the_declared_grid() -> None:
    held = book_over(REFERENCE_SAMPLES * 10)
    record = held.record_for("forecast-1")

    assert record is not None
    grid = RegionGrid.from_config(settings().telemetry.regions)
    assert len(list(record.scopes())) <= grid.cell_count + 1


def test_the_running_statistic_itself_holds_no_samples() -> None:
    """Slots, and every one of them a scalar: there is nowhere for a sample to be kept."""
    from harness_telemetry.accumulator import RunningStatistic

    statistic = RunningStatistic()
    for index in range(10_000):
        statistic.add_sample(float(index % 5))

    assert all(
        isinstance(getattr(statistic, name), int | float | type(None))
        for name in RunningStatistic.__slots__
    )
    assert deep_size(statistic) < 1_000
