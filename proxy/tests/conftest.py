"""The repository root on the path, so that ``proxy`` imports as the package it is.

``proxy/`` is a directory of configuration and a renderer rather than an installed
workspace member — there is nothing here for another component to import, and making it a
distributable package to satisfy a test would be the tail wagging the dog. ``query/`` is
arranged the same way and its tests do the same thing.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))
