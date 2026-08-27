"""Say what each service is actually doing, when `compose up --wait` gives up.

This is the message a person reads at the moment a bring-up fails, and for as long as it
existed it could say only one thing. `report_unhealthy` in `deploy/lib/common.sh` asked
`compose ps` for a state and matched it:

    case "${state}" in
      *healthy*|*running*|*exited*) ;;
      "") printf '  %s: no container was created\\n' "${service}" >&2 ;;
      *) printf '  %s: %s\\n' "${service}" "${state}" >&2 ;;
    esac

Every branch that mattered was the empty one. `*healthy*` matches **un**healthy, so a
container whose health check was failing — the single commonest reason to be reading this
message at all — was passed over as fine. `*exited*` skipped a container that had crashed.
And `compose ps` without `--all` does not list an exited container, so the state came back
empty and the reporter said "no container was created" about a container that had been
created, started, and had died.

That is what it said on 27 August 2026, three lines that were all false, directly below the
Compose output announcing the containers it claimed did not exist:

      broker: no container was created
      proxy: no container was created
      query: no container was created

The classification is here rather than in the shell because it can be tested here. A
container runtime is needed to produce this input and none is needed to interpret it, so
`tests/unit/test_service_states.py` feeds it the shapes Compose actually emits — including
the exited proxy above — and no part of the judgement waits on a daemon to be exercised.

Standard library only, like everything else under `deploy/lib`: this runs on the
destination's interpreter, before anything is installed.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


# Compose has emitted `ps --format json` two ways: a single array, and one object per line.
# Both are still in the wild, and a bring-up must not lose its diagnostic to either.
def parse_records(text: str) -> list[dict[str, Any]]:
    stripped = text.strip()
    if not stripped:
        return []
    try:
        document = json.loads(stripped)
    except json.JSONDecodeError:
        records = []
        for line in stripped.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return records
    if isinstance(document, list):
        return [item for item in document if isinstance(item, dict)]
    return [document] if isinstance(document, dict) else []


def describe(service: str, records: list[dict[str, Any]]) -> str | None:
    """How `service` is failing, or None if it is not.

    A service with no health check declared is judged on its state alone; Compose reports
    an empty health for it, and running is as healthy as it is ever going to look.
    """
    mine = [record for record in records if record.get("Service") == service]
    if not mine:
        return "no container was created"

    # A service may legitimately have more than one container. It is failing if any is.
    for record in mine:
        state = str(record.get("State", "")).lower()
        health = str(record.get("Health", "")).lower()
        exit_code = record.get("ExitCode")

        if state == "running" and health in ("", "healthy"):
            continue
        if health == "unhealthy":
            return "running, but its health check is failing"
        if health == "starting":
            return "still starting; its health check had not passed when the wait ran out"
        if state in ("exited", "dead"):
            if exit_code in (None, ""):
                return "the container exited"
            return (
                f"the container exited with status {exit_code}"
                if exit_code != 0
                else "the container exited cleanly, having been expected to stay up"
            )
        if state in ("created", "paused", "restarting", "removing"):
            return f"the container is {state} and never began running"
        return f"{state or 'in an unreported state'}{f' ({health})' if health else ''}"
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("services", nargs="*", help="the services that were expected to run")
    parser.add_argument(
        "--names-only",
        action="store_true",
        help=(
            "print the failing service names alone, one per line, so the caller can fetch "
            "the logs for each. The description is what a person reads; this is what the "
            "shell loops over."
        ),
    )
    arguments = parser.parse_args(argv)

    records = parse_records(sys.stdin.read())
    for service in arguments.services:
        problem = describe(service, records)
        if problem is None:
            continue
        print(service if arguments.names_only else f"  {service}: {problem}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
