"""Check a coverage store against the convention, and report every fault rather than the first.

`layout.md` beside this file is the normative account. This program does not restate it: it
calls the catalogue the query layer serves from, so a store this passes is a store the query
layer can read. There is no second implementation of these rules here to disagree with the
first — which matters, because the failure a second implementation produces is a store that
validates and does not serve.

    python stores/coverage/validate_layout.py --config config/local/query.json
    python stores/coverage/validate_layout.py --config config/local/query.json --root <path>

`--root` overrides the root the configuration names, which is what a test and a person
looking at a store on their own machine both need: the configuration names the container's
mount point and neither of them is inside the container.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

# The catalogue is the implementation of the convention, and it lives with the code that is
# deployed rather than with the documentation. Reaching it means putting the query layer's
# package root on the path, which is the same thing the container's PYTHONPATH does.
_QUERY_ROOT = Path(__file__).resolve().parents[2] / "query"
if str(_QUERY_ROOT) not in sys.path:
    sys.path.insert(0, str(_QUERY_ROOT))

from plugins.coverage_catalogue import (  # noqa: E402
    CoverageCatalogue,
    StoreLayout,
    validate_manifest,
)
from plugins.errors import CatalogueError, CoverageStoreError  # noqa: E402

__all__ = ["check_store", "main"]


def check_store(layout: StoreLayout) -> list[str]:
    """Every fault in the store at ``layout.root``, in a stable order."""
    faults: list[str] = []
    if not layout.root.is_dir():
        return [f"there is no coverage store at {layout.root}"]
    if not layout.runs_directory.is_dir():
        faults.append(
            f"the store has no {layout.runs_dirname} directory, so it holds no runs; an "
            f"empty store is served as an empty collection list, but the directory is part "
            f"of the layout"
        )

    catalogue = CoverageCatalogue(layout)
    for run_id, reason in catalogue.incomplete():
        faults.append(f"{run_id} is not catalogued: {reason}")

    permitted = {layout.runs_dirname, layout.staging_dirname, layout.current_pointer}
    for name in sorted(path.name for path in layout.root.iterdir()):
        if name not in permitted and not name.endswith(layout.partial_suffix):
            faults.append(
                f"{name} is at the store root and the layout has no place for it; the root "
                f"holds {layout.runs_dirname}, {layout.staging_dirname} and "
                f"{layout.current_pointer} and nothing else"
            )

    try:
        current = catalogue.current()
    except CatalogueError as error:
        faults.append(error.message)
    else:
        faults.extend(
            f"{current.run_id} is current and {message}"
            for message in _manifest_faults(current.manifest, current.manifest_path.name)
        )

    if not catalogue.entries() and not faults:
        faults.append(
            "the store holds no complete run. That is not an error at start of scenario — "
            "the query layer serves an empty collection list and the client greys the "
            "component — but it is worth saying out loud rather than reporting success."
        )
    return faults


def _manifest_faults(manifest: Any, source: str) -> list[str]:
    try:
        validate_manifest(manifest, source=source)
    except CoverageStoreError as error:
        return [error.message]
    return []


def layout_from_config(config_path: Path, root: Path | None) -> StoreLayout:
    document = json.loads(config_path.read_text(encoding="utf-8"))
    section = dict(document["query"]["coverage_store"])
    if root is not None:
        section["root"] = str(root)
    return StoreLayout.from_config(section)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="a destination's query configuration, which names the layout",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="check this directory instead of the one the configuration names",
    )
    arguments = parser.parse_args(argv)

    layout = layout_from_config(arguments.config, arguments.root)
    faults = check_store(layout)
    if not faults:
        print(f"{layout.root}: the store obeys the convention")
        return 0
    print(f"{layout.root}: {len(faults)} fault(s)", file=sys.stderr)
    for fault in faults:
        print(f"  {fault}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
