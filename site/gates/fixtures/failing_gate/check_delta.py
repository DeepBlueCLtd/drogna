"""A control gate that never returns, so the runner's deadline can be watched working.

It blocks on an event nothing will ever set rather than sleeping for a long time: the
point is a gate that has hung, not a gate that is slow, and a wait with no duration says
that unambiguously.
"""

from __future__ import annotations

import argparse
import threading

NAME = "delta"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True)
    parser.parse_args()
    print(f"{NAME}: about to hang")
    threading.Event().wait()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
