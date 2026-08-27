"""Schema documents shipped inside the package, for validation at runtime.

Two copies of masters in ``contracts/schemas/``: this component's configuration schema and
the common sections it references. Constitution IV requires the configuration to be
validated as the component's first operation, before any other I/O, and a component in a
container has no contracts directory to hand. It cannot be told where one is either — the
one environment variable it reads names its configuration, and a second variable naming a
schema directory would be exactly the drift between destinations that NFR-04 exists to
prevent.

There is deliberately no copy of ``plan.schema.json`` here. The planner is the only
producer of that shape, and it builds every payload through the model generated from the
master, so a packaged copy would be a second document with nothing to check against and
one more thing to drift (Constitution III).

The copies are an output of ``scripts/generate_types.sh``, listed in
``contracts/openapi/generators.toml``, so ``scripts/check_types_drift.sh`` fails before a
copy can drift from its master.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.planner.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
