"""A scheduler that restarts carries on counting, rather than asking for run zero again.

Found by restarting the composed stack rather than by reading it, and the symptom was a loop
that turned once and then stopped:

    scheduler   ok   awaiting run-000000-7f80b47c7b91
    publisher   ok   current run-000000-7f80b47c7b91

A run identifier is a pure function of the root seed and the run sequence (Constitution II,
009 T052), which is what makes a replay diffable — and it is also what makes a scheduler that
starts counting from zero compute a name the store already holds. The publisher refuses it,
correctly, with "a run identifier names one run, and replacing one silently would make two
runs indistinguishable"; the request is then outstanding against a run that will never be
published, and nothing moves until the outstanding timeout expires. One wasted run of the
scenario per restart, and an hour of simulated time.

The repair is that the announcement of a published run is *retained* by the broker. Which
run is current is state and not an event: every component connects after the last
announcement at least once, because every component restarts. A starting scheduler is
therefore told at once, and reads the sequence back out of the name — which it can only do
because the store's rule puts the sequence in the name, which is the other half of T052.

The transport is stood in for here, as it is in every test in this repository. What is
asserted is what the scheduler does with an announcement it receives before its first
divergence, and that the publisher asks for the announcement to be retained at all.
"""

from __future__ import annotations

from typing import Any

from control_loop import (
    Recorder,
    divergence_payload,
    manual_clock,
    publisher_document,
    scheduler_document,
)
from harness_publisher import publish as publisher_publish
from harness_scheduler.service import DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, SchedulerService
from harness_types.config.scheduler import DrognaSchedulerConfiguration

# From the table in stores/coverage/layout.md, at the root seed both destinations carry.
RUN_ZERO = "run-000000-7f80b47c7b91"
RUN_ONE = "run-000001-6ab42ca09e7d"
RUN_TWO = "run-000002-3c5d9275107d"


class _Retaining(Recorder):
    """A recorder that also offers retention, as the real broker client does."""

    def __init__(self) -> None:
        super().__init__()
        self.retained: list[str] = []

    def publish_retained(self, topic: str, payload: bytes) -> None:
        self.retained.append(topic)
        self.publish(topic, payload)


def _scheduler(recorder: Recorder) -> SchedulerService:
    return SchedulerService(
        DrognaSchedulerConfiguration.model_validate(
            scheduler_document(minimum_interval_seconds=0.0)
        ),
        clock=manual_clock(),
        publisher=recorder,
    )


def _request(service: SchedulerService, identifier: str) -> dict[str, Any]:
    request = service.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id=identifier))
    assert request is not None, "the divergence was declined, so this proves nothing"
    return request


def test_a_fresh_scheduler_asks_for_the_first_run_of_the_scenario() -> None:
    """The baseline the test below is a departure from: nothing published, so run zero."""
    assert _request(_scheduler(Recorder()), "d0")["run_id"] == RUN_ZERO


def test_a_scheduler_told_what_is_published_carries_on_from_there() -> None:
    """The repair: the retained announcement arrives first, and the sequence starts after it."""
    service = _scheduler(Recorder())

    service.handle(RUN_PUBLISHED_TOPIC, {"run_id": RUN_ONE})
    request = _request(service, "d0")

    assert request["run_id"] == RUN_TWO
    assert request["run_sequence"] == 2


def test_an_announcement_of_an_older_run_does_not_wind_the_sequence_back() -> None:
    """Announcements can arrive out of order; the sequence only ever goes forward."""
    service = _scheduler(Recorder())

    service.handle(RUN_PUBLISHED_TOPIC, {"run_id": RUN_TWO})
    service.handle(RUN_PUBLISHED_TOPIC, {"run_id": RUN_ZERO})

    assert _request(service, "d0")["run_sequence"] == 3


def test_a_run_named_outside_the_store_rule_moves_the_sequence_nowhere() -> None:
    """The store's initial run is one of these, and it is not the nth run of the scenario."""
    service = _scheduler(Recorder())

    service.handle(RUN_PUBLISHED_TOPIC, {"run_id": "run-initial"})

    assert _request(service, "d0")["run_id"] == RUN_ZERO


def test_the_publisher_asks_for_its_announcement_to_be_retained() -> None:
    """The other half: without this the scheduler above is never told anything at all."""
    recorder = _Retaining()

    publisher_publish.publish_announcement(recorder, {"run_id": RUN_ZERO})

    assert recorder.retained == [publisher_publish.RUN_PUBLISHED_TOPIC]


def test_a_publisher_that_cannot_retain_still_announces() -> None:
    """Retention is the transport's idea, not the harness's; a recorder is not made to know it."""
    recorder = Recorder()

    publisher_publish.publish_announcement(recorder, {"run_id": RUN_ZERO})

    assert recorder.topics() == [publisher_publish.RUN_PUBLISHED_TOPIC]


def test_the_publisher_document_and_the_scheduler_agree_on_the_store() -> None:
    """A guard on the fixtures these tests are built from, not on the components."""
    assert publisher_document()["seed"]["root"] == scheduler_document()["seed"]["root"]
