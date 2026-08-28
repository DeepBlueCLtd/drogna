"""AT-04: the scenario replays deterministically from its seed.

SRD §9 states the criterion in one line and §10 explains why it ranks first: the
deterministic-replay foundations are "the only thing on this list that cannot be
retrofitted". This module is where that claim is either true or not.

What is asserted here is byte equality, not similarity. A test that compared summary
statistics, or field values within a tolerance, would pass on a generator that had
quietly become non-deterministic in its low bits, and the whole point of the criterion is
that a replay is the *same run*, not a similar one.

**Scope.** Two things are scored, and they are different claims deliberately kept side by
side. The first is the environment generator's reproducibility of values, which is what
this module scored alone for most of its life. The second — added with 001 T042 — is the
claim AT-04 was written for: a *scenario* of two participants, run in lockstep from one
run manifest, producing byte-identical output files across two runs. The participants are
toys (``tests/acceptance/participants/``), and that is the point: the mechanism under
test is the manifest, the seed derivation and the lockstep barrier, not the participants'
arithmetic. The real loop components are each replayed by a test in their own package but
are not yet run *together, in lockstep, from one seed* — those gaps are named at the end
of this module rather than implied, and this file is the place they close.

Note that replay determinism for the generator is reproducibility of *values*.
Reproducibility of *interleaving* between components is the stronger claim, it is what
ADR-0009's lockstep mode exists to provide, and the scenario tests below run under it:
tick ``n + 1`` is not emitted until every participant has acknowledged tick ``n``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from harness_core.clock import ParticipantRole
from harness_core.clock_service import ClockEngine, ClockSettings
from harness_core.manifest import RunManifest, compare_manifests
from harness_core.rng import configure_run, rng_for
from participants import SCENARIO_TICKS, build_manifest, run_scenario
from support import build, small_config


def _world(seed: int | None = None) -> Any:
    document = small_config()
    return build(document, root_seed=seed)


# --- the environment generator's values -------------------------------------------------------


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
    """The assertion that gives the replay assertions their meaning.

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


# --- the two-participant lockstep scenario (T042) ---------------------------------------------


def _replay(out_dir: Path, *, seed: int = 4_242, **kwargs: Any):
    """Run the scenario the way a replaying process would: from the serialised manifest.

    The manifest is round-tripped through JSON before every run, so what the run reads is
    the document — the thing FR-11 says is sufficient — and never a live object the
    previous run might have left something on.
    """
    document = json.loads(json.dumps(build_manifest(seed).as_document()))
    return run_scenario(RunManifest.from_document(document), out_dir, **kwargs)


def test_the_scenario_replays_byte_for_byte_from_one_manifest(tmp_path: Path) -> None:
    """US5 scenario 3: two runs from one manifest, output files compared byte for byte."""
    first = _replay(tmp_path / "first")

    # Disturb the process's ambient randomness between the runs, for the same reason the
    # generator test above does: a scenario drawing from anything the manifest does not
    # derive would pass a bare run-twice comparison and fail only in production.
    configure_run(9_999)
    disturbance = rng_for("acceptance-at04.scenario")
    for _ in range(1000):
        disturbance.random()

    second = _replay(tmp_path / "second")

    assert first.output_bytes() == second.output_bytes()
    for path in first.output_paths:
        assert len(path.read_bytes().splitlines()) == SCENARIO_TICKS
    assert first.digests() == second.digests()


def test_the_two_manifests_differ_only_in_fields_declared_non_reproducible(
    tmp_path: Path,
) -> None:
    """US5 scenario 3's second half: the finished manifests, compared field for field."""
    first = _replay(tmp_path / "first")
    second = _replay(tmp_path / "second")

    differing = compare_manifests(first.manifest.as_document(), second.manifest.as_document())

    assert differing == ()


def test_tick_n_plus_one_is_emitted_only_after_both_acknowledgements() -> None:
    """US5 scenario 1: the lockstep barrier, observed holding and observed releasing."""
    manifest = build_manifest(4_242)
    engine = ClockEngine(ClockSettings(**manifest.clock_settings()))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    engine.register("beta", ParticipantRole.LOCKSTEP)

    first = engine.advance()
    assert first is not None and first.index == 0

    engine.acknowledge("alpha", 0)
    assert engine.advance() is None, "the clock advanced past an outstanding participant"
    stall = engine.stall()
    assert stall is not None and stall.outstanding == ("beta",)

    engine.acknowledge("beta", 0)
    second = engine.advance()
    assert second is not None and second.index == 1, "no tick may be skipped by a stall"


def test_a_redelivered_tick_changes_no_byte(tmp_path: Path) -> None:
    """T042's wording, made falsifiable: output is keyed to tick values, not receipt counts.

    Every seventh tick is delivered twice — the shape a retrying transport produces — and
    the output files must be identical to a run in which every tick arrived once. A
    participant that numbered its records by receipt count, or drew once per delivery,
    fails here and nowhere else.
    """
    plain = _replay(tmp_path / "plain")
    redelivered = _replay(tmp_path / "redelivered", redeliver_every=7)

    assert plain.output_bytes() == redelivered.output_bytes()


def test_a_different_seed_changes_every_participant_output(tmp_path: Path) -> None:
    """The scenario's capable-of-failing assertion, mirroring the generator's above."""
    seeded = _replay(tmp_path / "seeded", seed=1)
    other = _replay(tmp_path / "other", seed=2)

    for first, second in zip(seeded.output_bytes(), other.output_bytes(), strict=True):
        assert first != second


def test_the_scenario_manifest_is_sufficient_replay_input() -> None:
    """What the two runs read is the document alone, and the document names everything."""
    document = build_manifest(4_242).as_document()

    assert document["root_seed"] == 4_242
    assert document["seed_derivation"]["rule"]
    assert document["clock"]["mode"] == "lockstep"
    assert [participant["id"] for participant in document["participants"]] == ["alpha", "beta"]
    assert document["streams"] == ["participants.alpha", "participants.beta"]


# Components whose stochastic behaviour is not under *this* test. All four are built, and
# each has a replay test of its own; what none of them has is a place in the single
# lockstep replay above, which still runs toy participants rather than the real loop.
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
    """A reminder with teeth: the lockstep replay runs toys, not the loop, and says so."""
    assert NOT_YET_COVERED, "if every component is covered, delete this and say so in the docstring"
