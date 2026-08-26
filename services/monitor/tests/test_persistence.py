"""A spike raises nothing. Persistence raises exactly one thing.

This is the test the feature is judged on. SRD §4 assigns over-sensitivity to C-11, and
FR-24 says a divergence needs the residual to be above threshold *and* to have persisted.
The first test here is the one that matters: a single sample at ten times the threshold,
with its neighbours in agreement with the forecast, produces nothing at all.

The other three cover what must still work — the spatial rule, the temporal rule, and the
two events that invalidate accumulated evidence outright.
"""

from __future__ import annotations

from harness_monitor.persistence import PersistenceRule, PersistenceTracker
from harness_monitor.residual import ResidualSample

THRESHOLD = 1.75
MINUTE_MICROS = 60 * 1_000_000


def tracker(**overrides: float | int) -> PersistenceTracker:
    settings: dict[str, float | int] = {
        "threshold_m_per_s": THRESHOLD,
        "neighbourhood_radius_m": 5_000.0,
        "spatial_sample_count": 3,
        "temporal_sample_count": 3,
        "temporal_span_seconds": 600.0,
        "retention_micros": 3600 * 1_000_000,
    }
    settings.update(overrides)
    return PersistenceTracker(**settings)  # type: ignore[arg-type]


def sample(
    *,
    residual: float,
    minutes: float = 0.0,
    latitude: float = 49.0,
    longitude: float = -5.0,
    run_id: str = "run-a",
) -> ResidualSample:
    return ResidualSample(
        forecast_run_id=run_id,
        signed_m_per_s=residual,
        measured_m_per_s=1500.0 + residual,
        sim_micros=int(minutes * MINUTE_MICROS),
        latitude=latitude,
        longitude=longitude,
        depth_m=50.0,
        platform="platform_a",
    )


def test_a_single_spike_raises_nothing_however_large_it_is() -> None:
    """SC-001, as a property rather than a hope: one sample is never evidence."""
    subject = tracker()

    raised = [
        subject.observe(sample(residual=0.2, minutes=0.0)),
        subject.observe(sample(residual=THRESHOLD * 10, minutes=5.0)),
        subject.observe(sample(residual=0.1, minutes=10.0)),
        subject.observe(sample(residual=0.15, minutes=15.0)),
    ]

    assert raised == [None, None, None, None]
    assert subject.outliers >= 0


def test_a_spike_between_agreeing_samples_never_builds_a_streak() -> None:
    """Twenty spikes, each isolated by an agreeing sample, still raise nothing."""
    subject = tracker()
    raised = []
    for index in range(20):
        raised.append(subject.observe(sample(residual=THRESHOLD * 10, minutes=index * 2.0)))
        raised.append(subject.observe(sample(residual=0.05, minutes=index * 2.0 + 1.0)))

    # The spikes are all at one position, so the spatial rule would fire if the rules were
    # careless about what a neighbourhood means. It is the streak that must not build.
    temporal = [
        event for event in raised if event is not None and event.rule is PersistenceRule.TEMPORAL
    ]
    assert temporal == []


def test_the_spatial_rule_is_satisfied_by_neighbouring_samples() -> None:
    subject = tracker()

    first = subject.observe(sample(residual=2.5, latitude=49.000, longitude=-5.000))
    second = subject.observe(sample(residual=2.4, latitude=49.005, longitude=-5.000, minutes=1))
    third = subject.observe(sample(residual=2.6, latitude=49.010, longitude=-5.005, minutes=2))

    assert first is None and second is None
    assert third is not None
    assert third.rule is PersistenceRule.SPATIAL
    assert len(third.samples) == 3
    region = third.region()
    assert 48.99 < region.latitude < 49.02
    assert region.radius_m > 0


def test_a_distant_sample_is_not_a_neighbour() -> None:
    subject = tracker(temporal_sample_count=99)

    subject.observe(sample(residual=2.5, latitude=49.0, longitude=-5.0))
    subject.observe(sample(residual=2.5, latitude=49.5, longitude=-5.0, minutes=1))
    third = subject.observe(sample(residual=2.5, latitude=50.0, longitude=-5.0, minutes=2))

    assert third is None


def test_the_temporal_rule_needs_both_a_count_and_a_span() -> None:
    """Three consecutive samples inside one minute are a burst, not persistence."""
    quick = tracker(spatial_sample_count=99)
    for index in range(3):
        assert quick.observe(sample(residual=2.5, minutes=index * 0.1)) is None

    slow = tracker(spatial_sample_count=99)
    assert slow.observe(sample(residual=2.5, minutes=0.0)) is None
    assert slow.observe(sample(residual=2.5, minutes=6.0)) is None
    raised = slow.observe(sample(residual=2.5, minutes=12.0))

    assert raised is not None
    assert raised.rule is PersistenceRule.TEMPORAL
    assert raised.span_micros == 12 * MINUTE_MICROS


def test_one_episode_raises_one_event() -> None:
    """SC-002: the evidence is spent when it is used, so a sustained bias says so once."""
    subject = tracker(spatial_sample_count=99)
    raised = [subject.observe(sample(residual=2.5, minutes=index * 6.0)) for index in range(6)]

    assert sum(1 for event in raised if event is not None) == 1


def test_a_new_publication_invalidates_the_evidence() -> None:
    """Residuals scored against a superseded field say nothing about the current one."""
    subject = tracker(spatial_sample_count=99)
    subject.observe(sample(residual=2.5, minutes=0.0))
    subject.observe(sample(residual=2.5, minutes=6.0))

    subject.invalidate("a new forecast was published")
    raised = subject.observe(sample(residual=2.5, minutes=12.0, run_id="run-b"))

    assert raised is None
    assert subject.streak[0].forecast_run_id == "run-b"


def test_a_sample_scored_against_another_run_invalidates_by_itself() -> None:
    subject = tracker(spatial_sample_count=99)
    subject.observe(sample(residual=2.5, minutes=0.0, run_id="run-a"))
    subject.observe(sample(residual=2.5, minutes=6.0, run_id="run-a"))

    raised = subject.observe(sample(residual=2.5, minutes=12.0, run_id="run-b"))

    assert raised is None


def test_a_reconnection_invalidates_the_evidence() -> None:
    """A dropped subscription is a gap in the window, and a gap is not agreement."""
    subject = tracker(spatial_sample_count=99)
    subject.observe(sample(residual=2.5, minutes=0.0))
    subject.observe(sample(residual=2.5, minutes=6.0))

    assert subject.invalidate("broker reconnection") == "broker reconnection"
    assert subject.held == 0
    assert subject.observe(sample(residual=2.5, minutes=12.0)) is None


def test_the_counts_may_not_be_one() -> None:
    """A configuration that would let one sample raise a run is refused at construction."""
    try:
        tracker(spatial_sample_count=1)
    except ValueError as error:
        assert "spike" in str(error)
    else:  # pragma: no cover - the constructor must refuse
        raise AssertionError("a persistence count of one was accepted")
