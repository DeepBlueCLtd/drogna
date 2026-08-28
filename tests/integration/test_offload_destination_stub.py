"""The destination the deployment actually starts, exercised over the routes it actually serves.

014 T045. `config/<destination>/offload.json` named `archive` from the day the packager was
written, and nothing answered there: the component could stage a bundle and could never
transfer one. Every test that exercises the transfer path presents its own destination
in-process, which is right for what those tests assert and is exactly why none of them could
notice. This one asserts the deployed article.

**The property under test is that the receipt is worth having.** A destination that echoed
back the digest it was sent would agree with the sender every time, including when the bytes
never arrived — `services/offload/tests/test_verify.py` presents such a destination and
asserts verification refuses it. The stub in `deploy/archive/stub.py` must be the other kind,
and the test below tells the two apart the only way that works: it declares a digest that is
a lie and asserts the destination contradicts it.

The unit half of this — that the route templates in `archive.json` and `offload.json` are the
same three — is in `tests/unit/test_offload_destination_routes.py`, where it needs no
container and fails in a second rather than in a minute.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
for candidate in (
    REPOSITORY_ROOT / "deploy" / "lib",
    REPOSITORY_ROOT / "services" / "offload" / "src",
):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from destination import load_deployment  # noqa: E402
from harness_offload.transfer import HttpDestination, send  # noqa: E402

DESTINATION = "local"

# The profiles that have to be selected together, for the reason `020-features.sh` records:
# Compose refuses a service whose dependency is outside them. `archive` is in `offload`, the
# `offload` service it exists for depends on the broker, and the clock it reads for a
# receipt's simulation instant is in `foundation`.
PROFILES = ("offload", "broker", "foundation")

PAYLOAD = b"a bundle's worth of deliberately fake bytes\n" * 64
TRUE_DIGEST = "sha256:" + hashlib.sha256(PAYLOAD).hexdigest()
A_LIE = "sha256:" + "0" * 64


def _docker_is_reachable() -> bool:
    try:
        return subprocess.run(("docker", "info"), capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


pytestmark = pytest.mark.skipif(
    not _docker_is_reachable(), reason="no container runtime is reachable from this shell"
)


def _compose(*arguments: str, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    profiles: list[str] = []
    for profile in PROFILES:
        profiles += ["--profile", profile]
    return subprocess.run(
        (
            "docker",
            "compose",
            "--file",
            str(REPOSITORY_ROOT / "deploy" / "compose.yaml"),
            "--env-file",
            str(REPOSITORY_ROOT / "deploy" / ".env"),
            *profiles,
            *arguments,
        ),
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=REPOSITORY_ROOT,
    )


@pytest.fixture(scope="module")
def archive() -> Iterator[HttpDestination]:
    """The running stub, or a skip naming what was missing.

    Started here rather than assumed, because `archive` is in the `offload` profile and the
    local destination does not activate it — so a run that assumed it would skip on every
    machine, which is the outcome CLAUDE.md warns is indistinguishable from a clean one.
    """
    if not (REPOSITORY_ROOT / "deploy" / ".env").is_file():
        pytest.skip("no rendered environment; bring the stack up with scripts/run_local.sh")
    started = _compose("up", "--detach", "--wait", "archive", "clock")
    if started.returncode != 0:
        pytest.skip(f"the stub destination could not be started: {started.stderr[-400:]}")

    entry = load_deployment(DESTINATION, REPOSITORY_ROOT)["network"]["publish"]["archive"]
    routes = json.loads(
        (REPOSITORY_ROOT / "config" / DESTINATION / "offload.json").read_text(encoding="utf-8")
    )["offload"]["destination"]["routes"]
    yield HttpDestination(
        identifier="archive",
        endpoint=f"http://{entry['bind']}:{entry['host_port']}",
        routes=routes,
        timeout_seconds=10.0,
    )


def test_a_transfer_reaches_the_deployed_destination_and_is_acknowledged(
    archive: HttpDestination,
) -> None:
    """The three routes, in the order `transfer.send` uses them, against the real container."""
    outcome = send(archive, "b-deployed0001", PAYLOAD, declared_digest=TRUE_DIGEST)

    assert outcome.receipt is not None, (
        "the destination committed the bundle and issued no receipt. Nothing can be evicted "
        "on that, which is safe, but it means the deployed destination is not answering"
    )
    assert outcome.receipt["destination_id"] == "archive"
    assert outcome.receipt["bundle_id"] == "b-deployed0001"
    assert outcome.receipt["byte_count"] == len(PAYLOAD)
    # Present and plausible rather than pinned: it comes from C-01, which is running.
    assert outcome.receipt["sim_time"].endswith("Z")


def test_the_destination_computes_its_own_digest_rather_than_echoing_the_declared_one(
    archive: HttpDestination,
) -> None:
    """The property that makes a receipt evidence rather than a round trip.

    A deliberately wrong declared digest is sent. An echoing destination returns it and
    agrees with a sender whose bytes never arrived; this one must contradict it.
    """
    outcome = send(archive, "b-deployed0002", PAYLOAD, declared_digest=A_LIE)

    assert outcome.receipt is not None
    assert outcome.receipt["digest"] != A_LIE, (
        "the destination echoed the digest it was sent. A receipt that agrees with whatever "
        "it is told proves a request was made and nothing about the bytes"
    )
    assert outcome.receipt["digest"] == TRUE_DIGEST


def test_a_bundle_that_was_never_committed_yields_no_receipt(
    archive: HttpDestination,
) -> None:
    """Nothing to acknowledge, so nothing is acknowledged — and it says so as silence.

    `receipt=None` rather than a transport failure, deliberately: this stub forgets its
    objects on restart, so asking about a bundle it no longer holds is a reachable case, and
    reporting it as "could not be reached" would point at the network. Either answer refuses
    eviction; only one of them is true.
    """
    assert archive.receipt("b-never-sent-at-all") is None
