"""Bringing the stack up, twice, and failing readably when the host cannot oblige.

These exercise the real scripts against a real container runtime. They are skipped where no
runtime is reachable, which is honest: the assertions mean nothing without one, and a test
that silently passes without one would be worse than no test.
"""

from __future__ import annotations

import socket
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

from destination import load_deployment  # noqa: E402

DESTINATION = "local"
SCRIPTS = REPOSITORY_ROOT / "scripts"
BRING_UP_TIMEOUT_SECONDS = 900


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
        timeout=BRING_UP_TIMEOUT_SECONDS,
        cwd=REPOSITORY_ROOT,
    )


def compose(*arguments: str) -> str:
    result = subprocess.run(
        (
            "docker",
            "compose",
            "--file",
            str(REPOSITORY_ROOT / "deploy" / "compose.yaml"),
            "--env-file",
            str(REPOSITORY_ROOT / "deploy" / ".env"),
            *arguments,
        ),
        capture_output=True,
        text=True,
        timeout=120,
        cwd=REPOSITORY_ROOT,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture(scope="module", autouse=True)
def leave_nothing_behind() -> Iterator[None]:
    yield
    run("down.sh", DESTINATION, "--volumes")


def test_a_bring_up_from_nothing_reaches_health() -> None:
    run("down.sh", DESTINATION, "--volumes")

    result = run("up.sh", DESTINATION)

    assert result.returncode == 0, result.stdout + result.stderr
    states = compose("ps", "--format", "{{.Service}} {{.Health}}").split("\n")
    reported = dict(line.split(maxsplit=1) for line in states if line.strip())
    assert reported, "the active profile started nothing"
    for service, health in reported.items():
        assert health == "healthy", f"service {service} reported {health}"


def test_the_advertised_address_comes_from_configuration() -> None:
    result = run("up.sh", DESTINATION)

    deployment = load_deployment(DESTINATION, REPOSITORY_ROOT)
    assert deployment["public_url"]["host"] in result.stdout


def test_a_second_bring_up_converges_rather_than_failing() -> None:
    """A stack that is already up is the normal case, not an error."""
    before = compose("ps", "--services")

    result = run("up.sh", DESTINATION)

    assert result.returncode == 0, result.stdout + result.stderr
    assert compose("ps", "--services") == before


def test_the_active_profile_starts_exactly_its_services_and_no_other() -> None:
    selected = sorted(line for line in compose("config", "--services").split() if line)
    running = sorted(line for line in compose("ps", "--services").split() if line)

    assert running == selected


def test_an_occupied_port_fails_before_anything_starts() -> None:
    """Docker's own message names the port and nothing else. This one names the key too."""
    run("down.sh", DESTINATION)
    deployment = load_deployment(DESTINATION, REPOSITORY_ROOT)
    publish = deployment["network"]["publish"]
    selected = [line for line in compose("config", "--services").split() if line in publish]
    if not selected:
        pytest.skip("no service in the active profile publishes a port to the host")
    entry = publish[selected[0]]

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as squatter:
        squatter.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        squatter.bind((entry["bind"], entry["host_port"]))
        squatter.listen(1)
        result = run("up.sh", DESTINATION)

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert str(entry["host_port"]) in combined
    assert "network.publish" in combined
    assert "nothing was started" in combined
