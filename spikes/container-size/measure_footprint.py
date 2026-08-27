#!/usr/bin/env python3
"""Spike code — throwaway. Not imported by drogna and not promoted into it.

Peak resident set size of importing each component, measured in a fresh interpreter.

Import cost is a floor, not a working set: a component that has served a request holds
more than one that has only started. It is measured here because it is the part of a
service's memory that is decided by its dependency tree, which is the part this spike can
do anything about. The rest — buffers, caches, whatever a request allocates — is a
property of the workload and is not measured.

The three services this cannot reach are the ones drogna does not write: Postgres,
Mosquitto and nginx. Their cost is stated in the finding as unmeasured, and the declared
ceiling is used in its place rather than a number invented here.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

# The component entry points, in the order deploy/compose.yaml declares them. The
# `__main__` submodule rather than the package: every package here is a near-empty
# `__init__`, so importing the package measures the interpreter and nothing else. Each
# `__main__` guards its `main()` behind `if __name__ == "__main__"`, which does not fire
# under an import, so this loads the dependency tree without starting the component.
#
# `harness_features` is absent deliberately. deploy/compose.yaml names it as the
# `features` service's HARNESS_SERVICE, and no such package exists in the workspace —
# see the finding.
COMPONENTS = [
    "harness_clock.__main__",
    "harness_env_generator.__main__",
    "harness_sensors.__main__",
    "harness_ingest.__main__",
    "harness_monitor.__main__",
    "harness_scheduler.__main__",
    "harness_model_runner.__main__",
    "harness_publisher.__main__",
    "harness_planner.__main__",
    "harness_telemetry.__main__",
    "harness_offload.__main__",
]

# The query layer's tree, measured separately: it is installed by a different image from a
# different requirements file, and it is where the weight is.
QUERY_MODULES = ["pygeoapi", "shapely", "pyproj", "numpy", "babel", "rasterio", "sqlalchemy"]

_PROBE = """
import importlib
import resource
try:
    importlib.import_module({module!r})
except Exception as error:
    print("ERROR", type(error).__name__, error)
    raise SystemExit(1)
print(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
"""


def peak_megabytes(module: str, interpreter: str) -> tuple[float | None, str]:
    result = subprocess.run(
        [interpreter, "-c", _PROBE.format(module=module)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stdout + result.stderr).strip().splitlines()
        return None, detail[-1] if detail else "failed"
    # ru_maxrss is kilobytes on Linux.
    return int(result.stdout.strip()) / 1024.0, ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--interpreter",
        default=sys.executable,
        help="the interpreter to probe in; point it at the query closure to measure that",
    )
    parser.add_argument("--query", action="store_true", help="probe the query layer tree")
    arguments = parser.parse_args()

    modules = QUERY_MODULES if arguments.query else COMPONENTS
    baseline, _ = peak_megabytes("sys", arguments.interpreter)
    print(f"bare interpreter{'':<28}{baseline:7.1f} MB")
    print("-" * 60)
    report = {"baseline_mb": baseline, "modules": {}}
    for module in modules:
        value, detail = peak_megabytes(module, arguments.interpreter)
        if value is None:
            print(f"{module:<44}{'—':>7}    {detail}")
            report["modules"][module] = None
        else:
            print(f"{module:<44}{value:7.1f} MB")
            report["modules"][module] = round(value, 1)
    print(json.dumps(report, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
