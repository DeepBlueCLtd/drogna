"""Schema documents shipped inside the package, for validation at runtime.

Two copies of masters in ``contracts/schemas/``: this component's configuration schema and
the common sections it references. They are here because Constitution IV requires a
component to validate its configuration before any other I/O, and a component running in a
container has no contracts directory to hand.

The observation message is not among them. This component is the single ingestion seam and
every message is validated before it enters a batch, but against the Pydantic model
generated from the master rather than against a second copy of the schema — so the
publisher and the seam cannot come to disagree about what a valid observation is.

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

__all__ = ["COMMON_CONFIG_SCHEMA", "CONFIG_SCHEMA", "schema"]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.ingest.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
