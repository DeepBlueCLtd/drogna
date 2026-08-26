"""Assemble the seeding record: the evidence that two instances hold the same content.

A fresh instance and one that has been running for a week must carry the same seeded
content for the same root seed (SRD NFR-07). "Must" is worth little without a way to check
it, so seeding writes a record — the root seed, the version of the seeding driver, a digest
of every configuration file the destination carries, and a digest of every artefact each
seeding step produced — and two instances are compared by comparing their records rather
than by inspecting their stores by hand.

The record carries no timestamp. There is no host time to take (Constitution I), and a
timestamp would in any case make two equivalent instances compare unequal, which is exactly
the comparison the record exists to support.

The record is written whole or not at all. A run interrupted half way leaves no record, so
an interrupted seed can never be mistaken for a completed one.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from destination import (
    SEED_STEP_DIRNAME,
    ConfigurationError,
    config_files,
    deploy_dir,
    destination_dir,
    digest_file,
    load_deployment,
    read_json,
    repository_root,
)

RECORD_VERSION = 1

# Bumped by hand whenever the meaning of the record changes, so that two records written by
# different versions of this driver are never compared as though they agreed.
DRIVER_VERSION = "1.0.0"

STEP_SUFFIX = ".sh"


def seed_steps(root: Path | None = None) -> list[Path]:
    """The seeding steps, in the order they run: lexical, so the order is visible."""
    directory = deploy_dir(root) / SEED_STEP_DIRNAME
    if not directory.is_dir():
        return []
    return sorted(path for path in directory.glob(f"*{STEP_SUFFIX}") if path.is_file())


def root_seed(destination: str, root: Path | None = None) -> int:
    """The run's root seed, taken from the destination's shared configuration.

    Never generated here. A seed the deployment invented would be a seed no one could
    reproduce (Constitution II).
    """
    common = destination_dir(destination, root) / "common.json"
    document = read_json(common)
    try:
        return int(document["seed"]["root"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigurationError(
            f"{common.name}: no integer at seed.root, so there is no root seed to seed with"
        ) from exc


def _artefact_digests(directory: Path) -> dict[str, str]:
    if not directory.is_dir():
        return {}
    digests: dict[str, str] = {}
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            digests[path.relative_to(directory).as_posix()] = digest_file(path)
    return digests


def build_record(destination: str, artefact_dir: Path, root: Path | None = None) -> dict[str, Any]:
    root = root or repository_root()
    deployment = load_deployment(destination, root)
    configuration = {
        path.name: digest_file(path) for path in config_files(destination_dir(destination, root))
    }
    steps = []
    for step in seed_steps(root):
        steps.append(
            {
                "name": step.stem,
                "script_digest": digest_file(step),
                "artefacts": _artefact_digests(artefact_dir / step.stem),
            }
        )
    return {
        "record_version": RECORD_VERSION,
        "driver_version": DRIVER_VERSION,
        "destination": destination,
        "profiles": list(deployment["profiles"]["active"]),
        "root_seed": root_seed(destination, root),
        "configuration": configuration,
        "steps": steps,
        "artefact_count": sum(len(step["artefacts"]) for step in steps),
    }


def serialise(record: dict[str, Any]) -> str:
    """One byte-for-byte representation, so two records compare by their bytes."""
    return json.dumps(record, indent=2, sort_keys=True) + "\n"


def write_record(record: dict[str, Any], path: Path) -> Path:
    """Write the record whole, or not at all."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".partial")
    temporary.write_text(serialise(record), encoding="utf-8")
    os.replace(temporary, path)
    return path


def record_path(destination: str, root: Path | None = None) -> Path:
    root = root or repository_root()
    deployment = load_deployment(destination, root)
    runtime_dir = root / deployment["host_paths"]["runtime_dir"]
    return runtime_dir / deployment["seeding"]["record_filename"]


def artefact_dir(destination: str, root: Path | None = None) -> Path:
    root = root or repository_root()
    deployment = load_deployment(destination, root)
    runtime_dir = root / deployment["host_paths"]["runtime_dir"]
    return runtime_dir / deployment["seeding"]["artefact_dirname"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination")
    parser.add_argument(
        "--print-root-seed",
        action="store_true",
        help="print the root seed and write nothing, so a shell step can pass it down",
    )
    arguments = parser.parse_args(argv)
    try:
        if arguments.print_root_seed:
            print(root_seed(arguments.destination))
            return 0
        record = build_record(arguments.destination, artefact_dir(arguments.destination))
        path = write_record(record, record_path(arguments.destination))
    except (ConfigurationError, KeyError) as exc:
        print(f"could not write the seeding record: {exc}", file=sys.stderr)
        return 1
    print(str(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
