"""The ``drogna-healthcheck`` console script that every Python image ships.

Compose invokes this with no arguments, so it has exactly one thing to work from:
``HARNESS_CONFIG``, the single environment variable each component reads (Constitution
IV). What it can therefore assert is narrow, and saying so plainly matters more than
appearing to check a lot.

It answers *"is this process configured and running?"* — the variable is set, the file
is present, readable, and is a JSON object naming its component. It does not answer
*"is this component doing its job?"*. That is what heartbeats on ``ctl/heartbeat`` are
for, and the client's illumination derives from those and not from this (Constitution
VII, FR-52). A container can be healthy here and still be lit by nothing, which is the
correct division: Compose restarts processes, heartbeats report liveness, and conflating
the two would let a restart policy vouch for a component that is silent.

The check is deliberately schema-free. Each component validates its own configuration
against its own schema at startup and exits non-zero if it fails (Constitution IV), so a
misconfigured component never reaches the point of being health-checked. Repeating that
validation here would mean this module importing every component's schema, which is a
dependency the shared library has no business acquiring.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from harness_core.config import HARNESS_CONFIG_VARIABLE

OK = 0
UNHEALTHY = 1


def check(env: Any = None, stderr: Any = None) -> int:
    """Return the exit code, so the behaviour is testable without a subprocess."""
    env = os.environ if env is None else env
    err = stderr or sys.stderr

    path = env.get(HARNESS_CONFIG_VARIABLE)
    if not path:
        print(f"{HARNESS_CONFIG_VARIABLE} is not set", file=err)
        return UNHEALTHY

    try:
        with open(path, "rb") as handle:
            document = json.loads(handle.read())
    except OSError as exc:
        print(f"{path}: unreadable — {exc.strerror or exc}", file=err)
        return UNHEALTHY
    except json.JSONDecodeError as exc:
        print(f"{path}: not valid JSON — {exc}", file=err)
        return UNHEALTHY

    if not isinstance(document, dict):
        print(f"{path}: expected a JSON object at the top level", file=err)
        return UNHEALTHY

    component = document.get("component")
    identifier = component.get("id") if isinstance(component, dict) else None
    if not identifier:
        print(f"{path}: no component.id", file=err)
        return UNHEALTHY

    return OK


def main() -> int:
    return check()


if __name__ == "__main__":  # pragma: no cover - exercised through the console script
    raise SystemExit(main())
