"""The two-participant lockstep scenario: one manifest in, two output files out.

This is the scenario 001 T042 describes and the one AT-04 finally scores. The driver
takes a :class:`~harness_core.manifest.RunManifest` — nothing else — configures the run's
randomness from its root seed, builds a :class:`~harness_core.clock_service.ClockEngine`
from its clock section, registers both participants as lockstep participants, and turns
the clock. Every tick is delivered to both participants and acknowledged by both before
the engine will emit the next, which is the barrier User Story 5's first acceptance
scenario names.

Redelivery is part of the scenario on purpose. When ``redeliver_every`` is set, every
n-th tick is delivered to both participants twice before it is acknowledged — the shape a
retrying transport produces — and because the participants key their records to tick
values rather than to counts of received ticks, the output files must not change by a
byte. That is the claim T042's wording puts in the participants, and the redelivery run
is what makes it falsifiable.

The driver is deliberately transport-free: no broker, no HTTP, no sleeping. Determinism
of *values* is the generator's business; determinism of *interleaving* is the lockstep
barrier's, and both are exercised here in one process so that the acceptance test and
``scripts/replay_proof.py`` run the identical code path.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from harness_core.clock import ClockMode, ParticipantRole, SimInstant
from harness_core.clock_service import ClockEngine, ClockSettings
from harness_core.manifest import ExitState, ManifestParticipant, RunManifest
from harness_core.rng import DERIVATION_RULE, DERIVATION_VERSION, configure_run

from participants.toys import DriftingFloat, NoisySampler

__all__ = [
    "SCENARIO_RUN_ID",
    "SCENARIO_TICKS",
    "ScenarioResult",
    "build_manifest",
    "run_scenario",
]

SCENARIO_RUN_ID = "replay-proof"
SCENARIO_TICKS = 1_000
"""The independent test for User Story 5 asks for at least 1,000 ticks, so 1,000 it is."""

_EPOCH = "2026-01-01T00:00:00.000000Z"
_TICK_INTERVAL_US = 60_000_000  # one simulation minute per tick
_PARTICIPANT_IDS = ("alpha", "beta")


def _config_digest(participant_id: str) -> str:
    """The digest of a participant's (toy) configuration: its identity and its stream.

    A real participant hashes the config file it started from; a toy's whole
    configuration is its identity, so that is what is hashed. Deterministic, so the
    manifest survives a field-for-field comparison between two runs.
    """
    document = json.dumps(
        {"participant": participant_id, "stream": f"participants.{participant_id}"},
        sort_keys=True,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(document).hexdigest()


def build_manifest(root_seed: int) -> RunManifest:
    """The scenario's run manifest: the whole of what a replay is allowed to read."""
    settings = ClockSettings(
        run_id=SCENARIO_RUN_ID,
        epoch=SimInstant.from_iso(_EPOCH),
        tick_interval_us=_TICK_INTERVAL_US,
        mode=ClockMode.LOCKSTEP,
        rate=1.0,
    )
    return RunManifest(
        run_id=SCENARIO_RUN_ID,
        root_seed=root_seed,
        seed_rule=DERIVATION_RULE,
        seed_rule_version=DERIVATION_VERSION,
        clock=settings.as_manifest_section(),
        code_revision="in-tree",
        participants=tuple(
            ManifestParticipant(
                id=participant_id,
                role=ParticipantRole.LOCKSTEP,
                config_digest=_config_digest(participant_id),
                registered_tick=None,
            )
            for participant_id in _PARTICIPANT_IDS
        ),
        streams=tuple(f"participants.{participant_id}" for participant_id in _PARTICIPANT_IDS),
    )


@dataclass(frozen=True)
class ScenarioResult:
    """Where the run wrote its outputs, and the manifest it finished with."""

    output_paths: tuple[Path, ...]
    manifest: RunManifest

    def output_bytes(self) -> tuple[bytes, ...]:
        return tuple(path.read_bytes() for path in self.output_paths)

    def digests(self) -> dict[str, str]:
        return {
            path.name: "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
            for path in self.output_paths
        }


def run_scenario(
    manifest: RunManifest,
    out_dir: Path,
    *,
    ticks: int = SCENARIO_TICKS,
    redeliver_every: int | None = None,
) -> ScenarioResult:
    """Run the scenario once, from the manifest and from nothing else.

    ``configure_run`` is called here, from the manifest's root seed, exactly as a
    replaying process would call it — so running twice in one process replays from
    scratch rather than continuing the first run's sequences.
    """
    configure_run(manifest.root_seed)
    engine = ClockEngine(ClockSettings(**manifest.clock_settings()))
    toys = (DriftingFloat(), NoisySampler())
    for toy in toys:
        engine.register(toy.participant_id, ParticipantRole.LOCKSTEP)

    final_tick = None
    for _ in range(ticks):
        tick = engine.advance()
        if tick is None:
            stall = engine.stall()
            raise RuntimeError(stall.message() if stall else "the clock refused to advance")
        deliveries = 2 if redeliver_every and tick.index % redeliver_every == 0 else 1
        for toy in toys:
            for _ in range(deliveries):
                toy.receive(tick)
            engine.acknowledge(toy.participant_id, tick.index)
        final_tick = tick.index

    out_dir.mkdir(parents=True, exist_ok=True)
    paths = tuple(toy.write_output(out_dir / f"{toy.participant_id}.jsonl") for toy in toys)
    finished = RunManifest(
        run_id=manifest.run_id,
        root_seed=manifest.root_seed,
        seed_rule=manifest.seed_rule,
        seed_rule_version=manifest.seed_rule_version,
        clock=manifest.clock,
        code_revision=manifest.code_revision,
        code_dirty=manifest.code_dirty,
        participants=manifest.participants,
        streams=manifest.streams,
        exit_state=ExitState.COMPLETED,
        final_tick=final_tick,
    )
    return ScenarioResult(output_paths=paths, manifest=finished)
