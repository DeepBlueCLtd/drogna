"""A health check may only invoke a program its own image carries.

`wget --spider` was the query layer's health check, and `python:3.11-slim-bookworm` ships
neither wget nor curl. So the check could only ever report unhealthy: the container was
serving 200 to anything that asked while Compose waited out the full timeout on a program
that was not there, and every service depending on it never started at all.

It is a particularly quiet failure. A health check that names a missing program does not
error in any log a person reads — the shell inside the container says "not found" to nobody
— it simply never passes, and what a bring-up reports is a timeout somewhere downstream.
The proxy's `host not found in upstream "query"` was three steps from this cause.

So the pairing is checked here instead: every service's health-check command is read out of
`deploy/compose.yaml`, the program it invokes is taken from the front of it, and that
program has to be one the service's own image is known to carry. The image bases are what
decides — alpine images bring busybox and therefore wget; the Python images bring python3
and nothing else — so the table below is about base images rather than about services, which
is the level at which the mistake was made.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import compose_document  # noqa: E402

COMPOSE = REPOSITORY_ROOT / "deploy" / "compose.yaml"

# What each service's image is known to provide. `python:3.11-slim-bookworm` is Debian slim:
# no wget, no curl, no busybox. The proxy and the client are alpine-based and have busybox,
# which is where their wget comes from. Postgres and mosquitto bring their own clients.
PROVIDED: dict[str, frozenset[str]] = {
    "clock": frozenset({"python3", "drogna-healthcheck"}),
    "query": frozenset({"python3", "drogna-healthcheck"}),
    "proxy": frozenset({"wget", "sh", "nginx"}),
    "client": frozenset({"wget", "sh"}),
    "broker": frozenset({"pidof", "sh", "mosquitto_sub", "mosquitto_pub"}),
    "observations": frozenset({"pg_isready", "psql", "sh"}),
    # The upstream Python image, which is the whole of what the stub archive runs on.
    # It ships neither wget nor curl — the exact image CLAUDE.md records a health check
    # failing against — so the probe is python3, and this entry is what holds it to that.
    "archive": frozenset({"python3", "sh"}),
}

# The shell forms Compose accepts, neither of which is the program being run.
_WRAPPERS = frozenset({"CMD", "CMD-SHELL", "sh", "-c"})


def _healthcheck_body(block: str) -> str:
    """The lines under a service's `healthcheck:` key, by indentation rather than by regex."""
    lines = block.splitlines()
    collected: list[str] = []
    inside = False
    for line in lines:
        if line.strip() == "healthcheck:" and len(line) - len(line.lstrip()) == 4:
            inside = True
            continue
        if not inside:
            continue
        if line.strip() and len(line) - len(line.lstrip()) <= 4:
            break
        collected.append(line)
    return "\n".join(collected)


def _health_command(block: str) -> str | None:
    """The command text of a service's health check, however it is spelled in the file."""
    body = _healthcheck_body(block)
    if not body.strip():
        return None
    inline = re.search(r"test:\s*\[(?P<items>.*)\]", body)
    if inline:
        parts = [item.strip().strip("\"'") for item in inline.group("items").split(",")]
        return " ".join(part for part in parts if part not in _WRAPPERS)
    listed = re.search(r"test:\s*\n(?P<items>(?:\s+-\s.*\n)+)", body)
    if listed:
        parts = [
            line.strip()[2:].strip().strip("\"'") for line in listed.group("items").splitlines()
        ]
        return " ".join(part for part in parts if part not in _WRAPPERS)
    return None


def _program(command: str) -> str:
    return command.strip().split()[0] if command.strip() else ""


def test_every_health_check_invokes_a_program_its_image_carries() -> None:
    blocks = compose_document.service_blocks(COMPOSE.read_text(encoding="utf-8"))
    checked: list[str] = []
    findings: list[str] = []
    for service, block in sorted(blocks.items()):
        command = _health_command(block)
        if command is None:
            continue
        program = _program(command)
        if not program:
            continue
        checked.append(service)
        known = PROVIDED.get(service)
        if known is None:
            findings.append(
                f"{service} has a health check and no entry in PROVIDED, so nothing knows "
                "whether its image carries the program it names"
            )
        elif program not in known:
            findings.append(
                f"{service}'s health check runs {program!r}, which its image does not "
                f"carry (it has: {', '.join(sorted(known))}). A check naming a missing "
                "program never passes and never says why; the bring-up reports a timeout "
                "somewhere downstream instead"
            )
    assert checked, "no health check was read out of compose.yaml; this test proved nothing"
    assert not findings, "\n".join(findings)


def test_the_query_layer_does_not_reach_for_wget_again() -> None:
    """The specific one, named, because its image is the one with no shell tools at all."""
    blocks = compose_document.service_blocks(COMPOSE.read_text(encoding="utf-8"))
    command = _health_command(blocks["query"]) or ""
    assert "wget" not in command and "curl" not in command, (
        "the query layer's health check uses wget or curl. python:3.11-slim-bookworm has "
        f"neither, so this check can only report unhealthy: {command!r}"
    )
