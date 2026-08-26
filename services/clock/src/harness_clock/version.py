"""What this component calls itself, and which code it is.

``CLOCK_VERSION`` is the fallback build identifier for the run manifest's code version,
used where configuration names no revision. A manifest that records it rather than a
commit is saying plainly that the code it describes is a working tree, and the
byte-identical replay claim does not hold against a working tree.
"""

from __future__ import annotations

__all__ = ["CLOCK_NAME", "CLOCK_VERSION"]

CLOCK_NAME = "clock"
CLOCK_VERSION = "0.1.0"
