"""Schema documents shipped inside the package, for validation at runtime.

Two copies of masters in ``contracts/schemas/``: this component's configuration schema and
the common sections it references. They are here because Constitution IV requires a
component to validate its configuration before any other I/O, and a component running in a
container has no contracts directory to hand.

The observation master is here for one narrow reason, and not as a second validator. The
configuration schema references its observed-property enumeration rather than restating the
three quantities, so this document has to be resolvable when the configuration is
validated. What a sensor publishes is validated against the Pydantic model generated from
that same master, which is the one definition of the payload both ends of the path hold.

The copies are an output of the generator chain (``scripts/generate_types.sh``), listed in
``contracts/openapi/generators.toml``, and the drift check fails if one diverges from its
master.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "OBSERVATION_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.sensors.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"
# harness:allow-literal-path as above
OBSERVATION_SCHEMA = "observation.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
