"""A control gate that finds nothing, so the runner can be seen telling the difference.

Part of the runner's control set. A runner that reported "clean" whatever the gates said
would pass every test written against failing gates alone; this one is the other half of
the comparison.
"""

from __future__ import annotations

import argparse

NAME = "alpha"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True)
    parser.parse_args()
    print(f"{NAME}: 0 findings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
