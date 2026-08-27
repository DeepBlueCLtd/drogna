#!/usr/bin/env python3
"""Every container directory a component names must be somewhere the deployment mounts.

A component reads its directories from the file named by HARNESS_CONFIG (Constitution IV),
and the deployment decides what is mounted where. Nothing was comparing the two, and they
had drifted apart almost completely: of the fifteen container directories the local
destination's component configurations named, fourteen were under no declared container path
and so under no volume. They are all under one now — one named volume per store, mounted at
the container path ``deployment.container_paths`` declares for it — and this check is
registered in ``scripts/gates.registry`` for both destinations so that the fifteenth cannot
appear quietly.

The failure this prevents is quiet in the worst way. A directory that is not mounted still
*exists* inside a container — it is created on the container's own writable layer — so a
component starts, writes, reads back what it wrote, and passes every test that exercises it
alone. What it does not do is share that directory with anything. A producer and a consumer
in two containers each get their own private copy of a store they both believe is shared,
and the data vanishes when the container is replaced. The system looks assembled and is
not connected.

Only keys whose name ends in ``directory`` or ``_dir`` are examined, so a URL path like
``/query/collections`` or a released prefix like ``/released`` is not mistaken for a
filesystem location. That is deliberately narrow: a check that cried wolf about URL paths
would be turned off.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from destination import destination_dir, repository_root

DIRECTORY_SUFFIXES = ("directory", "_dir")


def _strings(node: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[tuple[str, ...], Any]]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _strings(value, (*path, key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _strings(value, (*path, str(index)))
    else:
        yield path, node


def named_directories(document: Any) -> list[tuple[str, str]]:
    """Every container directory one configuration document names, with where it was found."""
    found: list[tuple[str, str]] = []
    for path, value in _strings(document):
        key = path[-1] if path else ""
        if not key.endswith(DIRECTORY_SUFFIXES):
            continue
        if isinstance(value, str) and value.startswith("/"):
            found.append((".".join(path), value))
    return found


def _covered(value: str, declared: list[str]) -> bool:
    return any(value == root or value.startswith(root.rstrip("/") + "/") for root in declared)


def findings(destination: str, root: Path | None = None) -> list[str]:
    root = (root or repository_root()).resolve()
    directory = destination_dir(destination, root)
    deployment = json.loads((directory / "deployment.json").read_text(encoding="utf-8"))
    declared = sorted(set(deployment["container_paths"].values()))

    reported: list[str] = []
    for path in sorted(directory.glob("*.json")):
        if path.name == "deployment.json":
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for key, value in named_directories(document):
            if not _covered(value, declared):
                reported.append(
                    f"{destination}/{path.name}: {key} is {value}, which is under no path "
                    f"deployment.json declares. Nothing mounts it, so the component will "
                    f"write to its own container's writable layer and share it with nothing."
                )
    return reported


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    destination = arguments[0] if arguments else "local"
    reported = findings(destination)
    for line in reported:
        print(line)
    if reported:
        print(f"mounts: {len(reported)} directory(ies) named but not mounted.")
        return 1
    print(f"mounts: every container directory {destination} names is under a declared path.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
