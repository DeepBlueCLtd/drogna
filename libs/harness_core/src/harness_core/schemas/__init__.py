"""Schema documents shipped with harness_core, for validation at runtime.

``clock.schema.json`` is a copy of the master in ``contracts/schemas/``; a test asserts
the two are byte-identical, so the copy cannot drift. ``heartbeat.schema.json`` has no
master yet — feature 003 owns that name in ``contracts/schemas/`` and must adopt this
shape unchanged.

The copies exist because a component in a container validates what it publishes without
the contracts directory to hand, and because the generated-types chain of feature 006
does not exist yet.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["schema"]


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
