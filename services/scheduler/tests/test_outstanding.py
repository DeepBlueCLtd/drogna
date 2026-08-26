"""One run in flight at a time, cleared by a publication or by the timeout, never by hope.

FR-013 defines outstanding as "requested and neither published nor timed out". Both endings
are tested here because both failures are silent: a slot never cleared stops the loop, and a
slot cleared too eagerly lets two runs race to be current.
"""

from __future__ import annotations

from control_loop import divergence_payload, manual_clock, scheduler_document
from harness_scheduler.outstanding import OutstandingRegister
from harness_scheduler.policy import Decision
from harness_scheduler.service import DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, SchedulerService
from harness_types.config.scheduler import DrognaSchedulerConfiguration


def scheduler(clock, **overrides) -> SchedulerService:
    settings = DrognaSchedulerConfiguration.model_validate(scheduler_document(**overrides))
    return SchedulerService(settings, clock=clock)


def test_a_second_divergence_while_a_request_is_outstanding_is_declined() -> None:
    subject = scheduler(manual_clock(), minimum_interval_seconds=0.0)

    first = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="one"))
    second = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="two"))

    assert first is not None
    assert second is None
    assert subject.decisions[-1]["decision"] == Decision.DUPLICATE_OUTSTANDING.value


def test_a_divergence_in_another_region_is_folded_rather_than_run_concurrently() -> None:
    """The duplicate rule is per outstanding run, not per region (the spec's edge case)."""
    subject = scheduler(manual_clock(), minimum_interval_seconds=0.0)

    subject.handle(DIVERGENCE_TOPIC, divergence_payload(latitude=49.0, longitude=-5.0))
    elsewhere = subject.handle(
        DIVERGENCE_TOPIC, divergence_payload(divergence_id="far", latitude=50.5, longitude=-3.0)
    )

    assert elsewhere is None
    assert "folds into the next run" in subject.decisions[-1]["detail"]


def test_a_publication_clears_the_slot() -> None:
    clock = manual_clock()
    subject = scheduler(clock, minimum_interval_seconds=0.0)
    first = subject.handle(DIVERGENCE_TOPIC, divergence_payload())
    assert first is not None

    subject.handle(RUN_PUBLISHED_TOPIC, {"run_id": first["run_id"]})
    second = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="two"))

    assert subject.outstanding is not None
    assert second is not None
    assert second["run_id"] != first["run_id"]


def test_a_publication_for_a_different_run_clears_nothing() -> None:
    subject = scheduler(manual_clock(), minimum_interval_seconds=0.0)
    subject.handle(DIVERGENCE_TOPIC, divergence_payload())

    assert subject.handle_run_published({"run_id": "run-somebody-elses"}) is False
    assert subject.outstanding is not None


def test_a_request_that_never_completes_is_abandoned_and_the_event_is_recorded() -> None:
    """FR-013's fourth scenario: the loop must not be blocked for ever by one dead run."""
    clock = manual_clock()
    subject = scheduler(clock, minimum_interval_seconds=0.0, outstanding_timeout_seconds=1800.0)
    subject.handle(DIVERGENCE_TOPIC, divergence_payload())

    clock.advance(31)
    subject.advance()

    assert subject.outstanding is None
    assert subject.abandoned == 1
    assert subject.decisions[-1]["kind"] == "scheduler-abandoned"

    again = subject.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id="after"))
    assert again is not None


def test_the_register_refuses_to_hold_two() -> None:
    register = OutstandingRegister(timeout_seconds=60.0)
    register.open("run-a", at_micros=0, justified_by="d1")

    try:
        register.open("run-b", at_micros=1, justified_by="d2")
    except RuntimeError as error:
        assert "already outstanding" in str(error)
    else:  # pragma: no cover - the register must refuse
        raise AssertionError("two outstanding requests were accepted")
