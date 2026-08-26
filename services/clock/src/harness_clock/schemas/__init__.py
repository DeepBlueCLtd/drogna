"""Schema documents shipped inside the package, for validation at runtime.

Three copies of masters in ``contracts/schemas/``: the clock's own configuration schema, the
common configuration sections it references, and the run manifest, which this component
writes because it holds the run's identity. All three are written by the generator chain
and compared byte for byte against their masters by ``scripts/check_types_drift.sh``, so a
copy cannot drift.

The copies exist because Constitution IV requires a component to validate its
configuration as its first operation, before any other I/O, and a component running in a
container has no contracts directory to hand. It cannot be told where one is either: the
one environment variable it reads names its configuration, and a second variable naming a
schema directory would be exactly the drift between destinations NFR-04 exists to prevent.
So the schemas travel with the code that validates against them.

This is the pattern :mod:`harness_core.schemas` establishes; it is followed rather than
reinvented.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "RUN_MANIFEST_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.clock.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"
# harness:allow-literal-path as above
RUN_MANIFEST_SCHEMA = "run-manifest.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
