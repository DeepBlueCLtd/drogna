"""Run identifiers obey the coverage store's rule, and are a function of the seed and sequence.

Constitution II, and the store's layout. The identifier appears in the coverage store's tree
and in the collection identifiers the query layer serves, so a replay that produced different
names would produce outputs nobody could diff against the run it replays.

The store's own rule is asserted here rather than referred to, against the worked examples
``stores/coverage/layout.md`` publishes. That is the point of the change these tests came
with: two components compute this string and no module is shared between them, so what keeps
them in step is that each is held to the same stated values.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from control_loop import ROOT_SEED, divergence_payload, manual_clock, scheduler_document
from harness_scheduler.run_id import run_identifier
from harness_scheduler.service import DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, SchedulerService
from harness_types.config.scheduler import DrognaSchedulerConfiguration

REPO_ROOT = Path(__file__).resolve().parents[3]
# The rule, as both destinations carry it. Read rather than typed, so a test cannot pass
# against values the deployment does not use.
RULE = json.loads((REPO_ROOT / "config" / "local" / "query.json").read_text(encoding="utf-8"))[
    "query"
]["coverage_store"]["run_id"]

# From the table in stores/coverage/layout.md, at the root seed both destinations carry.
PUBLISHED_EXAMPLES = {
    0: "run-000000-7f80b47c7b91",
    1: "run-000001-6ab42ca09e7d",
    2: "run-000002-3c5d9275107d",
    17: "run-000017-3c1aead663b1",
}


def _identifier(sequence: int, *, root_seed: int = 20260826) -> str:
    return run_identifier(root_seed=root_seed, sequence=sequence, **RULE)


@pytest.mark.parametrize("sequence", sorted(PUBLISHED_EXAMPLES))
def test_the_identifier_matches_the_store_layout_worked_example(sequence: int) -> None:
    """The store and the scheduler agree because both compute the same stated function."""
    assert _identifier(sequence) == PUBLISHED_EXAMPLES[sequence]


def test_the_sequence_is_in_the_name_so_a_published_run_can_be_read_back() -> None:
    """What the previous rule cost: a manifest recording a null run_sequence for want of one."""
    assert _identifier(17).split("-")[1] == "000017"


def test_the_same_seed_and_sequence_give_the_same_identifier() -> None:
    assert _identifier(3) == _identifier(3)


def test_a_different_seed_gives_a_different_identifier() -> None:
    """The digest is there so two scenarios cannot collide on a name at the same sequence."""
    assert _identifier(0) != _identifier(0, root_seed=20260827)


def test_a_negative_sequence_is_refused_rather_than_named() -> None:
    with pytest.raises(ValueError, match="count from zero"):
        _identifier(-1)


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
    assert scenario() == [_identifier(index, root_seed=ROOT_SEED) for index in range(4)]
