"""The window is bounded twice, evicts by simulation time, and counts what it sheds.

FR-22 makes this the component's memory contract: the monitor holds recent observations in
process memory and the window must not grow with the length of the scenario. Two bounds,
because they answer different questions — the span says how far back is worth scoring, and
the count says how much memory this process may use at a clock rate that puts arbitrarily
many samples inside a span.

Nothing here advances a host clock. The window is moved by the simulation instants of the
soundings put into it, which is the only thing that ought to move it.
"""

from __future__ import annotations

from harness_monitor.observations import Measurement, ObservedProperty, SoundingAssembler
from harness_monitor.window import RollingWindow
from monitor_support import sounding


def test_a_sample_older_than_the_span_is_evicted() -> None:
    window = RollingWindow(span_seconds=600.0, maximum_samples=100)

    window.add(sounding(minutes=0.0))
    window.add(sounding(minutes=5.0))
    assert len(window) == 2

    window.add(sounding(minutes=11.0))

    assert len(window) == 2
    assert window.evicted_by_span == 1
    assert window.oldest is not None
    assert window.oldest.sim_micros == sounding(minutes=5.0).sim_micros


def test_the_count_bound_holds_when_the_span_would_not() -> None:
    """At a high clock rate a span can hold any number of samples. The count is what bites."""
    window = RollingWindow(span_seconds=3600.0, maximum_samples=3)

    for index in range(10):
        window.add(sounding(minutes=index * 0.01))

    assert len(window) == 3
    assert window.evicted_by_count == 7
    assert window.evicted_by_span == 0


def test_the_span_is_measured_in_simulation_time_only() -> None:
    window = RollingWindow(span_seconds=600.0, maximum_samples=100)
    window.add(sounding(minutes=0.0))
    window.add(sounding(minutes=9.0))

    assert window.occupied_micros() == 9 * 60 * 1_000_000
    assert len(window) == 2


def test_a_late_arrival_is_ordered_rather_than_appended() -> None:
    """Out-of-order delivery is normal on a broker and must not corrupt the span."""
    window = RollingWindow(span_seconds=600.0, maximum_samples=100)

    window.add(sounding(minutes=5.0))
    window.add(sounding(minutes=1.0))

    assert window.oldest is not None and window.newest is not None
    assert window.oldest.sim_micros < window.newest.sim_micros


def test_the_assembler_sheds_part_assembled_soundings_and_counts_them() -> None:
    """A sounding whose third measurement never arrives is dropped, and the drop is visible."""
    assembler = SoundingAssembler(maximum_pending=2)

    for index in range(5):
        assembler.accept(
            Measurement(
                platform=f"platform_{index}",
                observed_property=ObservedProperty.TEMPERATURE,
                value=12.0,
                sim_micros=index * 1_000_000,
                latitude=49.0,
                longitude=-5.0,
                depth_m=50.0,
            )
        )

    assert assembler.pending == 2
    assert assembler.shed == 3


def test_three_measurements_at_one_place_and_instant_become_one_sounding() -> None:
    """The pairing ADR-0005 forces: sound speed needs all three, so all three must arrive."""
    assembler = SoundingAssembler(maximum_pending=8)
    values = {
        ObservedProperty.TEMPERATURE: 12.5,
        ObservedProperty.SALINITY: 35.1,
        ObservedProperty.PRESSURE: 50.3,
    }

    completed = [
        assembler.accept(
            Measurement(
                platform="platform_a",
                observed_property=observed,
                value=value,
                sim_micros=0,
                latitude=49.0,
                longitude=-5.0,
                depth_m=50.0,
            )
        )
        for observed, value in values.items()
    ]

    assert completed[0] is None and completed[1] is None
    assembled = completed[2]
    assert assembled is not None
    assert (assembled.temperature_c, assembled.salinity_psu, assembled.pressure_dbar) == (
        12.5,
        35.1,
        50.3,
    )
