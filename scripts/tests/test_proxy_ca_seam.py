"""The proxy-CA-seam gate, run against planted violations and against correct definitions.

Each image definition mounts an optional ``proxy_ca`` build secret so that the deployment
can be built inside an ephemeral agent session, where the package index is reached through
a proxy that terminates TLS (SRD NFR-06). The seam is only worth its coverage, and coverage
is what went wrong: it was written at the step in each image that looks like a fetch, and
two steps that also reach the index were left outside it. Both were found one at a time,
each after a full image build.

The discriminating case is the multi-line one, and it is why the clean fixture is written
over five lines rather than one. A ``RUN`` is a single instruction however many lines it
occupies; the secret mount is on the first and the fetch is on the last. A gate that read
the file line by line would report every correct seam in the repository and catch no real
violation at all — it would be worse than absent, because it would be noisy enough to be
switched off.

A separate file from ``test_gates_fail.py`` for the reason given there: that file is
shared, several agents work on this tree at once, and a gate's own tests are the last thing
that should be lost to a merge.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "gates"
GATE = SCRIPTS / "check_proxy_ca_seam.py"


def run(fixture: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    """Copy a fixture out of the test tree and run the gate against it.

    The ``.fixture`` suffix keeps a planted violation out of the repository-wide walk, and
    the copy lands under a neutral name so that nothing about its location can exempt it.
    """
    planted = tmp_path / f"probe_{fixture}"
    shutil.copyfile(FIXTURES / f"{fixture}.fixture", planted)
    return subprocess.run(
        [sys.executable, str(GATE), str(planted)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_fetch_outside_the_seam_is_reported(tmp_path: Path) -> None:
    result = run("proxy_ca_seam_violation.Dockerfile", tmp_path)

    assert result.returncode != 0, "the gate passed a fetch that mounts no proxy_ca secret"
    assert "apk add" in result.stdout + result.stderr


def test_a_fetch_inside_the_seam_is_permitted(tmp_path: Path) -> None:
    """The multi-line case. A gate that fails correct code teaches people to ignore it."""
    result = run("proxy_ca_seam_clean.Dockerfile", tmp_path)

    assert result.returncode == 0, (
        f"the gate rejected a fetch whose instruction does mount the secret, which means "
        f"it is reading lines rather than instructions:\n{result.stdout}{result.stderr}"
    )


def test_a_marker_without_a_reason_exempts_nothing(tmp_path: Path) -> None:
    result = run("proxy_ca_seam_exempt_bare.Dockerfile", tmp_path)

    assert result.returncode != 0, "a bare marker silently disabled the gate"
    assert "no reason" in result.stdout + result.stderr


def test_a_marker_with_a_reason_exempts(tmp_path: Path) -> None:
    result = run("proxy_ca_seam_exempt_with_reason.Dockerfile", tmp_path)

    assert result.returncode == 0, (
        f"a marker carrying a reason did not exempt the step it sits above:\n"
        f"{result.stdout}{result.stderr}"
    )


def test_the_image_definitions_are_clean() -> None:
    """The rule over the real tree, which is what the gate is registered to enforce."""
    result = subprocess.run(
        [sys.executable, str(GATE)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, (
        f"deploy/images carries a build step that reaches the package index without the "
        f"proxy_ca secret:\n{result.stdout}{result.stderr}"
    )
