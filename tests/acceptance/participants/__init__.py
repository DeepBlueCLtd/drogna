"""The two toy participants AT-04's replay scenario runs, and the scenario itself.

Feature 001 T042: two participants, each drawing from a named RNG stream and writing an
output file keyed to tick values rather than to counts of received ticks, driven in
lockstep from one run manifest. The toys are deliberately small — the point is not what
they compute but that what they compute is a pure function of the manifest, which is what
lets ``tests/acceptance/test_at04_deterministic_replay.py`` assert byte-identical output
across two runs and lets ``scripts/replay_proof.py`` demonstrate the same thing from a
clean checkout in one command.
"""

from participants.scenario import (
    SCENARIO_RUN_ID,
    SCENARIO_TICKS,
    ScenarioResult,
    build_manifest,
    run_scenario,
)
from participants.toys import DriftingFloat, NoisySampler, TickOrderError

__all__ = [
    "SCENARIO_RUN_ID",
    "SCENARIO_TICKS",
    "DriftingFloat",
    "NoisySampler",
    "ScenarioResult",
    "TickOrderError",
    "build_manifest",
    "run_scenario",
]
