"""Schema documents shipped inside the package, for validation at runtime.

Three copies of masters in ``contracts/schemas/``: the generator's own configuration
schema, the ground-truth manifest schema, and the common configuration sections the first
of those references. Tests assert that each copy is byte-identical to its master, so a copy
cannot drift.

The copies exist because Constitution IV requires a component to validate its
configuration as its first operation, before any other I/O, and a component running in a
container has no contracts directory to hand. It cannot be told where one is either: the
one environment variable it reads names its configuration, and a second variable naming a
schema directory would be exactly the drift between destinations that NFR-04 exists to
prevent. So the schemas travel with the code that validates against them, which is also
the only arrangement under which a component and its schema cannot be separately deployed.

This is the pattern :mod:`harness_core.schemas` establishes; it is followed rather than
reinvented. When feature 006's generated-types chain lands, these copies become its
output rather than a manual copy, and the drift tests stay exactly as they are.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "MANIFEST_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.env_generator.schema.json"
# harness:allow-literal-path as above
MANIFEST_SCHEMA = "manifest.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
