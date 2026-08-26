"""Run identifiers are a function of the seed and the ordinal, and of nothing else.

Constitution II. The identifier appears in the coverage store's layout and in the collection
identifiers the query layer serves, so a replay that produced different names would produce
outputs nobody could diff against the run it replays.
"""

from __future__ import annotations

from control_loop import ROOT_SEED, divergence_payload, manual_clock, scheduler_document
from harness_core.rng import RandomStreams
from harness_scheduler.run_id import RUN_STREAM, run_identifier
from harness_scheduler.service import DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, SchedulerService
from harness_types.config.scheduler import DrognaSchedulerConfiguration


def test_the_same_seed_and_ordinal_give_the_same_identifier() -> None:
    first = run_identifier(RandomStreams(ROOT_SEED), 3)
    second = run_identifier(RandomStreams(ROOT_SEED), 3)

    assert first == second
    assert first.startswith("run-")


def test_a_different_seed_gives_a_different_identifier() -> None:
    assert run_identifier(RandomStreams(ROOT_SEED), 0) != run_identifier(
        RandomStreams(ROOT_SEED + 1), 0
    )


def test_identifiers_come_from_the_declared_stream() -> None:
    """Named, so that the manifest can record which stream a run's names came from."""
    randomness = RandomStreams(ROOT_SEED)
    identifier = run_identifier(randomness, 0)

    assert identifier.endswith(randomness.identifier_for(RUN_STREAM, 0))


def test_two_replays_of_one_scenario_request_the_same_names() -> None:
    """The property that matters: the sequence of run names is a function of the manifest."""

    def scenario() -> list[str]:
        settings = DrognaSchedulerConfiguration.model_validate(
            scheduler_document(minimum_interval_seconds=0.0)
        )
        clock = manual_clock()
        service = SchedulerService(settings, clock=clock)
        names = []
        for index in range(4):
            request = service.handle(
                DIVERGENCE_TOPIC, divergence_payload(divergence_id=f"d{index}")
            )
            assert request is not None
            names.append(request["run_id"])
            service.handle(RUN_PUBLISHED_TOPIC, {"run_id": request["run_id"]})
            clock.advance(10)
        return names

    assert scenario() == scenario()
