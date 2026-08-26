#!/usr/bin/env python3
"""Write an OpenAPI document in canonical form.

    scripts/canonicalise_openapi.py <source> <destination>

Used by ``scripts/refresh_query_layer_spec.sh`` on whatever the query layer emits, before
it is vendored. Sorted keys, two-space indent, one trailing newline, LF endings.

This is not tidiness. An emitter is free to order its keys by whatever its dictionary does
on the day, and a refresh whose diff is mostly reordering is a refresh nobody reads — which
means an interface change nobody notices. Canonical form makes the diff of a refresh the
interface's own change log.

The document is otherwise untouched: no key is added, removed or rewritten. A vendored
specification is somebody else's account of their interface, and editing it — even to make
a generator happier — would make it an approximation again (FR-015).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def canonicalise(document: object) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: canonicalise_openapi.py <source> <destination>", file=sys.stderr)
        return 2
    source, destination = Path(argv[0]), Path(argv[1])
    try:
        document = json.loads(source.read_bytes().decode("utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"{source}: {error}", file=sys.stderr)
        return 2
    if not isinstance(document, dict) or "openapi" not in document:
        print(f"{source}: no `openapi` version key; this is not a specification", file=sys.stderr)
        return 2
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(canonicalise(document).encode("utf-8"))
    print(f"wrote {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
