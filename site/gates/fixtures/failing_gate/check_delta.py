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
    # flush=True is the whole point of this line. The runner's deadline test asserts that
    # what a gate managed to say before it hung is not thrown away, and stdout to a pipe is
    # block-buffered: without the flush the text never leaves this process, is lost when the
    # deadline kills it, and the assertion passes or fails on buffer timing rather than on
    # the property. It passed locally and failed in CI for exactly that reason.
    print(f"{NAME}: about to hang", flush=True)
    threading.Event().wait()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
