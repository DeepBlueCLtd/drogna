"""A control gate that cannot run, standing in for the one whose engine is absent here.

The image-text gate needs an optical character recognition engine that continuous
integration has and this container does not. Exit 2 is how it says so, and a runner that
folded exit 2 into either a pass or a finding would be hiding the one outcome that means
"this run proved nothing".
"""

from __future__ import annotations

import argparse
import sys

NAME = "gamma"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True)
    parser.parse_args()
    print(
        f"{NAME}: could not run: the engine this control stands in for is absent.", file=sys.stderr
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
