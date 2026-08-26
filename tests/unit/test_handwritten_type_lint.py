"""The boundary-type gate is handed a second declaration of a real payload.

Constitution III is enforced in two directions. The drift check covers the easy one —
generated output matching its master. This gate covers the one that actually breaks, where
somebody declares a payload shape beside the code that uses it and nothing regenerates it
ever again. The declarations planted below are of shapes that genuinely exist in
``contracts/schemas/``, so the gate is tested against the real masters rather than against
a fixture of its own devising.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
GATE = SCRIPTS / "check_handwritten_types.py"

HEARTBEAT_MODEL = '''
"""A second declaration of the heartbeat payload, which is what the gate is for."""

from dataclasses import dataclass


@dataclass
class Heartbeat:
    component: str
    sim_time: str
    tick: int
    status: str
    run_id: str
    config_digest: str
    detail: str
'''

HEARTBEAT_INTERFACE = """
export interface Heartbeat {
  component: string;
  sim_time: string;
  tick: number;
  status: string;
  run_id: string;
  config_digest: string;
  detail: string;
}
"""

INTERNAL_STRUCTURE = '''
"""An internal value object that shares a word or two with a payload and nothing else."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Window:
    opened_at_tick: int
    span_ticks: int
    reason: str
'''

ADAPTED_MODEL = """
/** The client's own model of the same document, in the client's own vocabulary. */
export interface RuntimeConfiguration {
  readonly broker: {
    readonly url: string;
    readonly clientId: string;
  };
  readonly clock: {
    readonly staleAfterSeconds: number;
  };
  readonly liveness: {
    readonly defaultWindowSeconds: number;
  };
}
"""

EXEMPTED_MODEL = '''
"""A shape that matches a payload for a reason its author had to write down."""

from dataclasses import dataclass


# harness:allow-handwritten-type a fixture asserting the gate honours a reasoned exemption
@dataclass
class Heartbeat:
    component: str
    sim_time: str
    tick: int
    status: str
    run_id: str
    config_digest: str
    detail: str
'''

BARE_MARKER_MODEL = EXEMPTED_MODEL.replace(
    "# harness:allow-handwritten-type a fixture asserting the gate honours a reasoned exemption",
    "# harness:allow-handwritten-type",
)


def run(tmp_path: Path, name: str, source: str) -> subprocess.CompletedProcess[str]:
    path = tmp_path / name
    path.write_text(source, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(GATE), str(path)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_python_model_of_a_message_payload_is_reported(tmp_path: Path) -> None:
    result = run(tmp_path, "probe_payload.py", HEARTBEAT_MODEL)

    assert result.returncode != 0, f"a second declaration was accepted:\n{result.stdout}"
    assert "heartbeat.schema.json" in result.stdout
    assert "Heartbeat" in result.stdout


def test_a_typescript_interface_for_a_message_payload_is_reported(tmp_path: Path) -> None:
    result = run(tmp_path, "probe_payload.ts", HEARTBEAT_INTERFACE)

    assert result.returncode != 0, f"a second declaration was accepted:\n{result.stdout}"
    assert "heartbeat.schema.json" in result.stdout


def test_an_unrelated_internal_structure_passes(tmp_path: Path) -> None:
    """A gate that fails ordinary code is a gate people learn to ignore."""
    result = run(tmp_path, "probe_internal.py", INTERNAL_STRUCTURE)

    assert result.returncode == 0, result.stdout + result.stderr


def test_a_model_that_renames_as_it_adapts_passes(tmp_path: Path) -> None:
    """The client's own vocabulary is its own model, not a second copy of the document."""
    result = run(tmp_path, "probe_adapted.ts", ADAPTED_MODEL)

    assert result.returncode == 0, result.stdout + result.stderr


def test_an_exemption_with_a_reason_is_honoured(tmp_path: Path) -> None:
    result = run(tmp_path, "probe_exempt.py", EXEMPTED_MODEL)

    assert result.returncode == 0, result.stdout + result.stderr


def test_an_exemption_without_a_reason_exempts_nothing(tmp_path: Path) -> None:
    result = run(tmp_path, "probe_bare.py", BARE_MARKER_MODEL)

    assert result.returncode != 0, "a bare marker silently disabled the gate"


def test_the_repository_is_clean(tmp_path: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(GATE)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
