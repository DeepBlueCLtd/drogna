"""Schema documents shipped inside the proxy, for validation at startup.

The pattern is :mod:`harness_core.schemas`, followed rather than reinvented: a component
validates its configuration as its first operation, and a container has no ``contracts``
directory to hand. The one environment variable it reads names its configuration; a second
naming a schema directory would be the drift between destinations that NFR-04 exists to
prevent. So the schema travels with the code that validates against it.

Both files are copies, and neither is edited here. ``contracts/openapi/generators.toml``
names them under ``[[copy]]``, ``scripts/generate_types.sh`` writes them, and
``scripts/check_types_drift.sh`` compares them byte for byte with their masters. A copy
that has drifted fails the build before anything reads it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.proxy.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
