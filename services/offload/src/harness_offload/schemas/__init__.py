"""Schema documents shipped inside the package, for validation at runtime.

Five copies of masters in ``contracts/schemas/``: this component's configuration schema,
the common sections it references, and the two documents it writes and reads at the
destination boundary. Constitution IV requires the configuration to be validated as the
component's first operation, before any other I/O, and a component in a container has no
contracts directory to hand. It cannot be told where one is either — the one environment
variable it reads names its configuration, and a second variable naming a schema directory
would be exactly the drift between destinations that NFR-04 exists to prevent.

The bundle manifest and the receipt are here for a different reason. A sidecar manifest is
validated before the bundle it describes is called staged, and a receipt is validated
before it is allowed to justify anything. Both of those happen far from a contracts
directory too, and the receipt in particular arrives from outside this process: a document
that can cause a file to be deleted is validated against a schema this component carries,
not against one the sender supplies.

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

__all__ = [
    "BUNDLE_MANIFEST_SCHEMA",
    "COMMON_CONFIG_SCHEMA",
    "CONFIG_SCHEMA",
    "RECEIPT_SCHEMA",
    "TELEMETRY_SCHEMA",
    "schema",
]

# harness:allow-literal-path schema documents shipped inside this package, not deployment locations
CONFIG_SCHEMA = "config.offload.schema.json"
# harness:allow-literal-path as above
COMMON_CONFIG_SCHEMA = "config.common.schema.json"
# harness:allow-literal-path as above; the sidecar is validated before a bundle counts as staged
BUNDLE_MANIFEST_SCHEMA = "bundle-manifest.schema.json"
# harness:allow-literal-path as above; a receipt arrives from outside and is checked against this
RECEIPT_SCHEMA = "offload-receipt.schema.json"
# harness:allow-literal-path as above; a report is validated before it is called a report
TELEMETRY_SCHEMA = "offload-telemetry.schema.json"


@cache
def schema(name: str) -> Mapping[str, Any]:
    """Load a packaged schema document by file name."""
    document = resources.files(__name__).joinpath(name).read_text(encoding="utf-8")
    return json.loads(document)
