"""AT-04: the scenario replays deterministically from its seed.

SRD §9 states the criterion in one line and §10 explains why it ranks first: the
deterministic-replay foundations are "the only thing on this list that cannot be
retrofitted". This module is where that claim is either true or not.

What is asserted here is byte equality of the generated field, not similarity. A test
that compared summary statistics, or field values within a tolerance, would pass on a
generator that had quietly become non-deterministic in its low bits, and the whole point
of the criterion is that a replay is the *same run*, not a similar one.

Three of the four assertions below are about the replay succeeding. The fourth is about
it being capable of failing, and it is the one that gives the other three their meaning:
a generator that ignored its seed entirely would satisfy every "same seed, same output"
assertion perfectly.

**Scope.** What this module covers is the environment generator. AT-04 is a claim about
the whole scenario and this is not yet the whole scenario: the control loop, the sensors
and the ingest path each add stochastic behaviour of their own, and each is now built and
replayed by a test in its own package — which is not the same thing as being replayed
*together*, in lockstep, from one seed. Each must be brought under this test rather than
trusted to inherit its result. The gaps are named at the end of this module, with where
each is checked today, so they are visible rather than implied, and this file is the place
they close.

Note also that replay determinism here is reproducibility of *values*. Reproducibility of
*interleaving* between concurrently running components is a stronger claim and is what
ADR-0009's lockstep clock mode exists to provide; when components other than the
generator come under this test, they run in lockstep.
"""

from __future__ import annotations

from typing import Any

from harness_core.rng import configure_run, rng_for
from support import build, small_config


def _world(seed: int | None = None) -> Any:
    document = small_config()
    return build(document, root_seed=seed)


def test_the_same_seed_reproduces_the_field_byte_for_byte() -> None:
    first = _world()
    second = _world()

    assert first.field_payload == second.field_payload
    assert first.field_digest == second.field_digest


def test_the_same_seed_reproduces_the_ground_truth_manifest() -> None:
    """The manifest is what AT-01 and AT-03 score against, so it replays or they cannot."""
    first = _world()
    second = _world()

    assert first.manifest == second.manifest


def test_a_replay_is_unaffected_by_what_the_process_did_beforehand() -> None:
    """Seeding is per run, not ambient.

    A generator that drew from a module-level generator would pass the equality tests
    above while its output depended on whatever else had drawn from that generator first.
    Drawing a thousand values between the two runs is the cheapest way to tell the two
    designs apart, and it is what Constitution II is protecting.
    """
    first = _world()

    configure_run(9_999)
    disturbance = rng_for("acceptance-at04")
    for _ in range(1000):
        disturbance.random()

    second = _world()

    assert first.field_payload == second.field_payload
    assert first.manifest == second.manifest


def test_a_different_seed_produces_a_different_field() -> None:
    """The assertion that gives the other three their meaning.

    Without this, a generator that ignored its seed and emitted a constant field would
    satisfy every replay assertion above, and this module would report determinism it had
    not tested.
    """
    seeded = _world(seed=1)
    other = _world(seed=2)

    assert seeded.field_payload != other.field_payload
    assert seeded.field_digest != other.field_digest
    assert seeded.manifest != other.manifest


def test_the_manifest_records_what_a_replay_needs() -> None:
    """A replay is only possible from what the run wrote down (FR-04, FR-11)."""
    manifest = _world(seed=4_242).manifest

    assert manifest["seed"]["root"] == 4_242
    assert manifest["generator"]["version"]


# Components whose stochastic behaviour is not under *this* test. All four are built now,
# and each has a replay test of its own; what none of them has is a place in a single
# replay of the whole scenario, which is what AT-04 claims. So each entry names the
# component, the draw that would have to match, and where that draw is checked today.
# Naming them is the difference between a known gap and an overlooked one, and this file
# is still the place they close.
NOT_YET_COVERED = (
    "C-04 simulated sensors — measurement noise; replayed per array in "
    "services/sensors/tests/test_sensor.py, and over a whole survey in "
    "tests/acceptance/test_at03_eddy_recovery.py, but not in lockstep with anything else",
    "C-05 ingest client — batching order under backpressure; the batcher's bounds are "
    "advanced deterministically in services/ingest/tests/test_batcher.py, but the order a "
    "loaded path emits in is not replayed anywhere",
    "C-13 model runner — ensemble member perturbation; replayed in "
    "services/model_runner/tests/test_determinism.py and again through the loop in "
    "tests/acceptance/test_at_02_threshold_breach_triggers_run.py, not here",
    "C-15 planner — seeded randomised restarts in route selection; replayed in "
    "services/planner/tests/test_replay.py, not here",
)


def test_the_uncovered_components_are_named_rather_than_forgotten() -> None:
    """A reminder with teeth: AT-04 does not yet cover the whole scenario, and says so."""
    assert NOT_YET_COVERED, "if every component is covered, delete this and say so in the docstring"
