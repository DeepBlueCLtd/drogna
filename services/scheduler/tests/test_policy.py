"""The minimum interval, including the boundary, which is where a policy is usually wrong.

FR-012 measures the interval in simulation time. That matters at an accelerated rate: an
interval in host seconds would mean something different in every scenario, and a rate of
zero would make it infinite.
"""

from __future__ import annotations

from control_loop import divergence_payload, manual_clock, scheduler_document
from harness_scheduler.policy import Decision
from harness_scheduler.service import DIVERGENCE_TOPIC, SchedulerService
from harness_types.config.scheduler import DrognaSchedulerConfiguration

MINUTE_MICROS = 60 * 1_000_000


def scheduler(clock, **overrides) -> SchedulerService:
    settings = DrognaSchedulerConfiguration.model_validate(scheduler_document(**overrides))
    return SchedulerService(settings, clock=clock)


def test_a_divergence_inside_the_minimum_interval_is_declined_with_a_reason() -> None:
    clock = manual_clock()
    subject = scheduler(clock, minimum_interval_seconds=1800.0)

    subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="one"))
    subject.handle_run_published({"run_id": subject.outstanding})

    clock.advance(15)  # fifteen minutes: half the interval
    request = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="two"))

    assert request is None
    assert [record["decision"] for record in subject.decisions] == [
        Decision.ACCEPTED.value,
        Decision.MINIMUM_INTERVAL.value,
    ]
    assert "minimum interval" in subject.decisions[-1]["detail"]


def test_a_divergence_exactly_at_the_boundary_is_accepted() -> None:
    """The boundary is inclusive: the interval has elapsed, so a run is warranted."""
    clock = manual_clock()
    subject = scheduler(clock, minimum_interval_seconds=1800.0)

    subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="one"))
    subject.handle_run_published({"run_id": subject.outstanding})

    clock.advance(30)
    request = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="two"))

    assert request is not None
    assert subject.decisions[-1]["decision"] == Decision.ACCEPTED.value


def test_the_first_divergence_is_never_declined_for_the_interval() -> None:
    """There is no previous run to be too close to, and a policy that forgot would stall."""
    subject = scheduler(manual_clock(), minimum_interval_seconds=86400.0)

    request = subject.handle(DIVERGENCE_TOPIC, divergence_payload())

    assert request is not None


def test_every_divergence_gets_exactly_one_decision() -> None:
    """SC-006: the count of decisions equals the count of divergences received."""
    subject = scheduler(manual_clock())

    for index in range(7):
        subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id=f"d{index}"))

    assert len(subject.decisions) == 7
    assert [record["divergence_id"] for record in subject.decisions] == [
        f"d{index}" for index in range(7)
    ]


def test_the_request_carries_the_divergence_that_justified_it() -> None:
    subject = scheduler(manual_clock())

    request = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="because"))

    assert request is not None
    assert request["divergence"]["divergence_id"] == "because"
    assert request["ensemble_size"] == 8
