"""Schema documents shipped inside the query layer, for validation at startup.

The pattern is :mod:`harness_core.schemas`, followed rather than reinvented: a component
validates its configuration as its first operation, and a container has no ``contracts``
directory to hand. The one environment variable it reads names its configuration; a second
naming a schema directory would be the drift between destinations that NFR-04 exists to
prevent. So the schema travels with the code that validates against it.

One thing here departs from that pattern and should not be allowed to settle.
``config.query.schema.json`` has no master under ``contracts/schemas/``. It belongs there,
by Constitution III and by the repository layout's naming rule for configuration schemas,
and it is written here in the shape it will have when it moves: the same ``$id``, the same
dialect, the same closure and titles. Moving it is a rename plus a run of
``scripts/generate_types.sh``, whose output lands in generated trees this feature does not
own. Until then the copy of ``config.common.schema.json`` beside it is what the ``$ref``s
resolve against, and the test that asserts that copy is byte-identical to its master is
what stops it drifting.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Any

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.query.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
