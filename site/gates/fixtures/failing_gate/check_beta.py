"""A control gate that always finds two things, and exits 1 as the contract requires."""

from __future__ import annotations

import argparse

NAME = "beta"
FOUND = (
    "some/page:12: beta.planted: the first thing this control gate always finds.",
    "some/page:-: beta.planted: the second, so a runner cannot report just one.",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True)
    parser.parse_args()
    for line in FOUND:
        print(line)
    print(f"{NAME}: {len(FOUND)} findings")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
