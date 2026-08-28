"""Reset, then reseed, produces the seeding record of a freshly created instance. 005 T028.

`deploy/README.md` has carried this claim since the deployment was written, together with
the four commands that check it:

    scripts/seed.sh local
    cp deploy/.runtime/seeding-record.json /somewhere
    scripts/reset.sh local
    diff /somewhere deploy/.runtime/seeding-record.json

"This has been run from this checkout and the records match." It was a human ritual, which
means it was true on the day somebody typed it and said nothing about any day since — and
NFR-07 is the requirement it stands for. This is that ritual, run by the build.

**What makes the comparison possible is what the record deliberately leaves out.** It
carries no timestamp: there is no host time to take (Constitution I), and a timestamp would
make two equivalent instances compare unequal, which is the opposite of what the record is
for. So equivalence is a byte comparison and not a field-by-field one with exceptions, and
an exception list is exactly where a real difference would eventually hide.

**A record that says nothing would compare equal to another record that says nothing.**
That is the way this test could pass while proving nothing, so it is closed first: before
the two records are compared they are required to describe seeding that actually happened —
every installed step present, each with at least one artefact, each artefact digested. Two
empty records are a failure here, not a pass. `deploy/README.md` used to say "today there
are no seeding steps", which was the state in which this test would have been worthless;
there are two now, and the assertion is written so that dropping back to none is a failure
rather than a silent success.

**The stack is left up.** Not torn down at the end, because a healthy seeded stack is
precisely the postcondition `reset.sh` promises, and discarding it would throw away the
thing that was just proved.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

from destination import load_deployment  # noqa: E402

DESTINATION = "local"
SCRIPTS = REPOSITORY_ROOT / "scripts"

# Generous, and it has to be: this drives two full bring-ups and two seeding runs, and a
# cold image build is inside the first of them.
TIMEOUT_SECONDS = 1800


def _docker_is_reachable() -> bool:
    try:
        return subprocess.run(("docker", "info"), capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


pytestmark = pytest.mark.skipif(
    not _docker_is_reachable(), reason="no container runtime is reachable from this shell"
)


def run(script: str, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        (str(SCRIPTS / script), *arguments),
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
        cwd=REPOSITORY_ROOT,
    )


def record_path() -> Path:
    deployment = load_deployment(DESTINATION, REPOSITORY_ROOT)
    runtime = REPOSITORY_ROOT / deployment["host_paths"]["runtime_dir"]
    return runtime / deployment["seeding"]["record_filename"]


def installed_steps() -> list[str]:
    """The seeding steps on disk, which is what the record is required to account for."""
    return sorted(p.stem for p in (REPOSITORY_ROOT / "deploy" / "seed.d").glob("*.sh"))


def describes_real_seeding(record: dict[str, Any]) -> list[str]:
    """Why this record could not stand in for a seeded instance, or nothing."""
    complaints: list[str] = []
    steps = {step["name"]: step for step in record.get("steps", [])}
    expected = installed_steps()
    if not expected:
        complaints.append(
            "no seeding steps are installed, so two records would compare equal by both "
            "being empty and this test would prove nothing"
        )
    for name in expected:
        step = steps.get(name)
        if step is None:
            complaints.append(f"the record does not account for the installed step {name}")
            continue
        artefacts = step.get("artefacts") or {}
        if not artefacts:
            complaints.append(f"step {name} recorded no artefact, so it digested nothing")
        for artefact, digest in artefacts.items():
            if not str(digest).startswith("sha256:"):
                complaints.append(f"step {name}: {artefact} carries no digest ({digest!r})")
    if not record.get("configuration"):
        complaints.append("the record digests no configuration file")
    return complaints


@pytest.fixture(scope="module")
def a_freshly_created_instance() -> str:
    """Down with volumes, up, seed — an instance created from nothing. Its record, as text."""
    run("down.sh", DESTINATION, "--volumes")

    brought_up = run("up.sh", DESTINATION)
    assert brought_up.returncode == 0, brought_up.stdout + brought_up.stderr
    seeded = run("seed.sh", DESTINATION)
    assert seeded.returncode == 0, seeded.stdout + seeded.stderr

    return record_path().read_text(encoding="utf-8")


def test_the_fresh_record_describes_seeding_that_actually_happened(
    a_freshly_created_instance: str,
) -> None:
    """Closed before the comparison, because two empty records compare equal."""
    complaints = describes_real_seeding(json.loads(a_freshly_created_instance))

    assert complaints == [], (
        "the seeding record does not describe a seeded instance, so comparing it against "
        "another one would prove nothing: " + "; ".join(complaints)
    )


def test_reset_then_reseed_reproduces_the_record_of_a_fresh_instance(
    a_freshly_created_instance: str,
) -> None:
    """NFR-07, as `deploy/README.md` states it, compared byte for byte."""
    reset = run("reset.sh", DESTINATION)
    assert reset.returncode == 0, reset.stdout + reset.stderr

    after_reset = record_path().read_text(encoding="utf-8")

    assert after_reset == a_freshly_created_instance, (
        "the reset instance's seeding record differs from a freshly created one's. The "
        "record carries no timestamp and no host-derived value, so a difference here is a "
        "difference in what was seeded — a step that is not idempotent, or that draws "
        "something the root seed does not fix.\n\nfresh:\n"
        + a_freshly_created_instance
        + "\nafter reset:\n"
        + after_reset
    )


def test_the_reset_instance_is_up_and_seeded_rather_than_merely_equal(
    a_freshly_created_instance: str,
) -> None:
    """Reset promises a running instance, not a matching file.

    Without this, a `reset.sh` that removed the volumes, failed to bring anything up and
    left the previous record in place would satisfy the comparison above.
    """
    states = subprocess.run(
        (
            "docker",
            "compose",
            "--file",
            str(REPOSITORY_ROOT / "deploy" / "compose.yaml"),
            "--env-file",
            str(REPOSITORY_ROOT / "deploy" / ".env"),
            "ps",
            "--format",
            "{{.Service}} {{.Health}}",
        ),
        capture_output=True,
        text=True,
        timeout=120,
        cwd=REPOSITORY_ROOT,
    )
    assert states.returncode == 0, states.stderr
    reported = dict(line.split(maxsplit=1) for line in states.stdout.split("\n") if line.strip())

    assert reported, "reset left nothing running"
    for service, health in reported.items():
        assert health == "healthy", f"after reset, service {service} reported {health}"
