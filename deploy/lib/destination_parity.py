"""Compare two destinations and report every structural difference between them.

There is one configuration and several destinations. What distinguishes a destination is
its values: the set of files, and the set of keys within each file, must be identical
everywhere. Drift starts on the day the second destination is added, so this check exists
from that day and reports every difference rather than stopping at the first (SRD NFR-06).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from destination import (
    ConfigurationError,
    config_files,
    destination_dir,
    destination_names,
    key_paths,
    read_json,
    repository_root,
)


def compare_destinations(left: str, right: str, root: Path | None = None) -> list[str]:
    """Every structural difference between two destinations, in a stable order."""
    root = root or repository_root()
    left_dir = destination_dir(left, root)
    right_dir = destination_dir(right, root)

    left_files = {path.name for path in config_files(left_dir)}
    right_files = {path.name for path in config_files(right_dir)}

    differences: list[str] = []
    for name in sorted(left_files - right_files):
        differences.append(f"{name}: present in {left}, absent from {right}")
    for name in sorted(right_files - left_files):
        differences.append(f"{name}: present in {right}, absent from {left}")

    for name in sorted(left_files & right_files):
        try:
            left_keys = key_paths(read_json(left_dir / name))
            right_keys = key_paths(read_json(right_dir / name))
        except ConfigurationError as exc:
            differences.append(f"{name}: {exc}")
            continue
        for key in sorted(left_keys - right_keys):
            differences.append(f"{name}: key '{key}' present in {left}, absent from {right}")
        for key in sorted(right_keys - left_keys):
            differences.append(f"{name}: key '{key}' present in {right}, absent from {left}")
    return differences


def compare_all(root: Path | None = None) -> list[str]:
    """Compare every destination against the first, alphabetically."""
    root = root or repository_root()
    names = destination_names(root)
    if len(names) < 2:
        return []
    reference = names[0]
    differences: list[str] = []
    for other in names[1:]:
        differences.extend(compare_destinations(reference, other, root))
    return differences


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destinations", nargs="*", help="two destination names; default all")
    arguments = parser.parse_args(argv)
    try:
        if len(arguments.destinations) == 2:
            differences = compare_destinations(*arguments.destinations)
            compared = " and ".join(arguments.destinations)
        elif not arguments.destinations:
            differences = compare_all()
            compared = ", ".join(destination_names()) or "nothing"
        else:
            parser.error("give two destination names, or none to compare them all")
            return 2
    except ConfigurationError as exc:
        print(f"parity check failed: {exc}", file=sys.stderr)
        return 2

    if differences:
        print("destinations have drifted apart:", file=sys.stderr)
        for difference in differences:
            print(f"  {difference}", file=sys.stderr)
        print(
            f"\n{len(differences)} difference(s). Destinations may differ in values only, "
            f"never in the set of files or the set of keys within a file.",
            file=sys.stderr,
        )
        return 1
    print(f"destinations agree in shape: {compared}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
