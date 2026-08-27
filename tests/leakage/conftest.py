"""This directory on the path, so its modules import as themselves.

``tests/leakage/`` is a release gate rather than a package: it runs over an artefact, it can
be pointed at a candidate bundle produced elsewhere, and nothing imports it. It is on the
path here and in ``scripts/check_leakage.py``, and in no third place.
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPOSITORY_ROOT = HERE.parents[1]

for candidate in (HERE, REPOSITORY_ROOT):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))
